import httpx

FOLDER = {
    "path": "notes",
    "entries": [
        {"name": "inner", "kind": "folder", "size": None, "modified": 1763020000.5, "link": False, "protected": False},
        {"name": "a.txt", "kind": "file", "size": 5, "modified": 1763020000.5, "link": False, "protected": False},
    ],
    "disk": {"total": 1000, "free": 400},
}


def test_lists_a_folder(client, upstreams) -> None:
    calls = upstreams(agent={"/files": FOLDER})
    response = client.get("/files", params={"path": "notes"})
    assert response.status_code == 200
    assert response.json() == FOLDER
    assert calls[0].url.params["path"] == "notes"


def test_passes_the_agents_refusals_through(client, upstreams) -> None:
    upstreams(agent={"/files/delete": (403, {"detail": "videos is used by an app on the server and cannot be deleted"})})
    response = client.post("/files/delete", params={"path": "videos"})
    assert response.status_code == 403
    assert response.json()["detail"].startswith("videos is used")


def test_disk_not_mounted(client, upstreams) -> None:
    upstreams(agent={"/files": (503, {"detail": "The external disk is not mounted"})})
    assert client.get("/files").status_code == 503


def test_renames_deletes_and_creates(client, upstreams) -> None:
    calls = upstreams(
        agent={
            "/files/rename": {"path": "notes/b.txt"},
            "/files/delete": {"path": "notes/b.txt"},
            "/files/mkdir": {"path": "New"},
        }
    )
    assert client.post("/files/rename", params={"path": "notes/a.txt", "name": "b.txt"}).json() == {"path": "notes/b.txt"}
    assert client.post("/files/delete", params={"path": "notes/b.txt"}).json() == {"path": "notes/b.txt"}
    assert client.post("/files/mkdir", params={"name": "New"}).json() == {"path": "New"}
    assert [c.method for c in calls] == ["POST", "POST", "POST"]
    assert calls[0].url.params["name"] == "b.txt"
    assert client.post("/files/rename", params={"path": "a"}).status_code == 422


def test_streams_a_download_with_its_headers(client, upstreams) -> None:
    disposition = "attachment; filename=\"a.txt\"; filename*=UTF-8''a.txt"
    upstreams(
        agent={
            "/files/download": httpx.Response(
                200,
                stream=httpx.ByteStream(b"hello"),
                headers={"Content-Type": "application/octet-stream", "Content-Disposition": disposition, "Content-Length": "5"},
            )
        }
    )
    response = client.get("/files/download", params={"path": "notes/a.txt"})
    assert response.status_code == 200
    assert response.content == b"hello"
    assert response.headers["content-disposition"] == disposition


def test_download_refused(client, upstreams) -> None:
    upstreams(agent={"/files/download": (404, {"detail": "There is no such file"})})
    response = client.get("/files/download", params={"path": "missing"})
    assert response.status_code == 404
    assert response.json()["detail"] == "There is no such file"
