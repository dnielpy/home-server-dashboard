"""The external disk's files, for the dashboard's file manager: lists a folder, downloads a file (or a folder as a
zip), renames, moves, copies and compresses into a zip (both in the background), deletes and creates folders.

Runs in the agent, outside Docker, as the server's user, so it can change the files the apps leave on the disk. Every
path comes relative to the disk's mount point and is checked to stay inside it, symbolic links included. Docker's
data and lost+found are never shown, and the folders the apps write to cannot be renamed or deleted, only what is in
them.
"""

from __future__ import annotations

import os
import shutil
import stat
import threading
import time
import unicodedata
import uuid
import zipfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import quote

# Top-level folders that are not the user's files: Docker's whole data root and the file system's own
HIDDEN = frozenset({"lost+found", "docker", "containerd"})
# Top-level folders the apps write to: LocalTube's videos, Sender, the downloaders, LGallery and Astro
PROTECTED = frozenset({"videos", "sender", "downloads", "gallery", "openclaw"})
# LGallery's folder, which "Move to gallery" empties folders into
GALLERY = "gallery"
MAX_NAME_BYTES = 255
# Already compressed: deflating them again costs the server's CPU and saves nothing, so a zip stores them as they are
COMPRESSED = frozenset({
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".ts", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".avif",
    ".zip", ".rar", ".7z", ".gz", ".tgz", ".xz", ".bz2", ".zst", ".iso", ".apk", ".jar", ".docx", ".xlsx", ".pptx",
})
CHUNK_BYTES = 1024 * 1024


class FilesError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Download:
    """A file to stream to the dashboard: a file as it is, or a folder zipped on the fly (size None)."""

    path: Path
    name: str
    size: int | None
    content_type: str
    # The other files and folders of the same folder that go in the zip next to `path`
    others: tuple[Path, ...] = ()

    def headers(self) -> dict[str, str]:
        ascii_name = unicodedata.normalize("NFKD", self.name).encode("ascii", "ignore").decode().replace('"', "'")
        headers = {
            "Content-Type": self.content_type,
            "Content-Disposition": (
                f"attachment; filename=\"{ascii_name or 'download'}\"; filename*=UTF-8''{quote(self.name, safe='')}"
            ),
            "Cache-Control": "no-store",
        }
        if self.size is not None:
            headers["Content-Length"] = str(self.size)
        return headers

    def write(self, out: BinaryIO) -> None:
        if self.size is not None:
            with self.path.open("rb") as source:
                shutil.copyfileobj(source, out, CHUNK_BYTES)
            return
        # Stored, not compressed: the disk is mostly videos and photos, which do not get smaller
        with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED, allowZip64=True) as archive:
            for item in (self.path, *self.others):
                if item.is_symlink():
                    continue
                files = [item] if item.is_file() else walk_files(item)
                for file in files:
                    try:
                        archive.write(file, str(file.relative_to(item.parent)))
                    except OSError:
                        # A file it cannot read is left out rather than ending the download halfway
                        continue


def walk_files(folder: Path):
    """The files inside a folder, in order, leaving out links."""
    for parent, dirs, names in os.walk(folder):
        dirs.sort()
        for name in sorted(names):
            file = Path(parent, name)
            if not file.is_symlink() and file.is_file():
                yield file


class Disk:
    def __init__(self, root: str | Path | None) -> None:
        self.root = Path(root).resolve() if root else None

    def _root(self) -> Path:
        if self.root is None or not os.path.ismount(self.root):
            raise FilesError(503, "The external disk is not mounted")
        return self.root

    def resolve(self, relative: str) -> Path:
        """The path on the disk for one relative to it, refusing anything that leads outside or into a hidden folder."""
        root = self._root()
        parts = [part for part in relative.replace("\\", "/").split("/") if part not in ("", ".")]
        if any(part == ".." or "\0" in part for part in parts):
            raise FilesError(400, "Invalid path")
        if parts and parts[0] in HIDDEN:
            raise FilesError(404, "There is no such file or folder")
        path = root.joinpath(*parts)
        # The link itself may be deleted or renamed, but what it points to has to be inside the disk
        real = path.parent.resolve() / path.name if parts else root
        try:
            target = path.resolve()
        except OSError:
            target = real
        for candidate in (real, target):
            if candidate != root and root not in candidate.parents:
                raise FilesError(403, "That path is outside the disk")
        return path

    def _relative(self, path: Path) -> str:
        return path.relative_to(self._root()).as_posix() if path != self._root() else ""

    def _guard(self, path: Path, action: str) -> None:
        root = self._root()
        if path == root:
            raise FilesError(403, f"The disk itself cannot be {action}")
        if path.parent == root and path.name in PROTECTED:
            raise FilesError(403, f"{path.name} is used by an app on the server and cannot be {action}")

    def listing(self, relative: str) -> dict[str, Any]:
        path = self.resolve(relative)
        if not path.is_dir():
            raise FilesError(404, "There is no such folder")
        entries = []
        try:
            children = list(os.scandir(path))
        except PermissionError:
            raise FilesError(403, "The server's user cannot open this folder")
        at_root = path == self._root()
        for entry in children:
            if at_root and entry.name in HIDDEN:
                continue
            try:
                info = entry.stat(follow_symlinks=True)
            except OSError:
                info = entry.stat(follow_symlinks=False)
            is_dir = stat.S_ISDIR(info.st_mode)
            entries.append({
                "name": entry.name,
                "kind": "folder" if is_dir else "file",
                "size": None if is_dir else info.st_size,
                "modified": info.st_mtime,
                "link": entry.is_symlink(),
                "protected": at_root and entry.name in PROTECTED,
            })
        entries.sort(key=lambda item: (item["kind"] != "folder", item["name"].casefold()))
        usage = shutil.disk_usage(self._root())
        return {
            "path": self._relative(path),
            "entries": entries,
            "disk": {"total": usage.total, "free": usage.free},
        }

    def download(self, relative: str) -> Download:
        path = self.resolve(relative)
        if path.is_dir():
            if path == self._root():
                raise FilesError(403, "The whole disk cannot be downloaded at once")
            return Download(path, f"{path.name}.zip", None, "application/zip")
        if not path.is_file():
            raise FilesError(404, "There is no such file")
        try:
            size = path.stat().st_size
            path.open("rb").close()
        except PermissionError:
            raise FilesError(403, "The server's user cannot read this file")
        return Download(path, path.name, size, "application/octet-stream")

    def download_many(self, relatives: list[str]) -> Download:
        """Several files and folders of one folder in one zip, named after that folder."""
        unique = list(dict.fromkeys(relatives))
        if len(unique) == 1:
            return self.download(unique[0])
        if not unique:
            raise FilesError(400, "Nothing to download")
        root = self._root()
        paths = [self.resolve(relative) for relative in unique]
        if any(path == root for path in paths):
            raise FilesError(403, "The whole disk cannot be downloaded at once")
        if len({path.parent for path in paths}) > 1:
            raise FilesError(400, "What is downloaded together has to be in the same folder")
        missing = next((path for path in paths if not path.exists()), None)
        if missing is not None:
            raise FilesError(404, f"There is no {missing.name}")
        parent = paths[0].parent
        name = f"{parent.name if parent != root else 'External disk'}.zip"
        return Download(paths[0], name, None, "application/zip", tuple(paths[1:]))

    def rename(self, relative: str, name: str) -> dict[str, Any]:
        path = self.resolve(relative)
        self._guard(path, "renamed")
        if not path.exists() and not path.is_symlink():
            raise FilesError(404, "There is no such file or folder")
        target = path.with_name(valid_name(name))
        if target == path:
            return {"path": self._relative(path)}
        # Only a different capitalization of the same name may already exist, on a disk that ignores it
        if target.exists() and not (target.name.casefold() == path.name.casefold() and os.path.samefile(target, path)):
            raise FilesError(409, f"There is already something called {target.name} here")
        if target.parent == self._root() and target.name in HIDDEN | PROTECTED:
            raise FilesError(409, f"{target.name} is reserved for the server")
        try:
            path.rename(target)
        except PermissionError:
            raise FilesError(403, "The server's user cannot rename it")
        return {"path": self._relative(target)}

    def delete(self, relative: str) -> dict[str, Any]:
        path = self.resolve(relative)
        self._guard(path, "deleted")
        try:
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path)
            else:
                raise FilesError(404, "There is no such file or folder")
        except PermissionError:
            raise FilesError(403, "The server's user cannot delete it, or something in it")
        return {"path": self._relative(path)}

    def _destination(self, path: Path, relative_folder: str, action: str) -> Path:
        """Where `path` ends up inside the folder `relative_folder`, refusing a folder put inside itself."""
        if not path.exists() and not path.is_symlink():
            raise FilesError(404, "There is no such file or folder")
        folder = self.resolve(relative_folder)
        if not folder.is_dir():
            raise FilesError(404, "There is no such destination folder")
        source, inside = path.resolve(), folder.resolve()
        if path.is_dir() and not path.is_symlink() and (inside == source or source in inside.parents):
            raise FilesError(400, f"A folder cannot be {action} into itself")
        if folder == self._root() and path.name in HIDDEN | PROTECTED:
            raise FilesError(409, f"{path.name} is reserved for the server")
        return folder / path.name

    def move(self, relative: str, relative_folder: str) -> dict[str, Any]:
        """Moves a file or folder into another folder of the disk. Instant: the disk is one file system."""
        path = self.resolve(relative)
        self._guard(path, "moved")
        target = self._destination(path, relative_folder, "moved")
        if target.parent == path.parent:
            raise FilesError(409, "It is already in that folder")
        if target.exists() or target.is_symlink():
            raise FilesError(409, f"There is already something called {target.name} there")
        try:
            path.rename(target)
        except PermissionError:
            raise FilesError(403, "The server's user cannot move it, or cannot write in that folder")
        except OSError as err:
            raise FilesError(409, f"It could not be moved: {err.strerror or err}")
        return {"path": self._relative(target)}

    def to_gallery(self, relative: str) -> dict[str, Any]:
        """Moves a file into LGallery's top folder, or what a folder has, emptying the folder and then deleting it:
        the downloaders leave every file in a folder of its own. A name already taken there gets " (2)"."""
        path = self.resolve(relative)
        self._guard(path, "moved")
        if not path.exists() and not path.is_symlink():
            raise FilesError(404, "There is no such file or folder")
        gallery = self._root() / GALLERY
        if not gallery.is_dir():
            raise FilesError(404, f"There is no {GALLERY} folder on the disk")
        is_folder = path.is_dir() and not path.is_symlink()
        if not is_folder and path.parent == gallery:
            raise FilesError(409, "It is already in the gallery")
        try:
            items = sorted(path.iterdir()) if is_folder else [path]
            for item in items:
                item.rename(numbered_name(gallery / item.name))
            if is_folder:
                path.rmdir()
        except PermissionError:
            raise FilesError(403, "The server's user cannot move it, or cannot write in the gallery")
        except OSError as err:
            raise FilesError(409, f"It could not be moved: {err.strerror or err}")
        return {"path": GALLERY}

    def copy_plan(self, relative: str, relative_folder: str) -> tuple[Path, Path, int]:
        """Checks a copy before it starts: the source, the free name it gets in the folder, and its size in bytes."""
        path = self.resolve(relative)
        if path == self._root():
            raise FilesError(403, "The disk itself cannot be copied")
        target = free_name(self._destination(path, relative_folder, "copied"))
        size = tree_size(path)
        if size > shutil.disk_usage(self._root()).free:
            raise FilesError(409, "There is not enough free space on the disk for the copy")
        return path, target, size

    def zip_plan(self, relatives: list[str]) -> tuple[list[Path], Path, int]:
        """Checks a zip before it starts: what goes in it (all from one folder), the free name it gets in that folder,
        and the bytes to read. One item gives the zip its name, several the folder's."""
        unique = list(dict.fromkeys(relatives))
        if not unique:
            raise FilesError(400, "Nothing to compress")
        root = self._root()
        paths = [self.resolve(relative) for relative in unique]
        if any(path == root for path in paths):
            raise FilesError(403, "The whole disk cannot be compressed at once")
        if len({path.parent for path in paths}) > 1:
            raise FilesError(400, "What is compressed together has to be in the same folder")
        missing = next((path for path in paths if not path.exists()), None)
        if missing is not None:
            raise FilesError(404, f"There is no {missing.name}")
        parent = paths[0].parent
        if not os.access(parent, os.W_OK):
            raise FilesError(403, "The server's user cannot write in this folder")
        if len(paths) > 1:
            name = parent.name if parent != root else "External disk"
        else:
            name = paths[0].stem if paths[0].is_file() else paths[0].name
        target = numbered_name(parent / f"{name}.zip")
        size = sum(tree_size(path) for path in paths)
        if size > shutil.disk_usage(root).free:
            raise FilesError(409, "There is not enough free space on the disk for the zip")
        return paths, target, size

    def mkdir(self, relative: str, name: str) -> dict[str, Any]:
        parent = self.resolve(relative)
        if not parent.is_dir():
            raise FilesError(404, "There is no such folder")
        target = parent / valid_name(name)
        if target.parent == self._root() and target.name in HIDDEN | PROTECTED:
            raise FilesError(409, f"{target.name} is reserved for the server")
        try:
            target.mkdir()
        except FileExistsError:
            raise FilesError(409, f"There is already something called {target.name} here")
        except PermissionError:
            raise FilesError(403, "The server's user cannot create folders here")
        return {"path": self._relative(target)}


def free_name(target: Path) -> Path:
    """`target`, or "name (copy).ext", "name (copy 2).ext"… when something already has that name."""
    if not target.exists() and not target.is_symlink():
        return target
    is_file = target.is_file()
    stem, suffix = (target.stem, target.suffix) if is_file else (target.name, "")
    for number in range(1, 1000):
        label = "copy" if number == 1 else f"copy {number}"
        candidate = target.with_name(f"{stem} ({label}){suffix}")
        if not candidate.exists() and not candidate.is_symlink():
            return candidate
    raise FilesError(409, f"There are too many copies of {target.name} there")


def numbered_name(target: Path) -> Path:
    """`target`, or "name (2).ext", "name (3).ext"… when something already has that name."""
    if not target.exists() and not target.is_symlink():
        return target
    stem, suffix = (target.stem, target.suffix) if target.is_file() else (target.name, "")
    for number in range(2, 1000):
        candidate = target.with_name(f"{stem} ({number}){suffix}")
        if not candidate.exists() and not candidate.is_symlink():
            return candidate
    raise FilesError(409, f"There are too many called {target.name} there")


def tree_size(path: Path) -> int:
    """The bytes a copy of a file or folder writes; links count as nothing."""
    if path.is_symlink():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for folder, _, names in os.walk(path):
        for name in names:
            file = Path(folder, name)
            if not file.is_symlink():
                try:
                    total += file.stat().st_size
                except OSError:
                    continue
    return total


class Cancelled(Exception):
    pass


@dataclass
class Transfer:
    """A copy or a zip running in the background, which the dashboard follows by its id."""

    id: str
    # What is copied, or the first of what is compressed, and the copy or the zip it makes
    source: str
    target: str
    # Bytes to read, and read so far
    total: int
    done: int = 0
    kind: str = "copy"  # copy or zip
    # How many items go in a zip
    count: int = 1
    state: str = "running"  # running, done, failed or cancelled
    error: str | None = None
    started: float = 0.0
    finished: float | None = None
    cancel: threading.Event = field(default_factory=threading.Event)

    def out(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "source": self.source,
            "count": self.count,
            "target": self.target,
            "total": self.total,
            "done": self.done,
            "state": self.state,
            "error": self.error,
            "started": self.started,
            "finished": self.finished,
        }


class Transfers:
    """The copies and zips started from the dashboard. Finished ones are kept a while, so the page can show how they
    ended."""

    KEEP_SECONDS = 15 * 60

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.jobs: dict[str, Transfer] = {}

    def start(self, disk: Disk, relative: str, relative_folder: str) -> dict[str, Any]:
        source, target, size = disk.copy_plan(relative, relative_folder)
        job = Transfer(id="", source=disk._relative(source), target=disk._relative(target), total=size)
        return self._begin(job, target, lambda: copy_tree(source, target, job))

    def zip(self, disk: Disk, relatives: list[str]) -> dict[str, Any]:
        paths, target, size = disk.zip_plan(relatives)
        job = Transfer(
            id="",
            kind="zip",
            source=disk._relative(paths[0]),
            count=len(paths),
            target=disk._relative(target),
            total=size,
        )
        return self._begin(job, target, lambda: zip_into(paths, target, job))

    def _begin(self, job: Transfer, target: Path, work: Callable[[], None]) -> dict[str, Any]:
        """Adds a job, unless the same one is running, and starts `work` in the background."""
        with self.lock:
            if any(other.state == "running" and other.target == job.target for other in self.jobs.values()):
                raise FilesError(409, f"That {job.kind} is already running")
            job.id = uuid.uuid4().hex
            job.started = time.time()
            self.jobs[job.id] = job
        threading.Thread(target=self._run, args=(job, target, work), daemon=True).start()
        return job.out()

    def list(self) -> list[dict[str, Any]]:
        now = time.time()
        with self.lock:
            for job_id, job in list(self.jobs.items()):
                if job.finished and now - job.finished > self.KEEP_SECONDS:
                    del self.jobs[job_id]
            return [job.out() for job in sorted(self.jobs.values(), key=lambda j: j.started, reverse=True)]

    def cancel(self, job_id: str) -> dict[str, Any]:
        with self.lock:
            job = self.jobs.get(job_id)
        if job is None:
            raise FilesError(404, "There is no such copy or zip")
        if job.state != "running":
            raise FilesError(409, f"That {job.kind} already ended")
        job.cancel.set()
        return job.out()

    def _run(self, job: Transfer, target: Path, work: Callable[[], None]) -> None:
        """Runs a copy or zip, deleting what it leaves behind when it is cancelled or fails."""
        try:
            work()
            job.state = "done"
        except Cancelled:
            job.state = "cancelled"
            remove(target)
        except OSError as err:
            job.state = "failed"
            job.error = f"{err.strerror or err}" + (f": {Path(err.filename).name}" if err.filename else "")
            remove(target)
        finally:
            job.finished = time.time()


def copy_tree(source: Path, target: Path, job: Transfer) -> None:
    """Copies a file or folder, links as links, counting the bytes in `job` and stopping when it is cancelled."""
    if source.is_symlink():
        target.symlink_to(os.readlink(source))
        return
    if source.is_file():
        copy_file(source, target, job)
        return
    target.mkdir()
    for entry in sorted(os.scandir(source), key=lambda e: e.name):
        copy_tree(Path(entry.path), target / entry.name, job)
    shutil.copystat(source, target)


def copy_file(source: Path, target: Path, job: Transfer) -> None:
    with source.open("rb") as reader, target.open("xb") as writer:
        while chunk := reader.read(CHUNK_BYTES):
            if job.cancel.is_set():
                raise Cancelled
            writer.write(chunk)
            job.done += len(chunk)
    shutil.copystat(source, target)


def zip_into(paths: list[Path], target: Path, job: Transfer) -> None:
    """Compresses files and folders of one folder into a new zip, leaving out links, counting the bytes read in `job`
    and stopping when it is cancelled."""
    # Not strict about timestamps: a file dated before 1980 goes in dated 1980 instead of failing the zip
    with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED, allowZip64=True, strict_timestamps=False) as archive:
        for item in paths:
            if item.is_symlink():
                continue
            if item.is_file():
                zip_file(archive, item, item.name, job)
                continue
            for parent, dirs, names in os.walk(item):
                dirs.sort()
                folder = Path(parent)
                # Its own entry, so empty folders are kept
                archive.write(folder, folder.relative_to(item.parent).as_posix())
                for name in sorted(names):
                    file = folder / name
                    if not file.is_symlink() and file.is_file():
                        zip_file(archive, file, file.relative_to(item.parent).as_posix(), job)


def zip_file(archive: zipfile.ZipFile, file: Path, name: str, job: Transfer) -> None:
    info = zipfile.ZipInfo.from_file(file, name, strict_timestamps=False)
    info.compress_type = zipfile.ZIP_STORED if file.suffix.lower() in COMPRESSED else zipfile.ZIP_DEFLATED
    with file.open("rb") as reader, archive.open(info, "w", force_zip64=True) as writer:
        while chunk := reader.read(CHUNK_BYTES):
            if job.cancel.is_set():
                raise Cancelled
            writer.write(chunk)
            job.done += len(chunk)


def remove(path: Path) -> None:
    """Deletes what a copy or zip that did not end left behind."""
    try:
        if path.is_symlink() or path.is_file():
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)
    except OSError:
        pass


def valid_name(name: str) -> str:
    name = name.strip()
    if not name or name in (".", "..") or "/" in name or "\0" in name:
        raise FilesError(400, "Invalid name")
    if len(name.encode()) > MAX_NAME_BYTES:
        raise FilesError(400, "The name is too long")
    return name
