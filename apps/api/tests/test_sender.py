from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sender import SenderStore, clean_file_name, get_sender


@pytest.fixture
def store(tmp_path: Path) -> Iterator[SenderStore]:
    store = SenderStore(tmp_path / "sender")
    app.dependency_overrides[get_sender] = lambda: store
    yield store
    app.dependency_overrides.clear()


def _package(client: TestClient, files: dict[str, bytes], name: str = "Photos", pin: str = "1234") -> str:
    package_id = client.post("/sender/packages").json()["id"]
    for file_name, content in files.items():
        response = client.post(f"/sender/packages/{package_id}/files", params={"name": file_name}, content=content)
        assert response.status_code == 201
    assert client.post(f"/sender/packages/{package_id}/seal", json={"name": name, "pin": pin}).status_code == 200
    return package_id


def test_a_package_is_listed_once_sealed(client, store) -> None:
    draft = client.post("/sender/packages").json()["id"]
    client.post(f"/sender/packages/{draft}/files", params={"name": "a.txt"}, content=b"abc")
    assert client.get("/sender/packages").json() == []

    client.post(f"/sender/packages/{draft}/seal", json={"name": "  Photos ", "pin": "1234"})

    [package] = client.get("/sender/packages").json()
    assert package["name"] == "Photos"
    assert package["file_count"] == 1
    assert package["total_bytes"] == 3
    assert "files" not in package


def test_a_sealed_package_takes_no_more_files(client, store) -> None:
    package_id = _package(client, {"a.txt": b"abc"})
    response = client.post(f"/sender/packages/{package_id}/files", params={"name": "b.txt"}, content=b"x")
    assert response.status_code == 409


def test_an_empty_package_cannot_be_sealed(client, store) -> None:
    draft = client.post("/sender/packages").json()["id"]
    assert client.post(f"/sender/packages/{draft}/seal", json={"name": "x", "pin": "1234"}).status_code == 422


@pytest.mark.parametrize("pin", ["123", "12345", "abcd"])
def test_the_pin_has_four_digits(client, store, pin) -> None:
    draft = client.post("/sender/packages").json()["id"]
    client.post(f"/sender/packages/{draft}/files", params={"name": "a.txt"}, content=b"abc")
    assert client.post(f"/sender/packages/{draft}/seal", json={"name": "x", "pin": pin}).status_code == 422


def test_downloading_every_file_deletes_the_package(client, store) -> None:
    package_id = _package(client, {"a.txt": b"first", "b.txt": b"second"})
    unlocked = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()
    token = unlocked["token"]
    first, second = unlocked["files"]

    response = client.get(f"/sender/packages/{package_id}/files/{first['id']}", params={"token": token})
    assert response.content == b"first"
    assert 'filename="a.txt"' in response.headers["content-disposition"]
    [package] = client.get("/sender/packages").json()
    assert package["file_count"] == 1
    listed = client.get(f"/sender/packages/{package_id}/files", params={"token": token}).json()
    assert [f["downloaded"] for f in listed] == [True, False]

    again = client.get(f"/sender/packages/{package_id}/files/{first['id']}", params={"token": token})
    assert again.status_code == 404

    assert client.get(f"/sender/packages/{package_id}/files/{second['id']}", params={"token": token}).content == b"second"
    assert client.get("/sender/packages").json() == []
    assert not (store.root / package_id).exists()
    # The token dies with the package
    assert client.get(f"/sender/packages/{package_id}/files", params={"token": token}).status_code == 403


def test_a_download_cut_halfway_keeps_the_file(client, store) -> None:
    package_id = _package(client, {"big.bin": b"x" * (3 * 1024 * 1024)})
    unlocked = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()
    file_id = unlocked["files"][0]["id"]
    _, path = store.open_file(package_id, file_id, unlocked["token"])

    chunks = store.read_file(package_id, file_id, path)
    next(chunks)
    chunks.close()

    assert path.exists()
    assert client.get("/sender/packages").json()[0]["file_count"] == 1


def test_downloads_need_the_token(client, store) -> None:
    package_id = _package(client, {"a.txt": b"abc"})
    file_id = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()["files"][0]["id"]
    response = client.get(f"/sender/packages/{package_id}/files/{file_id}", params={"token": "nope"})
    assert response.status_code == 403


def test_five_wrong_pins_lock_the_package(client, store) -> None:
    package_id = _package(client, {"a.txt": b"abc"})
    for attempts_left in range(4, 0, -1):
        response = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "0000"})
        assert response.status_code == 401
        assert f"{attempts_left} tr" in response.json()["detail"]
    assert client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "0000"}).status_code == 429
    # Locked, not even the right PIN opens it
    assert client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).status_code == 429


def test_an_unlocked_package_can_be_deleted(client, store) -> None:
    package_id = _package(client, {"a.txt": b"abc"})
    token = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()["token"]
    assert client.delete(f"/sender/packages/{package_id}").status_code == 403
    assert client.delete(f"/sender/packages/{package_id}", params={"token": token}).status_code == 204
    assert client.get("/sender/packages").json() == []


def test_a_draft_can_be_discarded_and_lose_files(client, store) -> None:
    draft = client.post("/sender/packages").json()["id"]
    file_id = client.post(f"/sender/packages/{draft}/files", params={"name": "a.txt"}, content=b"abc").json()["id"]
    assert client.delete(f"/sender/packages/{draft}/files/{file_id}").status_code == 204
    assert client.delete(f"/sender/packages/{draft}").status_code == 204
    assert not (store.root / draft).exists()


def test_old_drafts_are_removed(store) -> None:
    draft = store.create()
    sealed = store.create()
    file_id, path = store.start_file(sealed.id)
    path.write_bytes(b"abc")
    store.add_file(sealed.id, file_id, "a.txt")
    store.seal(sealed.id, "x", "1234")

    assert store.remove_old_drafts(datetime.now(UTC) + timedelta(hours=1)) == 0
    assert store.remove_old_drafts(datetime.now(UTC) + timedelta(days=2)) == 1
    assert not (store.root / draft.id).exists()
    assert (store.root / sealed.id).exists()


def test_ids_that_are_not_ids_are_refused(client, store) -> None:
    assert client.post("/sender/packages/..%2F..%2Fetc/files", params={"name": "a"}, content=b"x").status_code in (404, 422)


def test_downloads_keep_names_with_accents(client, store) -> None:
    package_id = _package(client, {"ñandú.txt": b"abc"})
    unlocked = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()
    response = client.get(
        f"/sender/packages/{package_id}/files/{unlocked['files'][0]['id']}", params={"token": unlocked["token"]}
    )
    disposition = response.headers["content-disposition"]
    assert 'filename="nandu.txt"' in disposition
    assert "filename*=UTF-8''%C3%B1and%C3%BA.txt" in disposition


def test_files_keep_their_folder_and_download_with_their_own_name(client, store) -> None:
    package_id = _package(client, {"Photos/2024/a.jpg": b"abc"})
    unlocked = client.post(f"/sender/packages/{package_id}/unlock", json={"pin": "1234"}).json()
    assert unlocked["files"][0]["name"] == "Photos/2024/a.jpg"
    response = client.get(
        f"/sender/packages/{package_id}/files/{unlocked['files'][0]['id']}", params={"token": unlocked["token"]}
    )
    assert 'filename="a.jpg"' in response.headers["content-disposition"]


@pytest.mark.parametrize(
    ("name", "clean"),
    [
        ("../../etc/passwd", "etc/passwd"),
        ("C:\\Users\\me\\a.txt", "Users/me/a.txt"),
        ("..", "file"),
        ("a\x00b\n.txt", "ab.txt"),
        ("Photos//2024/./a.jpg", "Photos/2024/a.jpg"),
        ("/".join("abcdefghij") + ".txt", "c/d/e/f/g/h/i/j.txt"),
    ],
)
def test_file_names_are_cleaned(name, clean) -> None:
    assert clean_file_name(name) == clean
