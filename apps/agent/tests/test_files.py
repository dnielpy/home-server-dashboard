import io
import json
import sys
import threading
import time
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


def test_downloads_several_entries_of_a_folder_in_one_zip(disk: files.Disk) -> None:
    download = disk.download_many(["notes/a.txt", "notes/inner", "notes/a.txt"])
    assert download.name == "notes.zip"
    out = io.BytesIO()
    download.write(out)
    with zipfile.ZipFile(io.BytesIO(out.getvalue())) as archive:
        assert sorted(archive.namelist()) == ["a.txt", "inner/b.txt"]
    assert disk.download_many(["notes/a.txt"]).size == 5
    assert disk.download_many(["notes", "Zebra.txt"]).name == "External disk.zip"
    assert error(lambda: disk.download_many(["notes/a.txt", "Zebra.txt"])).status == 400
    assert error(lambda: disk.download_many(["notes/a.txt", "notes/missing"])).status == 404
    assert error(lambda: disk.download_many([])).status == 400


def test_a_file_downloads_in_parts_so_it_can_resume(disk: files.Disk) -> None:
    whole = disk.download("notes/a.txt")
    headers = whole.headers()
    assert headers["Accept-Ranges"] == "bytes"
    assert headers["ETag"].startswith('"') and headers["Last-Modified"].endswith("GMT")

    def part(range_header: str, if_range: str | None = None) -> tuple[bytes, dict[str, str]]:
        download = whole.ranged(range_header, if_range)
        out = io.BytesIO()
        download.write(out)
        return out.getvalue(), download.headers()

    body, headers = part("bytes=2-")
    assert body == b"llo"
    assert headers["Content-Range"] == "bytes 2-4/5" and headers["Content-Length"] == "3"
    assert part("bytes=1-2")[0] == b"el"
    assert part("bytes=-2")[0] == b"lo"
    assert part("bytes=3-99")[0] == b"lo"
    # Same file: the part; another one (or a bad range): the whole file again
    assert part("bytes=2-", whole.etag)[0] == b"llo"
    assert part("bytes=2-", headers["Last-Modified"])[0] == b"llo"
    assert part("bytes=2-", '"other"')[0] == b"hello"
    assert part("bytes=0-1,3-4")[0] == b"hello"
    assert part("items=2-")[0] == b"hello"
    assert part("bytes=abc")[0] == b"hello"
    assert error(lambda: whole.ranged("bytes=5-")).status == 416
    # A zip made on the fly has no size, so it is not resumable
    folder = disk.download("notes")
    assert folder.headers()["Accept-Ranges"] == "none"
    assert folder.ranged("bytes=2-") is folder


def test_the_etag_changes_with_the_file(disk: files.Disk) -> None:
    before = disk.download("notes/a.txt").etag
    (disk.root / "notes" / "a.txt").write_text("hello again")
    assert disk.download("notes/a.txt").etag != before


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
        ranged = urllib.request.Request(f"{base}/files/download?path=notes%2Fa.txt", headers={"Range": "bytes=1-"})
        with urllib.request.urlopen(ranged) as response:
            assert response.status == 206
            assert response.headers["Content-Range"] == "bytes 1-4/5"
            assert response.read() == b"ello"
        head = urllib.request.Request(f"{base}/files/download?path=notes%2Fa.txt", method="HEAD")
        with urllib.request.urlopen(head) as response:
            assert response.headers["Content-Length"] == "5" and response.read() == b""
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(
                urllib.request.Request(f"{base}/files/download?path=notes%2Fa.txt", headers={"Range": "bytes=9-"})
            )
        assert caught.value.code == 416 and caught.value.headers["Content-Range"] == "bytes */5"
        request = urllib.request.Request(f"{base}/files/rename?path=notes%2Fa.txt&name=c.txt", method="POST")
        with urllib.request.urlopen(request) as response:
            assert json.load(response) == {"path": "notes/c.txt"}
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(urllib.request.Request(f"{base}/files/delete?path=videos", method="POST"))
        assert caught.value.code == 403
    finally:
        server.shutdown()


def test_moves_files_and_folders_into_another_folder(disk: files.Disk) -> None:
    (disk.root / "archive").mkdir()
    assert disk.move("Zebra.txt", "archive") == {"path": "archive/Zebra.txt"}
    assert (disk.root / "archive" / "Zebra.txt").read_text() == "z"
    assert disk.move("notes/inner", "") == {"path": "inner"}
    assert (disk.root / "inner" / "b.txt").read_text() == "world"
    assert not (disk.root / "notes" / "inner").exists()


def test_move_refuses_clashes_loops_and_the_apps_folders(disk: files.Disk) -> None:
    (disk.root / "other").mkdir()
    (disk.root / "other" / "a.txt").write_text("other")
    assert error(lambda: disk.move("notes/a.txt", "other")).status == 409
    assert error(lambda: disk.move("notes/a.txt", "notes")).status == 409
    assert error(lambda: disk.move("notes", "notes/inner")).status == 400
    assert error(lambda: disk.move("notes", "notes")).status == 400
    assert error(lambda: disk.move("videos", "notes")).status == 403
    assert error(lambda: disk.move("notes/a.txt", "missing")).status == 404
    assert error(lambda: disk.move("missing.txt", "notes")).status == 404
    assert error(lambda: disk.move("notes", "../")).status == 400
    # Into an app's folder is fine, the folder itself is what cannot move
    assert disk.move("notes/a.txt", "videos") == {"path": "videos/a.txt"}


def wait(transfers: files.Transfers, job_id: str) -> dict:
    for _ in range(200):
        job = next(j for j in transfers.list() if j["id"] == job_id)
        if job["state"] != "running":
            return job
        time.sleep(0.01)
    raise AssertionError("the copy did not end")


def test_copies_in_the_background_with_a_free_name(disk: files.Disk) -> None:
    transfers = files.Transfers()
    job = transfers.start(disk, "notes", "videos")
    assert job["target"] == "videos/notes"
    assert job["total"] == len("hello") + len("world")
    done = wait(transfers, job["id"])
    assert done["state"] == "done"
    assert done["done"] == done["total"]
    assert (disk.root / "videos" / "notes" / "inner" / "b.txt").read_text() == "world"
    assert (disk.root / "notes" / "a.txt").exists()

    # Copying it again next to itself gets "(copy)", then "(copy 2)"
    assert transfers.start(disk, "notes", "")["target"] == "notes (copy)"
    wait(transfers, transfers.list()[0]["id"])
    assert transfers.start(disk, "Zebra.txt", "")["target"] == "Zebra (copy).txt"
    wait(transfers, transfers.list()[0]["id"])
    assert transfers.start(disk, "notes", "")["target"] == "notes (copy 2)"
    wait(transfers, transfers.list()[0]["id"])
    # The apps' folders can be copied, only not moved
    assert transfers.start(disk, "videos/clip.mp4", "notes")["target"] == "notes/clip.mp4"


def test_copy_refuses_loops_and_a_full_disk(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    transfers = files.Transfers()
    assert error(lambda: transfers.start(disk, "notes", "notes/inner")).status == 400
    assert error(lambda: transfers.start(disk, "", "notes")).status == 403
    usage = files.shutil.disk_usage(disk.root)
    monkeypatch.setattr(files.shutil, "disk_usage", lambda _: usage._replace(free=3))
    assert error(lambda: transfers.start(disk, "notes", "")).status == 409


def test_a_cancelled_or_failed_copy_leaves_nothing(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    transfers = files.Transfers()
    started = threading.Event()
    release = threading.Event()
    real_copy_file = files.copy_file

    def slow_copy_file(source, target, job):
        started.set()
        release.wait(5)
        real_copy_file(source, target, job)

    monkeypatch.setattr(files, "copy_file", slow_copy_file)
    job = transfers.start(disk, "notes", "videos")
    started.wait(5)
    assert transfers.cancel(job["id"])["state"] == "running"
    release.set()
    assert wait(transfers, job["id"])["state"] == "cancelled"
    assert not (disk.root / "videos" / "notes").exists()
    assert error(lambda: transfers.cancel(job["id"])).status == 409
    assert error(lambda: transfers.cancel("0" * 32)).status == 404

    def broken_copy_file(source, target, job):
        raise PermissionError(13, "Permission denied", str(source))

    monkeypatch.setattr(files, "copy_file", broken_copy_file)
    failed = wait(transfers, transfers.start(disk, "notes", "videos")["id"])
    assert failed["state"] == "failed"
    assert failed["error"] == "Permission denied: a.txt"
    assert not (disk.root / "videos" / "notes").exists()


def test_compresses_into_a_zip_next_to_what_goes_in_it(disk: files.Disk) -> None:
    transfers = files.Transfers()
    (disk.root / "notes" / "empty").mkdir()
    job = transfers.zip(disk, ["notes"])
    assert (job["kind"], job["target"], job["count"]) == ("zip", "notes.zip", 1)
    assert job["total"] == len("hello") + len("world")
    done = wait(transfers, job["id"])
    assert done["state"] == "done" and done["done"] == done["total"]
    with zipfile.ZipFile(disk.root / "notes.zip") as archive:
        assert sorted(archive.namelist()) == [
            "notes/", "notes/a.txt", "notes/empty/", "notes/inner/", "notes/inner/b.txt",
        ]
        assert archive.read("notes/inner/b.txt") == b"world"
        assert archive.getinfo("notes/a.txt").compress_type == zipfile.ZIP_DEFLATED

    # A file is named without its extension, and a taken name gets " (2)"
    assert transfers.zip(disk, ["videos/clip.mp4"])["target"] == "videos/clip.zip"
    wait(transfers, transfers.list()[0]["id"])
    with zipfile.ZipFile(disk.root / "videos" / "clip.zip") as archive:
        assert archive.getinfo("clip.mp4").compress_type == zipfile.ZIP_STORED
    several = transfers.zip(disk, ["notes/a.txt", "notes/inner"])
    assert (several["target"], several["count"]) == ("notes/notes.zip", 2)
    wait(transfers, several["id"])
    assert transfers.zip(disk, ["notes"])["target"] == "notes (2).zip"
    wait(transfers, transfers.list()[0]["id"])
    with zipfile.ZipFile(disk.root / "notes" / "notes.zip") as archive:
        assert sorted(archive.namelist()) == ["a.txt", "inner/", "inner/b.txt"]


def test_zip_refuses_the_disk_other_folders_and_a_full_disk(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    transfers = files.Transfers()
    assert error(lambda: transfers.zip(disk, [])).status == 400
    assert error(lambda: transfers.zip(disk, [""])).status == 403
    assert error(lambda: transfers.zip(disk, ["notes/a.txt", "Zebra.txt"])).status == 400
    assert error(lambda: transfers.zip(disk, ["nope"])).status == 404
    usage = files.shutil.disk_usage(disk.root)
    monkeypatch.setattr(files.shutil, "disk_usage", lambda _: usage._replace(free=3))
    assert error(lambda: transfers.zip(disk, ["notes"])).status == 409


def test_a_cancelled_zip_leaves_nothing(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    transfers = files.Transfers()
    started = threading.Event()
    release = threading.Event()
    real_zip_file = files.zip_file

    def slow_zip_file(archive, file, name, job):
        started.set()
        release.wait(5)
        real_zip_file(archive, file, name, job)

    monkeypatch.setattr(files, "zip_file", slow_zip_file)
    job = transfers.zip(disk, ["notes"])
    started.wait(5)
    transfers.cancel(job["id"])
    release.set()
    assert wait(transfers, job["id"])["state"] == "cancelled"
    assert not (disk.root / "notes.zip").exists()


def test_agent_moves_and_copies(disk: files.Disk, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent, "external_disk", lambda: disk)
    monkeypatch.setattr(agent, "TRANSFERS", files.Transfers())
    server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

    def post(path: str) -> dict:
        with urllib.request.urlopen(urllib.request.Request(f"{base}{path}", method="POST")) as response:
            return json.load(response)

    try:
        assert post("/files/move?path=Zebra.txt&to=notes") == {"path": "notes/Zebra.txt"}
        job = post("/files/copy?path=notes&to=videos")
        assert job["state"] == "running" and job["target"] == "videos/notes"
        assert wait(agent.TRANSFERS, job["id"])["state"] == "done"
        zipping = post("/files/zip?path=notes/a.txt&path=notes/inner")
        assert zipping["kind"] == "zip" and zipping["target"] == "notes/notes.zip"
        assert wait(agent.TRANSFERS, zipping["id"])["state"] == "done"
        with urllib.request.urlopen(f"{base}/files/transfers") as response:
            assert [j["id"] for j in json.load(response)] == [zipping["id"], job["id"]]
        with pytest.raises(urllib.error.HTTPError) as caught:
            post(f"/files/transfers/{job['id']}/cancel")
        assert caught.value.code == 409
    finally:
        server.shutdown()


def test_moves_files_and_what_folders_have_into_the_gallery(disk: files.Disk) -> None:
    gallery = disk.root / "gallery"
    gallery.mkdir()
    (gallery / "a.txt").write_text("taken")
    (disk.root / "album").mkdir()
    (disk.root / "album" / "photo.jpg").write_bytes(b"jpg")
    assert disk.to_gallery("notes") == {"path": "gallery"}
    assert not (disk.root / "notes").exists()
    assert (gallery / "a (2).txt").read_text() == "hello"
    assert (gallery / "inner" / "b.txt").read_text() == "world"
    assert disk.to_gallery("Zebra.txt") == {"path": "gallery"}
    assert (gallery / "Zebra.txt").read_text() == "z"
    assert disk.to_gallery("album/photo.jpg") == {"path": "gallery"}
    assert (disk.root / "album").is_dir()
    # A folder already in the gallery is emptied into its top as well
    assert disk.to_gallery("gallery/inner") == {"path": "gallery"}
    assert (gallery / "b.txt").read_text() == "world"
    assert not (gallery / "inner").exists()


def test_to_gallery_refuses_the_apps_folders_and_what_is_already_there(disk: files.Disk) -> None:
    assert error(lambda: disk.to_gallery("notes")).status == 404
    (disk.root / "gallery").mkdir()
    (disk.root / "gallery" / "x.jpg").write_bytes(b"x")
    assert error(lambda: disk.to_gallery("gallery/x.jpg")).status == 409
    assert error(lambda: disk.to_gallery("gallery")).status == 403
    assert error(lambda: disk.to_gallery("videos")).status == 403
    assert error(lambda: disk.to_gallery("")).status == 403
    assert error(lambda: disk.to_gallery("missing")).status == 404
