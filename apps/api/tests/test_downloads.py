import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.downloader import MAX_ATTEMPTS, Download, Downloader, _name_from_disposition
from app.main import app

CONTENT = bytes(range(256)) * 400  # 100 KiB


class Stream(httpx.AsyncByteStream):
    """A body sent in pieces, as from the network; with `limit` it loses the connection after that many bytes."""

    def __init__(self, data: bytes, limit: int | None = None) -> None:
        self.data = data
        self.limit = limit

    async def __aiter__(self) -> AsyncIterator[bytes]:
        end = len(self.data) if self.limit is None else self.limit
        for start in range(0, end, 4096):
            yield self.data[start : min(start + 4096, end)]
        if self.limit is not None:
            raise httpx.ReadError("connection reset")


class FileServer:
    """Serves CONTENT at any path, honouring Range unless told not to, and cutting the first `cuts` answers after
    `cut_after` bytes."""

    def __init__(self, cuts: int = 0, cut_after: int = 30_000, ranges: bool = True, status: int = 200) -> None:
        self.cuts = cuts
        self.cut_after = cut_after
        self.ranges = ranges
        self.status = status
        self.requests: list[httpx.Request] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status)
        start = 0
        headers = {"ETag": '"v1"', "Content-Disposition": "attachment; filename*=UTF-8''v%C3%ADdeo.bin"}
        range_header = request.headers.get("range")
        if self.ranges and range_header:
            start = int(range_header.removeprefix("bytes=").rstrip("-"))
            if start >= len(CONTENT):
                return httpx.Response(416, headers={"Content-Range": f"bytes */{len(CONTENT)}"})
            headers["Content-Range"] = f"bytes {start}-{len(CONTENT) - 1}/{len(CONTENT)}"
        body = CONTENT[start:]
        headers["Content-Length"] = str(len(body))
        code = 206 if start else 200
        if self.cuts > 0:
            self.cuts -= 1
            return httpx.Response(code, headers=headers, stream=Stream(body, self.cut_after))
        return httpx.Response(code, headers=headers, stream=Stream(body))

    def downloader(self, root: Path, **kwargs) -> Downloader:
        return Downloader(root, transport=httpx.MockTransport(self.handle), retry_delay=lambda _: 0, **kwargs)


async def _wait(downloader: Downloader, download_id: str, *states: str) -> Download:
    for _ in range(500):
        [download] = [d for d in downloader.downloads() if d.id == download_id]
        if download.state in states:
            return download
        await asyncio.sleep(0.01)
    raise AssertionError(f"Still {download.state}")


def test_a_download_is_saved_whole_with_the_name_the_server_offers(tmp_path) -> None:
    async def run() -> None:
        downloader = FileServer().downloader(tmp_path)
        download = await downloader.add("https://example.com/files/x?dl=1")
        done = await _wait(downloader, download.id, "done")
        assert done.name == "vídeo.bin"
        assert done.size == len(CONTENT)
        assert downloader.file(download.id)[1].read_bytes() == CONTENT
        await downloader.aclose()

    asyncio.run(run())


def test_each_cut_resumes_from_the_bytes_it_has(tmp_path) -> None:
    async def run() -> None:
        server = FileServer(cuts=3, cut_after=20_000)
        downloader = server.downloader(tmp_path)
        download = await downloader.add("https://example.com/big.bin", name="big.bin")
        await _wait(downloader, download.id, "done")
        assert downloader.file(download.id)[1].read_bytes() == CONTENT
        ranges = [r.headers.get("range") for r in server.requests]
        assert ranges == [None, "bytes=20000-", "bytes=40000-", "bytes=60000-"]
        assert all(r.headers.get("if-range") == '"v1"' for r in server.requests[1:])
        await downloader.aclose()

    asyncio.run(run())


def test_a_server_that_ignores_range_starts_over_cleanly(tmp_path) -> None:
    async def run() -> None:
        server = FileServer(cuts=1, ranges=False)
        downloader = server.downloader(tmp_path)
        download = await downloader.add("https://example.com/a.bin")
        await _wait(downloader, download.id, "done")
        assert downloader.file(download.id)[1].read_bytes() == CONTENT
        await downloader.aclose()

    asyncio.run(run())


def test_it_gives_up_after_many_cuts_in_a_row_without_progress(tmp_path) -> None:
    async def run() -> None:
        server = FileServer(cuts=100, cut_after=0)
        downloader = server.downloader(tmp_path)
        download = await downloader.add("https://example.com/a.bin")
        failed = await _wait(downloader, download.id, "failed")
        assert failed.attempts == MAX_ATTEMPTS
        assert len(server.requests) == MAX_ATTEMPTS
        assert "cut" in (failed.error or "")

        # Retrying goes on from scratch with a new count, and the connection works now
        server.cuts = 0
        await downloader.resume(download.id)
        await _wait(downloader, download.id, "done")
        await downloader.aclose()

    asyncio.run(run())


def test_a_slow_link_that_keeps_making_progress_never_gives_up(tmp_path) -> None:
    async def run() -> None:
        # More cuts than MAX_ATTEMPTS, but every one brings some bytes
        server = FileServer(cuts=MAX_ATTEMPTS + 5, cut_after=5_000)
        downloader = server.downloader(tmp_path)
        download = await downloader.add("https://example.com/a.bin")
        await _wait(downloader, download.id, "done")
        assert downloader.file(download.id)[1].read_bytes() == CONTENT
        await downloader.aclose()

    asyncio.run(run())


@pytest.mark.parametrize("code", [403, 404])
def test_a_client_error_fails_without_retrying(tmp_path, code) -> None:
    async def run() -> None:
        server = FileServer(status=code)
        downloader = server.downloader(tmp_path)
        download = await downloader.add("https://example.com/a.bin")
        failed = await _wait(downloader, download.id, "failed")
        assert failed.error == f"The server answered {code}"
        assert len(server.requests) == 1
        await downloader.aclose()

    asyncio.run(run())


def test_a_restart_goes_on_from_the_bytes_on_disk(tmp_path) -> None:
    # As the API leaves a download when it stops in the middle of one
    folder = tmp_path / ("a" * 32)
    folder.mkdir()
    (folder / "data").write_bytes(CONTENT[:50_000])
    stopped = Download(
        id="a" * 32,
        url="https://example.com/a.bin",
        name="a.bin",
        created_at="2026-11-13T10:00:00+00:00",
        state="downloading",
        size=len(CONTENT),
        validator='"v1"',
    )
    (folder / "download.json").write_text(json.dumps(stopped.__dict__))

    async def run() -> None:
        server = FileServer()
        downloader = server.downloader(tmp_path)
        await downloader.start()
        await _wait(downloader, stopped.id, "done")
        assert [r.headers.get("range") for r in server.requests] == ["bytes=50000-"]
        assert downloader.file(stopped.id)[1].read_bytes() == CONTENT
        await downloader.aclose()

    asyncio.run(run())


def test_pausing_keeps_the_bytes_and_resuming_goes_on(tmp_path) -> None:
    async def run() -> None:
        server = FileServer(cuts=1, cut_after=40_000)
        # The cut waits long enough to pause during it
        downloader = Downloader(tmp_path, transport=httpx.MockTransport(server.handle), retry_delay=lambda _: 60)
        download = await downloader.add("https://example.com/a.bin")
        for _ in range(500):
            if downloader.downloads()[0].retry_at:
                break
            await asyncio.sleep(0.01)
        paused = await downloader.pause(download.id)
        assert paused.state == "paused"
        assert downloader.received(paused) == 40_000

        await downloader.resume(download.id)
        await _wait(downloader, download.id, "done")
        assert server.requests[-1].headers["range"] == "bytes=40000-"
        await downloader.aclose()

    asyncio.run(run())


def test_parallel_limit(tmp_path) -> None:
    async def run() -> None:
        server = FileServer(cuts=100, cut_after=0)
        downloader = Downloader(
            tmp_path, parallel=1, transport=httpx.MockTransport(server.handle), retry_delay=lambda _: 60
        )
        first = await downloader.add("https://example.com/a.bin")
        await asyncio.sleep(0.05)
        second = await downloader.add("https://example.com/b.bin")
        await asyncio.sleep(0.05)
        states = {d.id: d.state for d in downloader.downloads()}
        assert states == {first.id: "downloading", second.id: "queued"}
        # Deleting the running one lets the next start
        await downloader.delete(first.id)
        await asyncio.sleep(0.05)
        assert [d.state for d in downloader.downloads()] == ["downloading"]
        await downloader.aclose()

    asyncio.run(run())


@pytest.mark.parametrize(
    ("header", "name"),
    [
        ('attachment; filename="report.pdf"', "report.pdf"),
        ("attachment; filename=plain.zip", "plain.zip"),
        ("attachment; filename=\"a.txt\"; filename*=UTF-8''%C3%B1and%C3%BA.txt", "ñandú.txt"),
        ("inline", None),
    ],
)
def test_the_name_from_content_disposition(header, name) -> None:
    assert _name_from_disposition(header) == name


@pytest.fixture
def api(tmp_path: Path) -> Iterator[TestClient]:
    """The app with only the Downloader, against the fake file server."""
    server = FileServer()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        app.state.downloader = server.downloader(tmp_path)
        await app.state.downloader.start()
        yield
        await app.state.downloader.aclose()

    original = app.router.lifespan_context
    app.router.lifespan_context = lifespan
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.router.lifespan_context = original


def _wait_api(client: TestClient, download_id: str, state: str) -> dict:
    for _ in range(500):
        [download] = [d for d in client.get("/downloads").json() if d["id"] == download_id]
        if download["state"] == state:
            return download
        client.portal.call(asyncio.sleep, 0.01)
    raise AssertionError(download["state"])


def test_the_api_downloads_and_serves_the_file_with_ranges(api) -> None:
    created = api.post("/downloads", json={"url": " https://example.com/x.bin ", "name": "mine.bin"})
    assert created.status_code == 201
    download = _wait_api(api, created.json()["id"], "done")
    assert download["name"] == "mine.bin"
    assert download["received"] == download["size"] == len(CONTENT)

    whole = api.get(f"/downloads/{download['id']}/file")
    assert whole.content == CONTENT
    assert 'filename="mine.bin"' in whole.headers["content-disposition"]
    assert whole.headers["accept-ranges"] == "bytes"

    part = api.get(f"/downloads/{download['id']}/file", headers={"Range": "bytes=1000-"})
    assert part.status_code == 206
    assert part.content == CONTENT[1000:]

    assert api.post(f"/downloads/{download['id']}/pause").status_code == 409
    assert api.delete(f"/downloads/{download['id']}").status_code == 204
    assert api.get("/downloads").json() == []
    assert api.get(f"/downloads/{download['id']}/file").status_code == 404


@pytest.mark.parametrize("url", ["ftp://example.com/a", "example.com/a", "javascript:alert(1)", ""])
def test_only_http_links(api, url) -> None:
    assert api.post("/downloads", json={"url": url}).status_code == 422
