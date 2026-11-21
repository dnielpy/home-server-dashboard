import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.routers.telegram import router
from app.telegram import StateError, TelegramStore
from app.telegram_users import EnrollmentError, EnrollmentWindow, TelegramCandidate, UserIn
from tests.test_telegram import OWNER, TelegramServer, make_bot, update, wait_for


def test_window_lasts_five_minutes_and_repeated_clicks_do_not_extend_it():
    async def run():
        clock = [0]
        window = EnrollmentWindow()
        window._clock = lambda: clock[0]
        first = window.open()
        assert (first.expires_at - first.opened_at).total_seconds() == 300
        clock[0] = 299.99
        assert window.open().expires_at == first.expires_at
        assert window.snapshot().state == "waiting"
        clock[0] = 300
        assert window.snapshot().state == "closed"
        assert not window.capture(TelegramCandidate(user_id=99), int(datetime.now(UTC).timestamp()))
        await window.aclose()
    asyncio.run(run())


def test_timer_closes_without_any_polling_or_incoming_message(monkeypatch):
    async def run():
        monkeypatch.setattr("app.telegram_users.ENROLLMENT_SECONDS", 0.01)
        window = EnrollmentWindow()
        window.open()
        await wait_for(lambda: window._view.state == "closed")
        assert window._deadline is None
        await window.aclose()
    asyncio.run(run())


def test_only_first_private_add_is_captured_and_name_is_required_for_access(tmp_path):
    async def run():
        server = TelegramServer()
        bot, calls = make_bot(tmp_path, server)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            opened = bot.open_enrollment()
            await server.batches.put([
                update(1, text="/add", user=91, chat_id=91, chat_type="group"),
                update(2, text="/stats", user=92, chat_id=92),
                update(3, text="/add@another_bot", user=93, chat_id=93),
            ])
            await wait_for(lambda: bot.store.state.offset == 4)
            assert bot.enrollment.snapshot().state == "waiting"
            candidate = update(4, text="/add", user=94, chat_id=94)
            candidate["message"]["from"].update(first_name="Daniel", last_name="Quesada", username="daniel")
            await server.batches.put([candidate, update(5, text="/add", user=95, chat_id=95)])
            await wait_for(lambda: bot.store.state.offset == 6)
            captured = bot.enrollment.snapshot()
            assert captured.state == "captured"
            assert captured.candidate.user_id == 94
            assert captured.candidate.telegram_name == "Daniel Quesada"
            assert bot.enrollment._deadline is None
            assert not bot.is_allowed(94)
            assert not bot.is_allowed(95)
            assert server.sent[-1]["chat_id"] == 94
            assert bot.status().total_requests == 0
            assert not calls
            with pytest.raises(EnrollmentError):
                bot.open_enrollment()
            with pytest.raises(EnrollmentError):
                bot.add_user(UserIn(user_id=95, name="Wrong user"))
            user = bot.add_user(UserIn(user_id=94, name="  Dani  "))
            assert user.name == "Dani"
            assert user.username == "daniel"
            assert bot.enrollment.snapshot().state == "closed"
            await server.batches.put([update(6, text="/stats", user=94, chat_id=94)])
            await wait_for(lambda: bot.store.state.offset == 7)
            assert server.sent[-1]["chat_id"] == 94  # Replies go to the caller, never to the old owner.
            assert "Estado de la casa" in server.sent[-1]["text"]
            assert len(calls) == 4
            assert bot.status().total_requests == 1
            assert opened.opened_at is not None
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("mode", ["closed", "expired", "old_message", "bot_sender"])
def test_add_cannot_register_outside_the_live_window(tmp_path, mode):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            message = update(1, text="/add", user=99, chat_id=99)
            if mode != "closed":
                opened = bot.open_enrollment()
                if mode == "expired":
                    bot.enrollment._clock = lambda: bot.enrollment._deadline + 1
                elif mode == "old_message":
                    message["message"]["date"] = int(opened.opened_at.timestamp()) - 30
                else:
                    message["message"]["from"]["is_bot"] = True
            await server.batches.put([message])
            await wait_for(lambda: bot.store.state.offset == 2)
            assert bot.enrollment.snapshot().candidate is None
            assert not bot.is_allowed(99)
            assert not server.sent
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_duplicate_add_closes_window_without_duplicating_a_user(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            bot.open_enrollment()
            await server.batches.put([update(text="/add")])
            await wait_for(lambda: bot.store.state.offset == 2)
            assert bot.enrollment.snapshot().state == "closed"
            assert "ya tiene acceso" in bot.enrollment.snapshot().notice
            assert len(bot.users()) == 1
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_registered_users_survive_restart_but_pending_enrollment_does_not(tmp_path):
    async def run():
        server = TelegramServer()
        first, _ = make_bot(tmp_path, server)
        await first.start()
        await wait_for(lambda: first.state == "connected")
        first.open_enrollment()
        await server.batches.put([update(text="/add", user=99, chat_id=99)])
        await wait_for(lambda: first.enrollment.snapshot().state == "captured")
        first.add_user(UserIn(user_id=99, name="Familia"))
        first.open_enrollment()
        await first.aclose()
        await first.upstreams.aclose()
        second, _ = make_bot(tmp_path, server)
        try:
            assert second.is_allowed(99)
            assert second.enrollment.snapshot().state == "closed"
            second.delete_user(99)
            second.delete_user(OWNER)
        finally:
            await second.aclose()
            await second.upstreams.aclose()
        third, _ = make_bot(tmp_path, server)
        try:
            assert third.users() == []  # Environment bootstrap cannot re-add a deleted user.
        finally:
            await third.aclose()
            await third.upstreams.aclose()
    asyncio.run(run())


def test_legacy_state_migrates_without_losing_history_or_switches(tmp_path):
    (tmp_path / "state.json").write_text(json.dumps({"offset": 51, "total_requests": 17, "commands": {"stats": False}}))
    server = TelegramServer()
    bot, _ = make_bot(tmp_path, server)
    assert bot.is_allowed(OWNER)
    assert bot.users()[0].name == "Propietario"
    assert bot.store.state.total_requests == 17
    assert bot.store.state.offset == 51
    assert not bot.enabled("stats")
    asyncio.run(bot.upstreams.aclose())


def test_failed_migration_keeps_bot_stopped(tmp_path, monkeypatch):
    async def run():
        original_save = TelegramStore.save

        def fail_migration(store, **changes):
            if "users" in changes:
                raise StateError("storage unavailable")
            return original_save(store, **changes)

        monkeypatch.setattr(TelegramStore, "save", fail_migration)
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            assert bot.state == "error"
            assert bot._http is None
            assert bot._task is None
            assert bot.store is None
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_token_without_owner_can_start_and_enroll_the_first_user(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server, telegram_owner_user_id=None)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            assert bot.status().missing_settings == []
            assert bot.users() == []
            bot.open_enrollment()
            await server.batches.put([update(text="/add", user=99, chat_id=99)])
            await wait_for(lambda: bot.enrollment.snapshot().state == "captured")
            bot.add_user(UserIn(user_id=99, name="Primero"))
            assert bot.is_allowed(99)
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_deleted_user_does_not_receive_stats_already_loading(tmp_path, monkeypatch):
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
            bot.delete_user(OWNER)
            release.set()
            await wait_for(lambda: bot.store.state.offset == 2)
            assert not server.sent
            await server.batches.put([update(2)])
            await wait_for(lambda: bot.store.state.offset == 3)
            assert bot.status().total_requests == 1
            assert not server.sent
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_cancelled_window_cannot_capture_messages(tmp_path):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            bot.open_enrollment()
            bot.enrollment.close()
            await server.batches.put([update(text="/add", user=99, chat_id=99)])
            await wait_for(lambda: bot.store.state.offset == 2)
            assert bot.enrollment.snapshot().state == "closed"
            assert not bot.is_allowed(99)
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


def test_storage_failure_does_not_grant_access_or_discard_candidate(tmp_path, monkeypatch):
    async def run():
        server = TelegramServer()
        bot, _ = make_bot(tmp_path, server)
        await bot.start()
        try:
            await wait_for(lambda: bot.state == "connected")
            bot.open_enrollment()
            await server.batches.put([update(text="/add", user=99, chat_id=99)])
            await wait_for(lambda: bot.store.state.offset == 2)

            def fail(*_, **__):
                raise StateError("disk full")

            monkeypatch.setattr(bot.store, "save", fail)
            with pytest.raises(StateError):
                bot.add_user(UserIn(user_id=99, name="Familia"))
            assert not bot.is_allowed(99)
            assert bot.enrollment.snapshot().state == "captured"
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()
    asyncio.run(run())


@pytest.mark.parametrize("name", ["", "   ", "x" * 81, "one\ntwo"])
def test_user_name_validation(name):
    with pytest.raises(ValidationError):
        UserIn(user_id=99, name=name)


def test_users_api_enrollment_validation_and_deletion(tmp_path):
    server = TelegramServer()
    bot, _ = make_bot(tmp_path, server)
    with pytest.raises(EnrollmentError):
        bot.open_enrollment()

    @asynccontextmanager
    async def lifespan(test_app):
        test_app.state.telegram = bot
        await bot.start()
        try:
            yield
        finally:
            await bot.aclose()
            await bot.upstreams.aclose()

    test_app = FastAPI(lifespan=lifespan)
    test_app.include_router(router)
    with TestClient(test_app) as client:
        client.portal.call(wait_for, lambda: bot.state == "connected")
        assert client.get("/telegram/users").json()[0]["user_id"] == OWNER
        assert client.post("/telegram/users", json={"user_id": 99, "name": "New"}).status_code == 409
        opened = client.post("/telegram/enrollment")
        assert opened.status_code == 200
        assert client.post("/telegram/enrollment").json()["expires_at"] == opened.json()["expires_at"]
        client.portal.call(bot._process, update(text="/add", user=99, chat_id=99))
        assert client.get("/telegram/enrollment").json()["candidate"]["user_id"] == 99
        assert client.post("/telegram/enrollment").status_code == 409
        assert client.post("/telegram/users", json={"user_id": 99, "name": " "}).status_code == 422
        assert client.post("/telegram/users", json={"user_id": 99, "name": "New", "extra": True}).status_code == 422
        saved = client.post("/telegram/users", json={"user_id": 99, "name": "New"})
        assert saved.status_code == 201
        assert len(client.get("/telegram/users").json()) == 2
        assert client.delete("/telegram/users/99").status_code == 204
        assert client.delete("/telegram/users/99").status_code == 404
        client.post("/telegram/enrollment")
        assert client.delete("/telegram/enrollment").json()["state"] == "closed"
