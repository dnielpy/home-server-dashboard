import json
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.main import app
from app.pet import PetStore, get_pet, read_seeds
from app.pet_generator import GUIDE, GenerationFailed, request_animation


@pytest.fixture
def pet(tmp_path: Path) -> Iterator[PetStore]:
    store = PetStore(tmp_path / "pet" / "pet.sqlite3")
    app.dependency_overrides[get_pet] = lambda: store
    yield store
    app.dependency_overrides.clear()
    store.close()


def _save(client, title: str = "Astro estornuda", code: str = "face.set('happy');", source: str = "manual"):
    return client.post("/pet/animations", json={"title": title, "code": code, "source": source})


def test_a_new_library_starts_with_the_seed_animations(client, pet) -> None:
    animations = client.get("/pet/animations").json()

    assert len(animations) == len(read_seeds()) >= 8
    assert {a["source"] for a in animations} == {"seed"}
    assert all(a["code"].strip() and a["title"] for a in animations)


def test_the_seeds_are_only_added_once(tmp_path: Path) -> None:
    path = tmp_path / "pet.sqlite3"
    PetStore(path).close()
    store = PetStore(path)
    assert len(store.animations()) == len(read_seeds())
    store.close()


def test_a_saved_animation_is_listed_first(client, pet) -> None:
    response = _save(client, title="  Astro estornuda ")

    assert response.status_code == 201
    [first, *_] = client.get("/pet/animations").json()
    assert first["title"] == "Astro estornuda"
    assert first["source"] == "manual"
    assert first["enabled"] is True


def test_a_repeated_title_is_refused_whatever_its_case(client, pet) -> None:
    _save(client, title="Astro estornuda")
    assert _save(client, title="astro ESTORNUDA").status_code == 409


def test_an_animation_has_limits(client, pet) -> None:
    assert _save(client, title="").status_code == 422
    assert _save(client, title="x" * 61).status_code == 422
    assert _save(client, code="x" * 20_001).status_code == 422


def test_an_animation_is_turned_off_after_three_failures(client, pet) -> None:
    animation_id = _save(client).json()["id"]

    for _ in range(2):
        assert client.post(f"/pet/animations/{animation_id}/failures").json()["enabled"] is True
    failed = client.post(f"/pet/animations/{animation_id}/failures").json()

    assert failed["enabled"] is False
    assert failed["failures"] == 3
    assert animation_id not in [a["id"] for a in client.get("/pet/animations", params={"enabled": True}).json()]


def test_turning_an_animation_on_again_clears_its_failures(client, pet) -> None:
    animation_id = _save(client).json()["id"]
    for _ in range(3):
        client.post(f"/pet/animations/{animation_id}/failures")

    updated = client.patch(f"/pet/animations/{animation_id}", json={"enabled": True}).json()

    assert updated["enabled"] is True
    assert updated["failures"] == 0


def test_an_animation_is_edited_and_deleted(client, pet) -> None:
    animation_id = _save(client).json()["id"]

    updated = client.patch(f"/pet/animations/{animation_id}", json={"title": "Otro", "code": "await wait(1);"}).json()
    assert (updated["title"], updated["code"]) == ("Otro", "await wait(1);")

    assert client.delete(f"/pet/animations/{animation_id}").status_code == 204
    assert client.delete(f"/pet/animations/{animation_id}").status_code == 404
    assert client.patch(f"/pet/animations/{animation_id}", json={"enabled": False}).status_code == 404


def test_renaming_to_a_title_in_use_is_refused(client, pet) -> None:
    _save(client, title="Uno")
    other = _save(client, title="Dos").json()["id"]
    assert client.patch(f"/pet/animations/{other}", json={"title": "uno"}).status_code == 409


def test_messages_are_added_edited_and_deleted(client, pet) -> None:
    created = client.post("/pet/messages", json={"text": " Hola Daniel "})
    assert created.status_code == 201
    message_id = created.json()["id"]

    client.patch(f"/pet/messages/{message_id}", json={"enabled": False})
    assert client.get("/pet/messages", params={"enabled": True}).json() == []
    [message] = client.get("/pet/messages").json()
    assert message["text"] == "Hola Daniel"

    assert message["source"] == "manual"
    assert client.post("/pet/messages", json={"text": "x" * 141}).status_code == 422
    assert client.delete(f"/pet/messages/{message_id}").status_code == 204
    assert client.get("/pet/messages").json() == []


def test_the_guide_is_served(client, pet) -> None:
    response = client.get("/pet/guide")
    assert response.status_code == 200
    assert "face.set" in response.text


def _bridge(calls: list[httpx.Request], status: int = 202) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, json={"id": "x"})

    return httpx.MockTransport(handle)


@pytest.mark.anyio
async def test_astro_is_asked_with_the_guide_and_the_titles_in_use(pet) -> None:
    pet.add_message("Hola Daniel")
    calls: list[httpx.Request] = []
    settings = Settings(astro_api_token="secret", pet_save_url="http://server:3021")

    await request_animation(pet, settings, transport=_bridge(calls))

    [request] = calls
    assert request.url.path == "/pet/runs"
    assert request.headers["X-Astro-Token"] == "secret"
    prompt = json.loads(request.content)["message"]
    assert GUIDE in prompt
    assert all(f"- {title}" in prompt for title in pet.titles())
    assert "http://server:3021/pet/animations" in prompt
    # It may also leave a message, without repeating the ones there are
    assert "http://server:3021/pet/messages" in prompt
    assert "- Hola Daniel" in prompt
    assert [g.status for g in pet.generations()] == ["sent"]


@pytest.mark.anyio
async def test_the_request_is_marked_saved_when_astro_saves_an_animation(client, pet) -> None:
    await request_animation(pet, Settings(astro_api_token="secret"), transport=_bridge([]))

    _save(client, title="Nueva de Astro", source="ai")

    [generation] = pet.generations()
    assert (generation.status, generation.detail) == ("saved", "Nueva de Astro")


@pytest.mark.anyio
async def test_a_failed_request_is_recorded(pet) -> None:
    with pytest.raises(GenerationFailed):
        await request_animation(pet, Settings(astro_api_token="secret"), transport=_bridge([], status=502))
    with pytest.raises(GenerationFailed):
        await request_animation(pet, Settings(astro_api_token=None))

    assert [g.status for g in pet.generations()] == ["failed", "failed"]


def test_generate_answers_502_when_astro_is_not_configured(client, pet, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.pet.get_settings", lambda: Settings(astro_api_token=None))
    assert client.post("/pet/generate").status_code == 502
    assert client.get("/pet/generations").json()[0]["status"] == "failed"


def test_astro_can_leave_a_message(client, pet) -> None:
    response = client.post("/pet/messages", json={"text": "¡Buenas noches!", "source": "ai"})
    assert response.status_code == 201
    assert response.json()["source"] == "ai"


def test_an_old_database_gets_the_source_of_its_messages(tmp_path: Path) -> None:
    import sqlite3

    path = tmp_path / "pet.sqlite3"
    db = sqlite3.connect(path)
    db.execute(
        "CREATE TABLE messages (id INTEGER PRIMARY KEY, text TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, "
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    db.execute("INSERT INTO messages (text, created_at, updated_at) VALUES ('Hola', '2026-11-14T00:00:00+00:00', "
               "'2026-11-14T00:00:00+00:00')")
    db.commit()
    db.close()

    store = PetStore(path)
    [message] = store.messages()
    assert message.source == "manual"
    store.close()
