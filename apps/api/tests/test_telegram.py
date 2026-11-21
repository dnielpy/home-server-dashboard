import asyncio
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients.upstream import Upstream, Upstreams
from app.config import Settings
from app.main import app
from app.telegram import EXPIRED, NOT_A_LINK, UNAVAILABLE, StateError, TelegramBot, TelegramStore, get_telegram
from app.telegram_messages import (
    battery_message,
    downloads_message,
    help_message,
    internet_message,
    server_message,
    stats_message,
)

NOW = datetime(2026, 11, 20, 18, 30, tzinfo=UTC)
TOKEN = "123456:dummy-private-token"
OWNER = 42


def update(number=1, text="/stats", user=OWNER, chat_type="private", chat_id=OWNER):
    return {"update_id": number, "message": {"date": int(datetime.now(UTC).timestamp()), "text": text, "from": {"id": user}, "chat": {"id": chat_id, "type": chat_type}}}


def readings(*, ac=False, status="discharging", age=0, online=True, **estimate):
    return {
        "/power-status": {"receiving_ac": ac, "current_since": "2026-11-19T12:00:00Z"},
        "/data-summary": {"items": [{"date": (NOW - timedelta(seconds=age)).isoformat(), "battery_percent": 76, "ac_output": 120, "ac": ac}]},
        "/battery-estimate": {
            "status": status, "soc": 76, "load_w": 123.5, "reserve_percent": 20,
            "eta": (NOW + timedelta(hours=3.5)).isoformat(), "hours_left": 3.5, **estimate,
        },
        "/connection/latest": {"checked_at": (NOW - timedelta(seconds=age)).isoformat(), "online": online},
    }


def upstreams(routes):
    calls = []

    def handle(request):
        calls.append(request.url.path)
        body = routes.get(request.url.path)
        if isinstance(body, Exception):
            raise body
        if callable(body):
            return body(request)
        return httpx.Response(200, json=body)

    def client(name):
        return Upstream(name, httpx.AsyncClient(base_url=f"http://{name}", transport=httpx.MockTransport(handle)))

    return Upstreams(*(client(name) for name in ("bluetti", "homenet", "localtube", "agent", "videodownloader"))), calls


class TelegramServer:
    def __init__(self):
        self.calls = []
        self.sent = []
        self.batches = asyncio.Queue()
        self.failures = {}
        self.identity = {"id": 123456, "first_name": "Casa", "username": "home_stats_bot"}

    async def handle(self, request):
        method = request.url.path.rsplit("/", 1)[-1]
        body = json.loads(request.content)
        self.calls.append((method, body))
        failures = self.failures.get(method, [])
        if failures:
            error = failures.pop(0)
            if isinstance(error, Exception):
                raise error
            return error
        if method == "getMe":
            result = self.identity
        elif method == "getUpdates":
            result = await self.batches.get()
        elif method == "sendMessage":
            self.sent.append(body)
            result = {"message_id": len(self.sent)}
        else:
            result = True
        return httpx.Response(200, json={"ok": True, "result": result})


def make_bot(root, server, routes=None, **settings):
    sources, calls = upstreams(readings() if routes is None else routes)
    config = Settings(_env_file=None, **{
        "telegram_state_dir": str(root), "telegram_bot_token": TOKEN, "telegram_owner_user_id": OWNER, **settings,
    })
    bot = TelegramBot(config, sources, transport=httpx.MockTransport(server.handle))
    return bot, calls


async def wait_for(predicate):
    for _ in range(400):
        if predicate():
            return
        await asyncio.sleep(0.005)
    raise AssertionError("Telegram did not reach the expected state")


@pytest.mark.parametrize("ac,event", [(False, "Se fue la luz"), (True, "Vino la luz")])
def test_stats_power_and_full_details(ac, event):
    async def run():
        sources, calls = upstreams(readings(ac=ac))
        try:
            text = await stats_message(sources, NOW)
            assert f"{event}: 19/11/2026 08:00" in text
            assert ("Corriente:</b> ✅ hay luz" if ac else "Corriente:</b> 🚨 apagón") in text
            assert "76% ▰▰▰▰▰▰▰▰▱▱ · 🔻 descargando" in text
            assert "Consumo: 123.5 W" in text
            assert "Autonomía hasta reserva del 20%: 3 h 30 min" in text
            assert "Internet:</b> ✅ conectado" in text
            assert set(calls) == set(readings())
        finally:
            await sources.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("status,extra,expected", [
    ("charging", {"hours_to_full": 1.25}, "Hasta carga completa: 1 h 15 min"),
    ("charging", {"soc": 100}, "Carga completa"),
    ("reserve", {"soc": 18}, "Reserva del 20% alcanzada"),
    ("idle", {"eta": None, "hours_left": None}, "Autonomía / tiempo de carga: no disponible"),
    ("charging", {"eta": None, "hours_left": None}, "Autonomía / tiempo de carga: no disponible"),
])
def test_stats_charge_reserve_and_missing_estimates(status, extra, expected):
    async def run():
        sources, _ = upstreams(readings(status=status, **extra))
        try:
            assert expected in await stats_message(sources, NOW)
        finally:
            await sources.aclose()
    asyncio.run(run())


def test_stats_partial_failures_and_offline_internet():
    async def run():
        routes = readings(online=False)
        routes["/power-status"] = httpx.ConnectError("down")
        routes["/battery-estimate"] = {"malformed": True}
        sources, _ = upstreams(routes)
        try:
            text = await stats_message(sources, NOW)
            assert "Corriente:</b> 🚨 apagón" in text
            assert "Se fue la luz: hora no disponible" in text
            assert "76% ▰▰▰▰▰▰▰▰▱▱ · estado no disponible" in text
            assert "Consumo: 120 W" in text
            assert "Internet:</b> ❌ sin conexión" in text
        finally:
            await sources.aclose()
    asyncio.run(run())


def test_battery_estimate_still_works_when_summary_endpoint_fails():
    async def run():
        routes = readings()
        routes["/data-summary"] = httpx.ConnectError("down")
        sources, _ = upstreams(routes)
        try:
            text = await stats_message(sources, NOW)
            assert "🔻 descargando" in text
            assert "Consumo: 123.5 W" in text
            assert "Corriente:</b> no disponible" in text
        finally:
            await sources.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("age", [181, 3600])
def test_stats_old_measurements_are_not_reported_as_live(age):
    async def run():
        sources, _ = upstreams(readings(age=age))
        try:
            text = await stats_message(sources, NOW)
            assert text.count("última lectura") == 3
            assert "Consumo: no disponible" in text
            assert "Autonomía / tiempo de carga: no disponible" in text
            assert "Se fue la luz:" not in text
        finally:
            await sources.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("routes", [{}, {"/data-summary": {"items": []}}, {"/connection/latest": {"checked_at": "2026-11-20T18:30:00", "online": True}}])
def test_stats_empty_and_invalid_sources(routes):
    async def run():
        sources, _ = upstreams(routes)
        try:
            text = await stats_message(sources, NOW)
            assert "Corriente:</b> no disponible" in text
            assert "Batería:</b> no disponible" in text
            assert "Internet:</b> no disponible" in text
        finally:
            await sources.aclose()
    asyncio.run(run())


def test_worker_authorizes_commands_counts_once_and_syncs_switches(tmp_path):
    async def run():
        server = TelegramServer()
        bot, calls = make_bot(tmp_path, server)
        await bot.start()
        started = bot.started_at
        try:
            await wait_for(lambda: bot.status().menu_synced)
            await server.batches.put([
                update(1, user=99), update(2, chat_type="group"), update(3, chat_id=99),
                update(4, text="hello"), update(5, text="/stats@another_bot"),
                update(6), update(6), update(7, text="/unknown"),
            ])
            await wait_for(lambda: bot.store.state.offset == 8)
            assert bot.status().total_requests == 3
            assert len(server.sent) == 3
            assert server.sent[0]["chat_id"] == OWNER
            assert server.sent[0]["text"] == NOT_A_LINK  # "hello" is plain text, not a link
            assert server.sent[2]["text"] == UNAVAILABLE
            assert len(calls) == 4  # Only the authorized, enabled /stats consulted the sources.
            bot.set_command("stats", False)
            await wait_for(lambda: bot.status().menu_synced)
            menu = [body for method, body in server.calls if method == "setMyCommands"][-1]["commands"]
            assert "stats" not in [command["command"] for command in menu]
            await server.batches.put([update(8, text="/stats@home_stats_bot")])
            await wait_for(lambda: bot.store.state.offset == 9)
            assert server.sent[-1]["text"] == UNAVAILABLE
            assert bot.status().total_requests == 4
            assert len(calls) == 4
            assert bot.started_at == started
            bot.set_command("stats", True)
            await wait_for(lambda: bot.status().menu_synced)
            assert [body for method, body in server.calls if method == "setMyCommands"][-1]["commands"][0]["command"] == "stats"
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
        assert bot._task is None
        assert bot._http.is_closed
        assert bot.status().state == "stopped"
    asyncio.run(run())


def test_restart_preserves_count_switch_and_cursor_but_resets_start(tmp_path):
    async def run():
        server = TelegramServer()
        first, _ = make_bot(tmp_path, server)
        await first.start()
        await server.batches.put([update(10, text="/unknown")])
        await wait_for(lambda: first.store.state.offset == 11)
        first.set_command("stats", False)
        started = first.started_at
        await first.aclose()
        await first.upstreams.aclose()
        second, _ = make_bot(tmp_path, server)
        await second.start()
        try:
            await server.batches.put([update(10), update(11)])
            await wait_for(lambda: second.store.state.offset == 12)
            assert second.started_at > started
            assert not second.enabled("stats")
            assert second.status().total_requests == 2
            assert len(server.sent) == 2
            assert any(body["offset"] == 11 for method, body in server.calls if method == "getUpdates")
        finally:
            await second.aclose()
            await second.upstreams.aclose()
    asyncio.run(run())


def test_failed_reply_retried_after_restart_does_not_increment_again(tmp_path):
    async def run():
        server = TelegramServer()
        server.failures["sendMessage"] = [httpx.ReadError(f"network failure at /bot{TOKEN}/sendMessage")]
        first, _ = make_bot(tmp_path, server)
        await first.start()
        await server.batches.put([update(1, text="/unknown")])
        await wait_for(lambda: first.state == "reconnecting")
        assert first.store.state.total_requests == 1
        assert first.store.state.offset == 0
        assert TOKEN not in first.status().model_dump_json()
        await first.aclose()
        await first.upstreams.aclose()
        second, _ = make_bot(tmp_path, server)
        await second.start()
        try:
            await server.batches.put([update(1, text="/unknown")])
            await wait_for(lambda: second.store.state.offset == 2)
            assert second.store.state.total_requests == 1
            assert len(server.sent) == 1
        finally:
            await second.aclose()
            await second.upstreams.aclose()
    asyncio.run(run())


def test_disabling_stats_while_sources_are_loading_blocks_the_reply(tmp_path, monkeypatch):
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()

        async def snapshot(_):
            entered.set()
            await release.wait()
            return "private stats"

        monkeypatch.setattr("app.telegram.stats_message", snapshot)
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await server.batches.put([update()])
            await asyncio.wait_for(entered.wait(), 2)
            bot.set_command("stats", False)
            release.set()
            await wait_for(lambda: bot.store.state.offset == 2 and bot.status().menu_synced)
            assert server.sent[0]["text"] == UNAVAILABLE
            assert bot.status().total_requests == 1
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_new_bot_identity_resets_only_the_cursor(tmp_path):
    async def run():
        store = TelegramStore(tmp_path)
        store.save(bot_id=999, offset=1000, counted_update_id=999, total_requests=20, commands={"stats": False})
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await server.batches.put([update()])
            await wait_for(lambda: bot.store.state.offset == 2)
            assert bot.status().total_requests == 21
            assert bot.store.state.bot_id == server.identity["id"]
            assert not bot.enabled("stats")
            assert server.sent[0]["text"] == UNAVAILABLE
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_malformed_and_unwanted_updates_do_not_stop_polling(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await server.batches.put([
                {"update_id": 1, "message": ["bad"]},
                {"update_id": 2, "message": {"from": [], "chat": "bad", "text": "/stats"}},
                {"update_id": 3, "edited_message": {"text": "/stats"}},
                update(4, text="/unknown"),
            ])
            await wait_for(lambda: bot.store.state.offset == 5)
            assert bot.status().total_requests == 1
            assert bot._task and not bot._task.done()
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("code", [401, 404, 409, 429, 500])
def test_api_errors_are_sanitized_and_rate_limit_is_respected(tmp_path, monkeypatch, code):
    async def run():
        server = TelegramServer()
        server.failures["getMe"] = [httpx.Response(code, json={"ok": False, "error_code": code, "description": TOKEN, "parameters": {"retry_after": 19}})]
        bot, _ = make_bot(tmp_path, server)
        delays = []
        blocked = asyncio.Event()
        original_sleep = asyncio.sleep

        async def sleep(delay):
            delays.append(delay)
            await blocked.wait()

        monkeypatch.setattr("app.telegram.asyncio.sleep", sleep)
        await bot.start()
        try:
            for _ in range(50):
                if delays:
                    break
                await original_sleep(0.005)
            assert delays == [19]
            assert bot.status().state == ("error" if code in (401, 404, 409) else "reconnecting")
            assert TOKEN not in bot.status().model_dump_json()
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_reconnection_uses_exponential_backoff_and_keeps_start(tmp_path, monkeypatch):
    async def run():
        server = TelegramServer()
        server.failures["getUpdates"] = [httpx.ConnectError("offline") for _ in range(3)]
        bot, _ = make_bot(tmp_path, server)
        delays = []
        original_sleep = asyncio.sleep

        async def sleep(delay):
            delays.append(delay)
            await original_sleep(0)

        monkeypatch.setattr("app.telegram.asyncio.sleep", sleep)
        await bot.start()
        started = bot.started_at
        try:
            await server.batches.put([update(text="/unknown")])
            for _ in range(100):
                if bot.store.state.offset == 2:
                    break
                await original_sleep(0.005)
            assert delays == [2, 4, 8]
            assert bot.started_at == started
            assert bot.status().state == "connected"
            assert bot.status().error is None
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("token,owner,missing", [(None, None, 1), (None, OWNER, 1), ("", "", 1)])
def test_incomplete_settings_do_not_start_network_calls(tmp_path, token, owner, missing):
    async def run():
        config = Settings(_env_file=None, telegram_state_dir=str(tmp_path), telegram_bot_token=token, telegram_owner_user_id=owner)
        sources, _ = upstreams({})
        bot = TelegramBot(config, sources)
        await bot.start()
        try:
            assert bot._http is None
            assert bot.status().state == "unconfigured"
            assert len(bot.status().missing_settings) == missing
            assert bot.status().started_at is None
            bot.set_command("stats", False)
            assert not bot.enabled("stats")
        finally:
            await bot.aclose()
            await sources.aclose()
    asyncio.run(run())


def test_corrupt_state_does_not_reset_history_or_stop_dashboard(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("not json")
    sources, _ = upstreams({})
    bot = TelegramBot(Settings(_env_file=None, telegram_state_dir=str(tmp_path)), sources)
    assert bot.status().state == "error"
    assert path.read_text() == "not json"
    with pytest.raises(StateError):
        bot.set_command("stats", False)
    asyncio.run(sources.aclose())


def test_atomic_write_failure_keeps_the_last_state(tmp_path, monkeypatch):
    store = TelegramStore(tmp_path)
    before = store.path.read_text()

    def fail(*_):
        raise OSError("disk full")

    monkeypatch.setattr("app.telegram.os.replace", fail)
    with pytest.raises(StateError):
        store.save(total_requests=99)
    assert store.state.total_requests == 0
    assert store.path.read_text() == before


def test_management_api_does_not_leak_credentials_or_count_requests(tmp_path):
    server = TelegramServer()
    bot, _ = make_bot(tmp_path, server)
    app.dependency_overrides[get_telegram] = lambda: bot
    try:
        client = TestClient(app)
        response = client.get("/telegram/status")
        assert response.status_code == 200
        assert TOKEN not in response.text
        assert client.get("/telegram/commands").json()[0]["enabled"] is True
        assert client.patch("/telegram/commands/stats", json={"enabled": False}).json()["enabled"] is False
        assert client.patch("/telegram/commands/unknown", json={"enabled": False}).status_code == 404
        assert client.patch("/telegram/commands/stats", json={"enabled": "false"}).status_code == 422
        assert client.patch("/telegram/commands/stats", json={"enabled": True, "token": "x"}).status_code == 422
        assert client.get("/telegram/status").json()["total_requests"] == 0
    finally:
        app.dependency_overrides.pop(get_telegram)
        asyncio.run(bot.upstreams.aclose())


def test_dashboard_lifespan_without_telegram_credentials(tmp_path, monkeypatch):
    config = Settings(
        _env_file=None, telegram_bot_token=None, telegram_owner_user_id=None,
        telegram_state_dir=str(tmp_path / "telegram"), sender_dir=str(tmp_path / "sender"),
        downloads_dir=str(tmp_path / "downloads"),
    )
    sources, _ = upstreams({})
    monkeypatch.setattr("app.main.get_settings", lambda: config)
    monkeypatch.setattr("app.main.Upstreams.from_settings", lambda _: sources)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/telegram/status").json()["state"] == "unconfigured"
        assert client.get("/telegram/commands").json()[0]["enabled"] is True


def video_download(**fields):
    return {
        "id": "d1", "url": "https://example.com/movie.mkv", "destination": "downloads", "fileName": "movie.mkv",
        "totalBytes": 2 * 1024 ** 3, "completedBytes": 512 * 1024 ** 2, "progress": 25.0,
        "speedBytesPerSecond": 150 * 1024, "etaSeconds": 3 * 3600, "status": "active", **fields,
    }


def video_downloads(*items, **fields):
    return {
        "downloads": list(items),
        "stats": {"downloadSpeedBytesPerSecond": 150 * 1024, "active": 1, "waiting": 1, "stopped": 0},
        "speedLimit": 0, "queuePaused": False, "engineAvailable": True, **fields,
    }


def run_message(build, routes):
    async def run():
        sources, _ = upstreams(routes)
        try:
            return await build(sources, NOW)
        finally:
            await sources.aclose()
    return asyncio.run(run())


def test_battery_message_shows_charge_power_and_outages():
    routes = {
        "/battery-estimate": {
            "status": "discharging", "soc": 76, "load_w": 18, "reserve_percent": 20,
            "eta": (NOW + timedelta(hours=3.5)).isoformat(), "hours_left": 3.5,
        },
        "/power-status": {"receiving_ac": False, "current_since": (NOW - timedelta(hours=2)).isoformat()},
        "/power-totals": {"with_power_hours": 20, "without_power_hours": 4, "receiving_ac": False, "outage_ongoing": True},
        "/power-periods": [
            {"start": "2026-11-20T00:00:00Z", "end": "2026-11-20T03:00:00Z", "receiving_ac": False},
            {"start": "2026-11-20T03:00:00Z", "end": "2026-11-20T03:00:10Z", "receiving_ac": True},
            {"start": "2026-11-20T03:00:10Z", "end": "2026-11-20T03:00:20Z", "receiving_ac": False},
            {"start": "2026-11-20T03:00:20Z", "end": "2026-11-20T16:30:00Z", "receiving_ac": True},
            {"start": "2026-11-20T16:30:00Z", "end": "2026-11-20T18:30:00Z", "receiving_ac": False},
        ],
    }
    text = run_message(battery_message, routes)
    assert "<b>76%</b>  ▰▰▰▰▰▰▰▰▱▱" in text
    assert "🔻 Descargando" in text
    assert "Consumo: <b>18 W</b>" in text
    assert "Llega a la reserva (20%) en <b>3 h 30 min</b> · 18:00" in text
    assert "🚨 apagón desde 12:30 (hace 2 h 0 min)" in text
    assert "☀️ 20 h 0 min con luz · 🌑 4 h 0 min sin luz" in text
    assert "Apagones: 2 · el más largo de 3 h 0 min" in text  # The 10 second flicker is not one


def test_battery_message_with_bluetti_down():
    text = run_message(battery_message, {"/battery-estimate": httpx.ConnectError("down")})
    assert "No pude leer la batería" in text
    assert "• Ahora: no disponible" in text
    assert "Últimas 24 h: no disponible" in text


def test_internet_message_shows_connection_speed_and_usage():
    routes = {
        "/connection/latest": {
            "checked_at": NOW.isoformat(), "online": True,
            "hops": [{"name": "router", "ok": True, "latency_ms": 6}, {"name": "internet", "ok": True, "latency_ms": 102.4}],
        },
        "/connection/throughput/current": {"measured_at": NOW.isoformat(), "rx_bytes_per_second": 250_000, "tx_bytes_per_second": 12_500},
        "/speed-test/latest": {"measured_at": (NOW - timedelta(minutes=6)).isoformat(), "download_mbps": 4.9, "ping_ms": 543},
        "/bandwidth": {"total_rx_bytes": 5 * 1024 ** 3, "total_tx_bytes": 1024 ** 3, "items": []},
        "/device-usage": [{"mac": "aa", "name": "<Laptop>", "down_bytes": 3 * 1024 ** 3, "up_bytes": 0}],
    }
    text = run_message(internet_message, routes)
    assert "✅ <b>Conectado</b>" in text
    assert "Latencia: 102 ms" in text
    assert "⬇️ 2.0 Mbps · ⬆️ 0.1 Mbps" in text
    assert "Último test de velocidad</b> · 14:24" in text
    assert "⬇️ 4.9 Mbps · 📡 ping 543 ms" in text
    assert "⬇️ 5.0 GB · ⬆️ 1.0 GB" in text
    assert "<b>&lt;Laptop&gt;</b> (3.0 GB ⬇️)" in text


def test_internet_message_offline_and_partial():
    routes = {"/connection/latest": {"checked_at": NOW.isoformat(), "online": False, "break_at": "provider"}}
    text = run_message(internet_message, routes)
    assert "❌ <b>Sin conexión</b>" in text
    assert "Falla en: provider" in text
    assert text.count("no disponible") == 3


def test_server_message_shows_resources_and_boot():
    routes = {"/system": {
        "updated_at": NOW.isoformat(), "cpu_percent": 41.0,
        "memory": {"total_bytes": 4 * 1024 ** 3, "used_bytes": 2 * 1024 ** 3, "available_bytes": 2 * 1024 ** 3, "percent": 50},
        "disks": [{"name": "system", "mount": "/", "total_bytes": 30 * 1024 ** 3, "used_bytes": 28 * 1024 ** 3, "available_bytes": 2 * 1024 ** 3, "percent": 93}],
        "network": {"interface": "wlo1", "rx_bytes_per_second": 2048, "tx_bytes_per_second": 1024, "total_rx_bytes": 1024 ** 3, "total_tx_bytes": 0},
        "boot": {"booted_at": (NOW - timedelta(days=5, hours=11)).isoformat(), "last_shutdown": {"at": "2026-11-15T07:00:00Z", "clean": False}},
    }}
    text = run_message(server_message, routes)
    assert "🟢 <b>CPU</b>  41%  ▰▰▰▰▱▱▱▱▱▱" in text
    assert "2.0 GB de 4.0 GB en uso" in text
    assert "🔴 <b>Disco del sistema</b>  93%" in text
    assert "2.0 GB libres de 30.0 GB" in text
    assert "Disco externo</b> no montado" in text
    assert "Ahora: ⬇️ 2.0 KB/s · ⬆️ 1.0 KB/s" in text
    assert "Encendido</b> hace 5 d 11 h" in text
    assert "⚡ corte" in text


def test_server_message_with_agent_down():
    assert "No pude leer el estado del servidor" in run_message(server_message, {"/system": httpx.ConnectError("down")})


def test_downloads_message_lists_running_downloads_first():
    routes = {"/api/downloads": video_downloads(
        video_download(id="w", status="waiting", fileName="next.zip", progress=None, totalBytes=None, completedBytes=0),
        video_download(id="c", status="complete", fileName="done.zip"),
        video_download(fileName="x" * 80),
        queuePaused=True, speedLimit=500 * 1024,
    )}
    text = run_message(downloads_message, routes)
    assert "Velocidad: <b>150.0 KB/s</b>" in text
    assert "⬇️ 1 activa · ⏳ 1 en espera · ⏸️ 0 en pausa" in text
    assert "Límite de velocidad: 500.0 KB/s" in text
    assert "La cola está en pausa" in text
    assert "done.zip" not in text
    assert text.index("x" * 31 + "…" + "x" * 16) < text.index("next.zip")
    assert "▰▰▱▱▱▱▱▱▱▱ 25.0%" in text
    assert "512.0 MB / 2.0 GB · 150.0 KB/s · ⏳ 3 h 0 min" in text
    assert "⏳ <b>En espera (1)</b>\n• next.zip" in text


def test_downloads_message_empty_down_and_truncated():
    assert "No hay descargas en curso" in run_message(downloads_message, {"/api/downloads": video_downloads()})
    assert "No pude conectar" in run_message(downloads_message, {"/api/downloads": httpx.ConnectError("down")})
    waiting = [video_download(id=str(i), status="waiting", fileName=f"f{i}") for i in range(5)]
    paused = [video_download(id=f"p{i}", status="paused", fileName=f"p{i}") for i in range(10)]
    text = run_message(downloads_message, {"/api/downloads": video_downloads(*waiting, *paused)})
    assert "⏸️ <b>p7</b>" in text and "<b>p8</b>" not in text
    assert "…y 2 más" in text
    assert "En espera (5)" in text and "• f2" in text and "• f3" not in text


def test_help_lists_only_enabled_commands():
    text = help_message([("battery", "Batería <Bluetti>")], links=False)
    assert "🔋 /battery — Batería &lt;Bluetti&gt;" in text
    assert "/stats" not in text
    assert "enlace" not in text
    assert "Mándame un enlace" in help_message([], links=True)


def test_help_command_follows_switches(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        bot.set_command("server", False)
        await bot.start()
        try:
            await server.batches.put([update(1, text="/help"), update(2, text="/start")])
            await wait_for(lambda: len(server.sent) == 2)
            assert server.sent[0]["parse_mode"] == "HTML"
            assert "/battery" in server.sent[0]["text"]
            assert "/server" not in server.sent[0]["text"]
            assert server.sent[1]["text"] == server.sent[0]["text"]
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def callback(number, data, user=OWNER, message_id=7):
    return {"update_id": number, "callback_query": {
        "id": f"q{number}", "from": {"id": user}, "data": data,
        "message": {"message_id": message_id, "chat": {"id": user, "type": "private"}},
    }}


def link_bot(tmp_path, server, answer):
    posts = []

    def add(request):
        posts.append((json.loads(request.content), request.headers.get("idempotency-key")))
        return answer(request)

    return (*make_bot(tmp_path, server, routes={"/api/downloads": add}), posts)


def test_link_is_offered_and_queued_once(tmp_path):
    async def run():
        server = TelegramServer()
        created = lambda request: httpx.Response(201, json={"download": video_download(fileName="movie.mkv")})
        bot, _, posts = link_bot(tmp_path, server, created)
        await bot.start()
        try:
            await server.batches.put([update(1, text="mira esto: https://example.com/movie.mkv.")])
            await wait_for(lambda: len(server.sent) == 1)
            offer = server.sent[0]
            assert "https://example.com/movie.mkv</code>" in offer["text"]
            buttons = [button for row in offer["reply_markup"]["inline_keyboard"] for button in row]
            assert [button["text"] for button in buttons] == ["📥 Sí, a Descargas", "🖼️ Sí, a Galería", "❌ No"]
            data = buttons[0]["callback_data"]
            assert len(data.encode()) <= 64

            # A press from another user, and the same press twice, queue it only once
            await server.batches.put([callback(2, data, user=99), callback(3, data), callback(4, data)])
            await wait_for(lambda: bot.store.state.offset == 5)
            assert posts == [({"url": "https://example.com/movie.mkv", "destination": "downloads"}, posts[0][1])]
            assert posts[0][1].startswith("telegram-")
            edits = [body for method, body in server.calls if method == "editMessageText"]
            assert len(edits) == 2
            assert "Agregado a Descargas" in edits[0]["text"] and "movie.mkv" in edits[0]["text"]
            assert "reply_markup" not in edits[0]
            assert edits[1]["text"] == edits[0]["text"]
            assert len([1 for method, _ in server.calls if method == "answerCallbackQuery"]) == 2
            assert bot.status().total_requests == 3
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_link_declined_expired_and_failed(tmp_path, monkeypatch):
    async def run():
        server = TelegramServer()
        refused = lambda request: httpx.Response(400, json={"error": {"code": "BAD", "message": "Enter a valid URL."}})
        bot, _, posts = link_bot(tmp_path, server, refused)
        await bot.start()
        try:
            await server.batches.put([update(1, text="https://a.example/x"), update(2, text="https://b.example/y")])
            await wait_for(lambda: len(server.sent) == 2)
            first, second = (
                [b["callback_data"] for row in sent["reply_markup"]["inline_keyboard"] for b in row] for sent in server.sent
            )
            await server.batches.put([callback(3, first[2]), callback(4, second[1]), callback(5, "dl:unknown:downloads")])
            await wait_for(lambda: bot.store.state.offset == 6)
            edits = [body for method, body in server.calls if method == "editMessageText"]
            assert edits[0]["text"] == "❌ Listo, no lo agrego."
            assert "No pude agregarlo" in edits[1]["text"] and "Enter a valid URL." in edits[1]["text"]
            assert "reply_markup" in edits[1]  # The buttons stay to try again
            assert posts[0][0] == {"url": "https://b.example/y", "destination": "gallery"}
            assert edits[2]["text"] == EXPIRED
            monkeypatch.setattr("app.telegram.LINK_SECONDS", 0)
            await server.batches.put([callback(6, second[0])])
            await wait_for(lambda: bot.store.state.offset == 7)
            assert [body for method, body in server.calls if method == "editMessageText"][-1]["text"] == EXPIRED
            assert len(posts) == 1
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_links_follow_the_downloads_switch(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        bot.set_command("downloads", False)
        await bot.start()
        try:
            await server.batches.put([update(1, text="https://example.com/file.zip"), update(2, text="hola", user=99)])
            await wait_for(lambda: bot.store.state.offset == 3)
            assert len(server.sent) == 1
            assert "reply_markup" not in server.sent[0]
            assert "/help" in server.sent[0]["text"]
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())
