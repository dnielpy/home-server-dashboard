import io
import json
import sys
import threading
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent  # noqa: E402
import files  # noqa: E402


@pytest.fixture
def disk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> files.Disk:
    root = tmp_path / "disk"
    root.mkdir()
    monkeypatch.setattr(files.os.path, "ismount", lambda path: Path(path) == root.resolve())
    (root / "videos").mkdir()
    (root / "videos" / "clip.mp4").write_bytes(b"video")
    (root / "docker").mkdir()
    (root / "notes").mkdir()
    (root / "notes" / "a.txt").write_text("hello")
    (root / "notes" / "inner").mkdir()
    (root / "notes" / "inner" / "b.txt").write_text("world")
    (root / "Zebra.txt").write_text("z")
    return files.Disk(root)


def error(action) -> files.FilesError:
    with pytest.raises(files.FilesError) as caught:
        action()
    return caught.value


def test_lists_folders_first_and_hides_dockers_data(disk: files.Disk) -> None:
    listing = disk.listing("")
    assert [(e["name"], e["kind"]) for e in listing["entries"]] == [
        ("notes", "folder"),
        ("videos", "folder"),
        ("Zebra.txt", "file"),
    ]
    assert listing["path"] == ""
    assert next(e for e in listing["entries"] if e["name"] == "videos")["protected"] is True
    assert listing["disk"]["total"] > 0
    assert [e["name"] for e in disk.listing("notes/")["entries"]] == ["inner", "a.txt"]
    assert disk.listing("notes/inner")["path"] == "notes/inner"


def test_refuses_paths_outside_the_disk(disk: files.Disk, tmp_path: Path) -> None:
    assert error(lambda: disk.listing("../")).status == 400
    assert error(lambda: disk.listing("docker")).status == 404
    (tmp_path / "secret").mkdir()
    (disk.root / "escape").symlink_to(tmp_path / "secret")
    assert error(lambda: disk.listing("escape")).status == 403
    assert error(lambda: disk.delete("escape")).status == 403


def test_needs_the_disk_mounted(tmp_path: Path) -> None:
    assert error(lambda: files.Disk(tmp_path).listing("")).status == 503
    assert error(lambda: files.Disk(None).listing("")).status == 503


def test_renames_and_refuses_clashes(disk: files.Disk) -> None:
    assert disk.rename("notes/a.txt", " b-renamed.txt ") == {"path": "notes/b-renamed.txt"}
    assert (disk.root / "notes" / "b-renamed.txt").read_text() == "hello"
    assert error(lambda: disk.rename("notes/b-renamed.txt", "inner")).status == 409
    assert error(lambda: disk.rename("notes/b-renamed.txt", "x/y")).status == 400
    assert error(lambda: disk.rename("notes/b-renamed.txt", "..")).status == 400
    assert error(lambda: disk.rename("notes", "videos")).status == 409
    assert error(lambda: disk.rename("videos", "films")).status == 403
    assert error(lambda: disk.rename("missing.txt", "x")).status == 404


def test_deletes_files_and_folders_but_not_the_apps_folders(disk: files.Disk) -> None:
    disk.delete("Zebra.txt")
    disk.delete("notes")
    assert not (disk.root / "Zebra.txt").exists()
    assert not (disk.root / "notes").exists()
    disk.delete("videos/clip.mp4")
    assert error(lambda: disk.delete("videos")).status == 403
    assert error(lambda: disk.delete("")).status == 403
    assert error(lambda: disk.delete("nothing")).status == 404


def test_creates_folders(disk: files.Disk) -> None:
    assert disk.mkdir("notes", "New") == {"path": "notes/New"}
    assert (disk.root / "notes" / "New").is_dir()
    assert error(lambda: disk.mkdir("notes", "New")).status == 409
    assert error(lambda: disk.mkdir("", "docker")).status == 409


def test_downloads_a_file_as_it_is_and_a_folder_as_a_zip(disk: files.Disk) -> None:
    download = disk.download("notes/a.txt")
    assert download.headers()["Content-Length"] == "5"
    out = io.BytesIO()
    download.write(out)
    assert out.getvalue() == b"hello"

    folder = disk.download("notes")
    assert folder.name == "notes.zip"
    assert "Content-Length" not in folder.headers()
    out = io.BytesIO()
    folder.write(out)
    with zipfile.ZipFile(io.BytesIO(out.getvalue())) as archive:
        assert sorted(archive.namelist()) == ["notes/a.txt", "notes/inner/b.txt"]
        assert archive.read("notes/inner/b.txt") == b"world"
    assert error(lambda: disk.download("")).status == 403


def test_content_disposition_keeps_non_ascii_names() -> None:
    headers = files.Download(Path("x"), "canción ñ.mp4", 1, "application/octet-stream").headers()
    assert 'filename="cancion n.mp4"' in headers["Content-Disposition"]
    assert "filename*=UTF-8''canci%C3%B3n%20%C3%B1.mp4" in headers["Content-Disposition"]


def test_agent_serves_the_files(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent, "external_disk", lambda: disk)
    server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with urllib.request.urlopen(f"{base}/files?path=notes") as response:
            assert [e["name"] for e in json.load(response)["entries"]] == ["inner", "a.txt"]
        with urllib.request.urlopen(f"{base}/files/download?path=notes") as response:
            assert response.headers["Content-Type"] == "application/zip"
            with zipfile.ZipFile(io.BytesIO(response.read())) as archive:
                assert "notes/a.txt" in archive.namelist()
        request = urllib.request.Request(f"{base}/files/rename?path=notes%2Fa.txt&name=c.txt", method="POST")
        with urllib.request.urlopen(request) as response:
            assert json.load(response) == {"path": "notes/c.txt"}
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(urllib.request.Request(f"{base}/files/delete?path=videos", method="POST"))
        assert caught.value.code == 403
    finally:
        server.shutdown()
