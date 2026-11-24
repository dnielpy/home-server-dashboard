"""The packages of Sender: files someone uploaded from a device, kept on disk under a name and a PIN until another
device downloads every one of them.

No database: each package is a folder with its metadata in package.json and its files under files/, named by id so
the names people give them never become paths.
"""

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import shutil
import threading
import time
import unicodedata
import uuid
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request

# Five wrong PINs in a row lock the package this long, so four digits cannot be guessed
MAX_FAILED_ATTEMPTS = 5
LOCK_SECONDS = 5 * 60
# What a correct PIN opens: the package's files can be downloaded with the token for this long
TOKEN_SECONDS = 30 * 60
# A package nobody gave a name and a PIN to is an upload left halfway
DRAFT_MAX_AGE = timedelta(hours=24)
# Room left on the disk after an upload, so a big one cannot fill it
FREE_SPACE_MARGIN_BYTES = 100 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024
PBKDF2_ITERATIONS = 200_000
MAX_FILE_NAME = 200
# Parts of a path kept in a file's name; the outer folders go first
MAX_FOLDER_DEPTH = 8


class PackageNotFound(Exception):
    pass


class FileNotFound(Exception):
    pass


class PackageSealed(Exception):
    """The package already has its name and PIN, so it takes no more files."""


class PackageEmpty(Exception):
    pass


class WrongPin(Exception):
    def __init__(self, attempts_left: int) -> None:
        super().__init__("Wrong PIN")
        self.attempts_left = attempts_left


class PackageLocked(Exception):
    def __init__(self, seconds: int) -> None:
        super().__init__("Too many wrong PINs")
        self.seconds = seconds


class InvalidToken(Exception):
    pass


class NoSpace(Exception):
    pass


@dataclass
class StoredFile:
    id: str
    name: str
    size: int
    downloaded: bool = False


@dataclass
class Package:
    id: str
    created_at: str
    sealed: bool = False
    name: str | None = None
    pin_hash: str | None = None
    salt: str | None = None
    failed_attempts: int = 0
    locked_until: float = 0
    files: list[StoredFile] = field(default_factory=list)

    @property
    def created(self) -> datetime:
        return datetime.fromisoformat(self.created_at)

    @property
    def pending(self) -> list[StoredFile]:
        return [f for f in self.files if not f.downloaded]


def _clean_part(part: str) -> str:
    part = "".join(c for c in part if unicodedata.category(c)[0] != "C").strip()
    if len(part) > MAX_FILE_NAME:
        stem, dot, ext = part.rpartition(".")
        part = f"{stem[: MAX_FILE_NAME - len(ext) - 1]}.{ext}" if dot and len(ext) < 20 else part[:MAX_FILE_NAME]
    return part


def clean_file_name(name: str) -> str:
    """The name a file is listed with: its path inside the folder it was uploaded with, if any, as folder/file,
    without control characters, empty parts, . or .., or a drive."""
    parts = [_clean_part(part) for part in name.replace("\\", "/").split("/")]
    parts = [part for part in parts if part not in ("", ".", "..")]
    if parts and parts[0].endswith(":"):
        parts = parts[1:]
    return "/".join(parts[-MAX_FOLDER_DEPTH:]) or "file"


def download_name(name: str) -> str:
    """The name a file is offered with on download: browsers save it flat, so only its last part."""
    return name.rsplit("/", 1)[-1]


def _hash_pin(pin: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, PBKDF2_ITERATIONS).hex()


class SenderStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        # Guards package.json; the downloads finish in worker threads, so an asyncio lock would not do
        self._lock = threading.Lock()
        self._tokens: dict[str, tuple[str, float]] = {}

    # Files on disk

    def _dir(self, package_id: str) -> Path:
        return self.root / package_id

    def _file_path(self, package_id: str, file_id: str) -> Path:
        return self._dir(package_id) / "files" / file_id

    def _load(self, package_id: str) -> Package:
        try:
            data = json.loads((self._dir(package_id) / "package.json").read_text())
        except (FileNotFoundError, NotADirectoryError, json.JSONDecodeError) as err:
            raise PackageNotFound from err
        data["files"] = [StoredFile(**f) for f in data.get("files", [])]
        return Package(**data)

    def _save(self, package: Package) -> None:
        target = self._dir(package.id) / "package.json"
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(asdict(package)))
        os.replace(tmp, target)

    def _remove(self, package_id: str) -> None:
        shutil.rmtree(self._dir(package_id), ignore_errors=True)
        self._tokens = {t: v for t, v in self._tokens.items() if v[0] != package_id}

    def _all(self) -> Iterator[Package]:
        for entry in self.root.iterdir():
            if entry.is_dir():
                try:
                    yield self._load(entry.name)
                except PackageNotFound:
                    continue

    # Uploading

    def create(self) -> Package:
        package = Package(id=uuid.uuid4().hex, created_at=datetime.now(UTC).isoformat())
        (self._dir(package.id) / "files").mkdir(parents=True)
        with self._lock:
            self._save(package)
        return package

    def check_space(self, size: int | None) -> None:
        if size is not None and size + FREE_SPACE_MARGIN_BYTES > shutil.disk_usage(self.root).free:
            raise NoSpace

    def start_file(self, package_id: str) -> tuple[str, Path]:
        """Where to write a new file of a package that is still being uploaded."""
        with self._lock:
            if self._load(package_id).sealed:
                raise PackageSealed
        file_id = uuid.uuid4().hex
        return file_id, self._file_path(package_id, file_id)

    def add_file(self, package_id: str, file_id: str, name: str) -> StoredFile:
        """Adds a file once it is on disk whole."""
        path = self._file_path(package_id, file_id)
        stored = StoredFile(id=file_id, name=clean_file_name(name), size=path.stat().st_size)
        with self._lock:
            package = self._load(package_id)
            if package.sealed:
                path.unlink(missing_ok=True)
                raise PackageSealed
            package.files.append(stored)
            self._save(package)
        return stored

    def remove_file(self, package_id: str, file_id: str) -> None:
        """Takes a file out of a package that is still being uploaded."""
        with self._lock:
            package = self._load(package_id)
            if package.sealed:
                raise PackageSealed
            if not any(f.id == file_id for f in package.files):
                raise FileNotFound
            package.files = [f for f in package.files if f.id != file_id]
            self._save(package)
        self._file_path(package_id, file_id).unlink(missing_ok=True)

    def seal(self, package_id: str, name: str, pin: str) -> Package:
        with self._lock:
            package = self._load(package_id)
            if package.sealed:
                raise PackageSealed
            if not package.files:
                raise PackageEmpty
            salt = secrets.token_bytes(16)
            package.sealed = True
            package.name = name
            package.salt = salt.hex()
            package.pin_hash = _hash_pin(pin, salt)
            self._save(package)
        return package

    def discard_draft(self, package_id: str) -> None:
        with self._lock:
            if self._load(package_id).sealed:
                raise PackageSealed
            self._remove(package_id)

    def remove_old_drafts(self, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        removed = 0
        with self._lock:
            for package in list(self._all()):
                if not package.sealed and now - package.created > DRAFT_MAX_AGE:
                    self._remove(package.id)
                    removed += 1
        return removed

    # Opening and downloading

    def sealed_packages(self) -> list[Package]:
        with self._lock:
            packages = [p for p in self._all() if p.sealed]
        return sorted(packages, key=lambda p: p.created_at, reverse=True)

    def unlock(self, package_id: str, pin: str) -> tuple[Package, str]:
        """The package and a token to download its files with, when the PIN is right."""
        now = time.time()
        with self._lock:
            package = self._load(package_id)
            if not package.sealed:
                raise PackageNotFound
            if package.locked_until > now:
                raise PackageLocked(int(package.locked_until - now) + 1)
            assert package.salt is not None and package.pin_hash is not None
            if not hmac.compare_digest(_hash_pin(pin, bytes.fromhex(package.salt)), package.pin_hash):
                package.failed_attempts += 1
                attempts_left = MAX_FAILED_ATTEMPTS - package.failed_attempts
                if attempts_left <= 0:
                    package.failed_attempts = 0
                    package.locked_until = now + LOCK_SECONDS
                self._save(package)
                if attempts_left <= 0:
                    raise PackageLocked(LOCK_SECONDS)
                raise WrongPin(attempts_left)
            if package.failed_attempts:
                package.failed_attempts = 0
                self._save(package)
            self._tokens = {t: v for t, v in self._tokens.items() if v[1] > now}
            token = secrets.token_urlsafe(24)
            self._tokens[token] = (package_id, now + TOKEN_SECONDS)
        return package, token

    def check_token(self, package_id: str, token: str) -> None:
        entry = self._tokens.get(token)
        if entry is None or entry[0] != package_id or entry[1] <= time.time():
            raise InvalidToken

    def unlocked(self, package_id: str, token: str) -> Package:
        self.check_token(package_id, token)
        with self._lock:
            return self._load(package_id)

    def open_file(self, package_id: str, file_id: str, token: str) -> tuple[StoredFile, Path]:
        self.check_token(package_id, token)
        with self._lock:
            package = self._load(package_id)
        stored = next((f for f in package.pending if f.id == file_id), None)
        path = self._file_path(package_id, file_id)
        if stored is None or not path.is_file():
            raise FileNotFound
        return stored, path

    def read_file(self, package_id: str, file_id: str, path: Path) -> Iterator[bytes]:
        """The file in chunks. Only when the last chunk went out is it marked as downloaded and deleted; a download
        cut halfway stops the iteration before that, and the file stays."""
        with path.open("rb") as f:
            while chunk := f.read(CHUNK_BYTES):
                yield chunk
        self.mark_downloaded(package_id, file_id)

    def mark_downloaded(self, package_id: str, file_id: str) -> None:
        with self._lock:
            try:
                package = self._load(package_id)
            except PackageNotFound:
                return
            for stored in package.files:
                if stored.id == file_id:
                    stored.downloaded = True
            self._file_path(package_id, file_id).unlink(missing_ok=True)
            if package.pending:
                self._save(package)
            else:
                self._remove(package_id)

    def delete(self, package_id: str, token: str) -> None:
        self.check_token(package_id, token)
        with self._lock:
            self._load(package_id)
            self._remove(package_id)


async def remove_old_drafts(store: SenderStore, every_seconds: float = 3600) -> None:
    """Deletes the uploads left halfway, now and every hour."""
    while True:
        await asyncio.to_thread(store.remove_old_drafts)
        await asyncio.sleep(every_seconds)


def get_sender(request: Request) -> SenderStore:
    return request.app.state.sender


SenderDep = Annotated[SenderStore, Depends(get_sender)]
