"""The Downloader: files the server downloads from a link by itself, so a big one does not need a device to stay on,
and that any device then takes from the server.

Made for a weak connection: every cut is retried after a growing wait, and each retry asks only for the rest of the
file (Range) instead of starting over. The bytes already on disk are the progress, so a download also goes on from
where it was after the API restarts or the server loses power.

No database, like Sender: each download is a folder with its metadata in download.json and its bytes in data, named by
id so the names of the files never become paths.
"""

import asyncio
import errno
import json
import logging
import os
import random
import re
import shutil
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Annotated, BinaryIO, Literal
from urllib.parse import unquote, urlsplit

import httpx
from fastapi import Depends, Request

from app.sender import FREE_SPACE_MARGIN_BYTES, clean_file_name

log = logging.getLogger(__name__)

State = Literal["queued", "downloading", "paused", "done", "failed"]

# Cuts in a row with no new byte in between before a download gives up. A cut after some progress starts the count
# again, so a slow link that keeps working never gives up
MAX_ATTEMPTS = 10
RETRY_BASE_SECONDS = 2
RETRY_MAX_SECONDS = 60
# A Retry-After longer than this is not waited for whole
RETRY_AFTER_MAX_SECONDS = 300
# A minute without a byte counts as a cut; connecting gets a while too, for the latency
TIMEOUT = httpx.Timeout(connect=30, read=60, write=30, pool=30)
MAX_REDIRECTS = 10
# The bytes go to disk in pieces this big
WRITE_BYTES = 1024 * 1024
# How often the progress is saved for sure (the metadata, and an fsync of the bytes), so a blackout loses at most this
SAVE_SECONDS = 5
SPEED_WINDOW_SECONDS = 5
# Some servers turn away clients that do not say who they are
USER_AGENT = "Mozilla/5.0 (compatible; HomeServerDashboard/1.0)"
# Answers worth trying again; any other 4xx will not change
RETRY_STATUSES = {408, 425, 429}


class DownloadNotFound(Exception):
    pass


class NotFinished(Exception):
    pass


class AlreadyFinished(Exception):
    pass


class _Retry(Exception):
    """A cut worth trying again."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class _Fail(Exception):
    """A problem trying again will not fix."""


@dataclass
class Download:
    id: str
    url: str
    name: str
    created_at: str
    state: State = "queued"
    # Whether the name was given when adding it; otherwise the one the server offers the file with replaces the link's
    named: bool = False
    # The whole file's size, once the server said it
    size: int | None = None
    # What identifies this version of the file (ETag or Last-Modified). It goes back on resuming (If-Range), so a file
    # that changed on the server starts over instead of mixing both
    validator: str | None = None
    # The last cut, while it is retried, or why it failed
    error: str | None = None
    attempts: int = 0
    # When the next try is, as epoch seconds
    retry_at: float | None = None
    finished_at: str | None = None


def _backoff(attempt: int) -> float:
    """2, 4, 8… seconds up to a minute, a bit off each time so many downloads do not retry together."""
    return min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * 2 ** (attempt - 1)) * random.uniform(0.8, 1.2)


def _name_from_url(url: str) -> str:
    parts = urlsplit(url)
    last = unquote(parts.path.rstrip("/").rsplit("/", 1)[-1])
    return clean_file_name(last or parts.hostname or "download")


def _name_from_disposition(value: str | None) -> str | None:
    if not value:
        return None
    # filename*=UTF-8''na%C3%AFve.txt is the one with the real characters, so it wins over filename=
    match = re.search(r"filename\*\s*=\s*([\w-]*)'[^']*'([^;]+)", value, re.IGNORECASE)
    if match:
        try:
            return unquote(match.group(2).strip().strip('"'), encoding=match.group(1) or "utf-8", errors="replace")
        except LookupError:
            pass
    match = re.search(r'filename\s*=\s*"((?:[^"\\]|\\.)*)"', value, re.IGNORECASE) or re.search(
        r"filename\s*=\s*([^;]+)", value, re.IGNORECASE
    )
    return match.group(1).strip() if match else None


def _content_range(value: str | None) -> tuple[int | None, int | None]:
    """The first byte and the whole size from `bytes 100-199/1000` (or `bytes */1000`)."""
    match = re.fullmatch(r"\s*bytes\s+(?:(\d+)-\d+|\*)/(\d+|\*)\s*", value or "")
    if not match:
        return None, None
    start, total = match.groups()
    return (int(start) if start else None), (int(total) if total and total != "*" else None)


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after")
    if not value:
        return None
    if value.strip().isdigit():
        seconds = float(value)
    else:
        try:
            seconds = (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()
        except (TypeError, ValueError):
            return None
    return max(0.0, min(seconds, RETRY_AFTER_MAX_SECONDS))


def _validator(response: httpx.Response) -> str | None:
    # A weak ETag (W/"…") is not allowed in If-Range
    etag = response.headers.get("etag")
    if etag and not etag.startswith("W/"):
        return etag
    return response.headers.get("last-modified")


def _describe(err: httpx.TransportError) -> str:
    if isinstance(err, httpx.ConnectTimeout):
        return "Could not connect in time"
    if isinstance(err, httpx.ReadTimeout):
        return "Nothing came in for a minute"
    if isinstance(err, httpx.ConnectError):
        return "Could not connect"
    if isinstance(err, (httpx.ReadError, httpx.RemoteProtocolError)):
        return "The connection was cut"
    return "The connection failed"


def _sync(f: BinaryIO) -> None:
    f.flush()
    os.fsync(f.fileno())


class Downloader:
    def __init__(
        self,
        root: Path,
        parallel: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
        retry_delay: Callable[[int], float] = _backoff,
    ) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.parallel = max(1, parallel)
        self._retry_delay = retry_delay
        # Guards download.json; the files are served from worker threads, so an asyncio lock would not do
        self._lock = threading.Lock()
        self._client = httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
            # The bytes as they are on the server, so the sizes and the ranges are of the file itself
            headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
            transport=transport,
        )
        self._tasks: dict[str, asyncio.Task[None]] = {}
        # Of the running downloads: the bytes that came in, some still to be written, and the recent ones for the speed
        self._received: dict[str, int] = {}
        self._samples: dict[str, deque[tuple[float, int]]] = {}
        self._closing = False

    # Files on disk

    def _dir(self, download_id: str) -> Path:
        return self.root / download_id

    def _data(self, download_id: str) -> Path:
        return self._dir(download_id) / "data"

    def _load(self, download_id: str) -> Download:
        try:
            data = json.loads((self._dir(download_id) / "download.json").read_text())
        except (FileNotFoundError, NotADirectoryError, json.JSONDecodeError) as err:
            raise DownloadNotFound from err
        return Download(**data)

    def _save(self, download: Download) -> None:
        target = self._dir(download.id) / "download.json"
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(asdict(download)))
        os.replace(tmp, target)

    def _update(self, download_id: str, **changes: object) -> Download:
        with self._lock:
            download = self._load(download_id)
            for key, value in changes.items():
                setattr(download, key, value)
            self._save(download)
        return download

    def _all(self) -> Iterator[Download]:
        for entry in self.root.iterdir():
            if entry.is_dir():
                try:
                    yield self._load(entry.name)
                except DownloadNotFound:
                    continue

    def _on_disk(self, download_id: str) -> int:
        try:
            return self._data(download_id).stat().st_size
        except FileNotFoundError:
            return 0

    def _truncate(self, download_id: str) -> None:
        with self._data(download_id).open("wb"):
            pass

    def check_space(self, size: int | None) -> None:
        if size is not None and size + FREE_SPACE_MARGIN_BYTES > shutil.disk_usage(self.root).free:
            raise _Fail("There is no room for the file on the disk")

    # What the page shows

    def downloads(self) -> list[Download]:
        with self._lock:
            downloads = list(self._all())
        return sorted(downloads, key=lambda d: d.created_at, reverse=True)

    def received(self, download: Download) -> int:
        return self._received.get(download.id, self._on_disk(download.id))

    def speed(self, download_id: str) -> float:
        """Bytes per second over the last few seconds; 0 when nothing came in lately."""
        samples = self._samples.get(download_id)
        if not samples or time.monotonic() - samples[-1][0] > SPEED_WINDOW_SECONDS:
            return 0.0
        (first_at, first), (last_at, last) = samples[0], samples[-1]
        return (last - first) / (last_at - first_at) if last_at > first_at else 0.0

    def _sample(self, download_id: str, received: int) -> None:
        now = time.monotonic()
        samples = self._samples.setdefault(download_id, deque())
        samples.append((now, received))
        while len(samples) > 2 and now - samples[0][0] > SPEED_WINDOW_SECONDS:
            samples.popleft()

    # Managing them. These start tasks, so they run on the event loop

    async def start(self) -> None:
        """Puts the downloads the API stopped in the middle of back in the queue, and starts them."""
        with self._lock:
            for download in self._all():
                if download.state == "downloading":
                    download.state = "queued"
                    download.retry_at = None
                    self._save(download)
        self._schedule()

    async def aclose(self) -> None:
        # The stopped ones stay as downloading, so start() takes them up again
        self._closing = True
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self._client.aclose()

    async def add(self, url: str, name: str | None = None) -> Download:
        download = Download(
            id=uuid.uuid4().hex,
            url=url,
            name=clean_file_name(name) if name else _name_from_url(url),
            named=bool(name),
            created_at=datetime.now(UTC).isoformat(),
        )
        self._dir(download.id).mkdir(parents=True)
        self._data(download.id).touch()
        with self._lock:
            self._save(download)
        self._schedule()
        return download

    async def pause(self, download_id: str) -> Download:
        with self._lock:
            download = self._load(download_id)
            if download.state == "done":
                raise AlreadyFinished
            if download.state in ("queued", "downloading"):
                download.state = "paused"
                download.retry_at = None
                self._save(download)
        await self._stop(download_id)
        return download

    async def resume(self, download_id: str) -> Download:
        """Goes on with a paused download, or tries a failed one again from where it stopped."""
        with self._lock:
            download = self._load(download_id)
            if download.state == "done":
                raise AlreadyFinished
            if download.state in ("paused", "failed"):
                download.state = "queued"
                download.error = None
                download.attempts = 0
                download.retry_at = None
                self._save(download)
        self._schedule()
        return download

    async def delete(self, download_id: str) -> None:
        # Paused first, so the slot it frees does not start it again before it is gone
        with self._lock:
            download = self._load(download_id)
            download.state = "paused"
            self._save(download)
        await self._stop(download_id)
        with self._lock:
            shutil.rmtree(self._dir(download_id), ignore_errors=True)

    def file(self, download_id: str) -> tuple[Download, Path]:
        with self._lock:
            download = self._load(download_id)
        path = self._data(download_id)
        if download.state != "done" or not path.is_file():
            raise NotFinished
        return download, path

    async def _stop(self, download_id: str) -> None:
        task = self._tasks.get(download_id)
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    def _schedule(self) -> None:
        if self._closing:
            return
        free = self.parallel - len(self._tasks)
        if free <= 0:
            return
        with self._lock:
            queued = [d for d in self._all() if d.state == "queued" and d.id not in self._tasks]
        # The oldest first
        for download in sorted(queued, key=lambda d: d.created_at)[:free]:
            self._tasks[download.id] = asyncio.create_task(self._run(download.id))

    # Downloading

    async def _run(self, download_id: str) -> None:
        try:
            while True:
                download = self._update(download_id, state="downloading", retry_at=None)
                before = self._on_disk(download_id)
                try:
                    size = await self._attempt(download)
                except _Retry as err:
                    progressed = self._on_disk(download_id) > before
                    attempts = 1 if progressed else download.attempts + 1
                    if attempts >= MAX_ATTEMPTS:
                        self._update(
                            download_id,
                            state="failed",
                            error=f"{err} ({attempts} tries in a row)",
                            attempts=attempts,
                        )
                        return
                    delay = err.retry_after if err.retry_after is not None else self._retry_delay(attempts)
                    self._update(download_id, error=str(err), attempts=attempts, retry_at=time.time() + delay)
                    self._received.pop(download_id, None)
                    await asyncio.sleep(delay)
                    continue
                except _Fail as err:
                    self._update(download_id, state="failed", error=str(err), retry_at=None)
                    return
                self._update(
                    download_id,
                    state="done",
                    size=size,
                    error=None,
                    attempts=0,
                    retry_at=None,
                    finished_at=datetime.now(UTC).isoformat(),
                )
                return
        except DownloadNotFound:
            return
        except asyncio.CancelledError:
            raise
        except Exception as err:
            log.exception("Download %s failed", download_id)
            try:
                self._update(download_id, state="failed", error=f"Unexpected error: {err}", retry_at=None)
            except DownloadNotFound:
                pass
        finally:
            self._tasks.pop(download_id, None)
            self._received.pop(download_id, None)
            self._samples.pop(download_id, None)
            self._schedule()

    async def _attempt(self, download: Download) -> int:
        """One try at the rest of the file. Answers the whole file's size once it is on disk whole."""
        offset = self._on_disk(download.id)
        if download.size is not None and 0 < download.size == offset:
            return offset
        headers = {}
        if offset:
            headers["Range"] = f"bytes={offset}-"
            if download.validator:
                headers["If-Range"] = download.validator
        try:
            async with self._client.stream("GET", download.url, headers=headers) as response:
                return await self._receive(download, response, offset)
        except httpx.UnsupportedProtocol as err:
            raise _Fail("The link is not http or https") from err
        except httpx.TooManyRedirects as err:
            raise _Fail("The link redirects too many times") from err
        except httpx.InvalidURL as err:
            raise _Fail("The link is not valid") from err
        except httpx.TransportError as err:
            raise _Retry(_describe(err)) from err
        except OSError as err:
            if err.errno == errno.ENOSPC:
                raise _Fail("The disk is full") from err
            raise _Fail(f"Could not write the file: {err.strerror or err}") from err

    async def _receive(self, download: Download, response: httpx.Response, offset: int) -> int:
        status = response.status_code
        if status == 416 and offset:
            # Nothing is left after the offset: either the file was whole already or it shrank on the server
            _, total = _content_range(response.headers.get("content-range"))
            if total == offset or (total is None and download.size == offset):
                return offset
            await asyncio.to_thread(self._truncate, download.id)
            raise _Retry("The file on the server changed, starting over", retry_after=0)
        if status >= 500 or status in RETRY_STATUSES:
            raise _Retry(f"The server answered {status}", _retry_after(response))
        if status >= 400:
            raise _Fail(f"The server answered {status}")
        if status >= 300:
            raise _Fail(f"The server answered {status} without saying where the file is")

        if status == 206:
            start, size = _content_range(response.headers.get("content-range"))
            if start != offset:
                await asyncio.to_thread(self._truncate, download.id)
                raise _Retry("The server sent the wrong part of the file, starting over", retry_after=0)
            size = size or download.size
            mode = "ab"
        else:
            # The whole file from its start: a first try, a server that ignores Range, or a file that changed
            offset = 0
            length = response.headers.get("content-length")
            size = int(length) if length and length.isdigit() else None
            mode = "wb"
            changes: dict[str, object] = {"size": size, "validator": _validator(response)}
            offered = _name_from_disposition(response.headers.get("content-disposition"))
            if not download.named and offered:
                changes["name"] = clean_file_name(offered)
            self._update(download.id, **changes)
        if size is not None:
            self.check_space(size - offset)

        received = offset
        self._received[download.id] = received
        f = await asyncio.to_thread(self._data(download.id).open, mode)
        buffer = bytearray()
        saved_at = time.monotonic()
        try:
            async for chunk in response.aiter_raw():
                buffer += chunk
                received += len(chunk)
                self._received[download.id] = received
                self._sample(download.id, received)
                if len(buffer) >= WRITE_BYTES:
                    await asyncio.to_thread(f.write, bytes(buffer))
                    buffer.clear()
                if time.monotonic() - saved_at >= SAVE_SECONDS:
                    await asyncio.to_thread(f.write, bytes(buffer))
                    buffer.clear()
                    await asyncio.to_thread(_sync, f)
                    saved_at = time.monotonic()
        finally:
            # Whatever came in stays, so the next try asks for what is after it. Written here without a thread, since
            # a pause cancels the task and a cancelled task cannot wait for one
            f.write(bytes(buffer))
            _sync(f)
            f.close()

        if size is not None and received < size:
            raise _Retry("The connection ended before the whole file came")
        if size is not None and received > size:
            await asyncio.to_thread(self._truncate, download.id)
            raise _Retry("The server sent more than the file's size, starting over", retry_after=0)
        return received


def get_downloader(request: Request) -> Downloader:
    return request.app.state.downloader


DownloaderDep = Annotated[Downloader, Depends(get_downloader)]
