"""The external disk's files, for the dashboard's file manager: lists a folder, downloads a file (or a folder as a
zip), renames, deletes and creates folders.

Runs in the agent, outside Docker, as the server's user, so it can change the files the apps leave on the disk. Every
path comes relative to the disk's mount point and is checked to stay inside it, symbolic links included. Docker's
data and lost+found are never shown, and the folders the apps write to cannot be renamed or deleted, only what is in
them.
"""

from __future__ import annotations

import os
import shutil
import stat
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import quote

# Top-level folders that are not the user's files: Docker's whole data root and the file system's own
HIDDEN = frozenset({"lost+found", "docker", "containerd"})
# Top-level folders the apps write to: LocalTube's videos, Sender, the downloaders, LGallery and Astro
PROTECTED = frozenset({"videos", "sender", "downloads", "gallery", "openclaw"})
MAX_NAME_BYTES = 255
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
            for folder, dirs, names in os.walk(self.path):
                dirs.sort()
                for name in sorted(names):
                    file = Path(folder, name)
                    if file.is_symlink() or not file.is_file():
                        continue
                    try:
                        archive.write(file, str(file.relative_to(self.path.parent)))
                    except OSError:
                        # A file it cannot read is left out rather than ending the download halfway
                        continue


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


def valid_name(name: str) -> str:
    name = name.strip()
    if not name or name in (".", "..") or "/" in name or "\0" in name:
        raise FilesError(400, "Invalid name")
    if len(name.encode()) > MAX_NAME_BYTES:
        raise FilesError(400, "The name is too long")
    return name
