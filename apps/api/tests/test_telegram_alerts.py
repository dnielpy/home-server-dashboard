import asyncio
from datetime import timedelta

import httpx

from app.telegram_alerts import AlertWatcher
from tests.test_telegram import NOW, OWNER, TelegramServer, make_bot, video_download, video_downloads


def bluetti(ac, since, *, age=0, soc=76):
    return {
        "/power-status": {"receiving_ac": ac, "current_since": since.isoformat()},
        "/data-summary": {"items": [{"date": (NOW - timedelta(seconds=age)).isoformat(), "battery_percent": soc, "ac_output": 50, "ac": ac}]},
        "/battery-estimate": {
            "status": "charging" if ac else "discharging", "soc": soc, "load_w": 50, "reserve_percent": 20,
            "eta": None, "hours_left": None if ac else 6.5,
        },
    }


def connection(online=True, start=None, minutes=12, break_at="provider"):
    outage = None if start is None else {
        "start": start.isoformat(), "end": (start + timedelta(minutes=minutes)).isoformat(),
        "duration_hours": minutes / 60, "break_at": break_at,
    }
    return {"/connection-status": {"online": online, "last_outage": outage}}


def run_watcher(tmp_path, steps, server=None):
    """Runs one check per step: (routes to apply, minutes after NOW). Returns the alerts sent."""
    server = server or TelegramServer()

    async def run():
        routes = {}
        bot, _ = make_bot(tmp_path, server, routes=routes)
        await bot.start()
        watcher = AlertWatcher(bot)
        try:
            for changes, minutes in steps:
                routes.update(changes)
                await watcher.tick(NOW + timedelta(minutes=minutes))
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
        return bot

    bot = asyncio.run(run())
    return [body["text"] for body in server.sent], bot


def test_power_going_and_coming_back(tmp_path):
    off_at, on_at = NOW - timedelta(minutes=5), NOW + timedelta(hours=2)
    # Read at NOW + minutes, so the reading is fresh at each step
    sent, _ = run_watcher(tmp_path, [
        (bluetti(True, NOW - timedelta(hours=3)), 0),
        # Gone for only 30 seconds so far: maybe a flicker
        (bluetti(False, NOW - timedelta(seconds=30)), 0),
        (bluetti(False, off_at), 0),
        (bluetti(False, off_at), 0),
    ])
    assert len(sent) == 1
    assert "🚨 <b>Se fue la luz</b>" in sent[0] and "🕒 14:25" in sent[0]
    assert "Batería: 76%" in sent[0] and "Autonomía hasta la reserva (20%): 6 h 30 min" in sent[0]

    sent, _ = run_watcher(tmp_path, [({**bluetti(True, on_at), "/data-summary": {"items": [{
        "date": (on_at + timedelta(minutes=2)).isoformat(), "battery_percent": 50, "ac_output": 50, "ac": True,
    }]}}, 122)])
    assert len(sent) == 1
    assert "✅ <b>Vino la luz</b>" in sent[0]
    assert "Estuvo <b>2 h 5 min</b> sin luz (desde 14:25)" in sent[0]


def test_flicker_stale_and_first_look_send_nothing(tmp_path):
    sent, bot = run_watcher(tmp_path, [
        (bluetti(False, NOW - timedelta(hours=1)), 0),  # The first look only records it
        (bluetti(True, NOW - timedelta(seconds=10)), 0),  # A flicker
        (bluetti(False, NOW - timedelta(seconds=5)), 0),
        (bluetti(True, NOW - timedelta(hours=1), age=600), 0),  # A stale reading
        ({"/power-status": httpx.ConnectError("down")}, 0),
    ])
    assert sent == []
    assert bot.store.state.alerts.power_ac is False
    # The outage still counts from when it started, not from the flicker
    assert bot.store.state.alerts.power_since == NOW - timedelta(hours=1)


def test_internet_outage_is_told_once_when_it_is_back(tmp_path):
    first, second = NOW - timedelta(days=1), NOW - timedelta(minutes=20)
    sent, _ = run_watcher(tmp_path, [
        (connection(start=first), 0),
        (connection(online=False, start=first), 0),
        (connection(start=second), 0),
        (connection(start=second), 1),
        (connection(start=NOW, minutes=0.5), 2),  # A single failed check
    ])
    assert sent == [
        "🌐 <b>Volvió internet</b>\n📴 Se fue a las 14:10 y volvió a las 14:22\n⏱️ Estuvo <b>12 min</b> desconectado\n"
        "📍 Falló en el proveedor"
    ]


def test_finished_downloads(tmp_path):
    done = video_download(id="old", status="complete", fileName="old.zip")
    sent, bot = run_watcher(tmp_path, [
        ({"/api/downloads": video_downloads(done, video_download(id="a"))}, 0),
        ({"/api/downloads": video_downloads(done, video_download(id="a", status="complete", destination="gallery"))}, 0),
        ({"/api/downloads": video_downloads(
            video_download(id="a", status="complete"), video_download(id="b", status="complete", fileName="b.iso"),
            video_download(id="c", status="complete", fileName="c.iso", totalBytes=None, completedBytes=1024),
        )}, 1),
        ({"/api/downloads": httpx.ConnectError("down")}, 2),
    ])
    assert sent[0] == "✅ <b>Descarga terminada</b>\n📄 movie.mkv\n💾 2.0 GB · 📁 Galería"
    assert sent[1] == "✅ <b>2 descargas terminadas</b>\n\n• b.iso (2.0 GB)\n• c.iso (1.0 KB)"
    assert len(sent) == 2
    assert bot.store.state.alerts.finished == ["a", "b", "c"]


def test_alerts_wait_for_telegram_and_survive_a_restart(tmp_path):
    server = TelegramServer()
    server.failures["sendMessage"] = [httpx.ConnectError("no internet")]
    sent, bot = run_watcher(tmp_path, [
        (bluetti(True, NOW - timedelta(hours=3)), 0),
        (bluetti(False, NOW - timedelta(minutes=5)), 0),
    ], server)
    assert sent == []
    assert len(bot.store.state.alerts.outbox) == 1
    assert bot.store.state.alerts.outbox[0].users == [OWNER]

    # After a restart nothing is told again, and the waiting alert goes out
    sent, bot = run_watcher(tmp_path, [(bluetti(False, NOW - timedelta(minutes=5)), 1)], server)
    assert len(sent) == 1 and "Se fue la luz" in sent[0]
    assert bot.store.state.alerts.outbox == []


def test_a_blocked_chat_does_not_hold_the_outbox(tmp_path):
    server = TelegramServer()
    server.failures["sendMessage"] = [httpx.Response(403, json={"ok": False, "error_code": 403})]
    _, bot = run_watcher(tmp_path, [
        (bluetti(True, NOW - timedelta(hours=3)), 0), (bluetti(False, NOW - timedelta(minutes=5)), 0),
    ], server)
    assert bot.store.state.alerts.outbox == []


def test_watcher_follows_the_bot_lifecycle(tmp_path):
    async def run():
        bot, _ = make_bot(tmp_path, TelegramServer(), telegram_alerts=True)
        await bot.start()
        assert bot._alerts and not bot._alerts.done()
        await bot.aclose()
        await bot.upstreams.aclose()
        assert bot._alerts is None
    asyncio.run(run())
