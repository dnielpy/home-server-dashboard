"""Astro's Pet: the animations the /pet page plays and the messages it shows on a sign between them.

Kept in SQLite. Astro adds animations on its own (see pet_generator.py) and they are edited from the dashboard, so
each one is a row with its title and the JavaScript that moves the robot (the contract is in pet_guide.md).
"""

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, Request

Source = Literal["seed", "ai", "manual"]
MessageSource = Literal["ai", "manual"]
GenerationStatus = Literal["sent", "saved", "failed"]

# An animation that throws this many times on the page in a row is turned off, so a broken one stops showing
MAX_FAILURES = 3
SEED_DIR = Path(__file__).parent / "pet_seed"

SCHEMA = """
CREATE TABLE IF NOT EXISTS animations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL UNIQUE COLLATE NOCASE,
    code TEXT NOT NULL,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT
);
"""


class NotFound(Exception):
    pass


class DuplicateTitle(Exception):
    pass


@dataclass
class Animation:
    id: int
    title: str
    code: str
    source: Source
    enabled: bool
    failures: int
    created_at: datetime
    updated_at: datetime


@dataclass
class Message:
    id: int
    text: str
    source: MessageSource
    enabled: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class Generation:
    id: int
    started_at: datetime
    status: GenerationStatus
    detail: str | None


def _now() -> str:
    return datetime.now(UTC).isoformat()


def read_seeds() -> list[tuple[str, str]]:
    """The animations the library starts with: each file's first line is `// title: <title>`."""
    seeds = []
    for path in sorted(SEED_DIR.glob("*.js")):
        first, _, code = path.read_text().partition("\n")
        seeds.append((first.removeprefix("// title:").strip(), code.strip() + "\n"))
    return seeds


class PetStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        # The requests run in worker threads and share the connection
        self._lock = threading.Lock()
        with self._tx() as db:
            db.executescript(SCHEMA)
            # Databases from before Astro could write messages
            if "source" not in [c["name"] for c in db.execute("PRAGMA table_info(messages)")]:
                db.execute("ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")
            if db.execute("SELECT COUNT(*) FROM animations").fetchone()[0] == 0:
                now = _now()
                db.executemany(
                    "INSERT INTO animations (title, code, source, created_at, updated_at) VALUES (?, ?, 'seed', ?, ?)",
                    [(title, code, now, now) for title, code in read_seeds()],
                )

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock, self._db:
            yield self._db

    def close(self) -> None:
        self._db.close()

    # Animations

    @staticmethod
    def _animation(row: sqlite3.Row) -> Animation:
        return Animation(
            id=row["id"],
            title=row["title"],
            code=row["code"],
            source=row["source"],
            enabled=bool(row["enabled"]),
            failures=row["failures"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def animations(self, enabled: bool | None = None) -> list[Animation]:
        query = "SELECT * FROM animations"
        if enabled is not None:
            query += f" WHERE enabled = {int(enabled)}"
        with self._tx() as db:
            return [self._animation(r) for r in db.execute(query + " ORDER BY created_at DESC, id DESC")]

    def message_texts(self, limit: int = 30) -> list[str]:
        with self._tx() as db:
            return [r[0] for r in db.execute("SELECT text FROM messages ORDER BY id DESC LIMIT ?", (limit,))]

    def titles(self) -> list[str]:
        with self._tx() as db:
            return [r[0] for r in db.execute("SELECT title FROM animations ORDER BY id")]

    def animation(self, animation_id: int) -> Animation:
        with self._tx() as db:
            row = db.execute("SELECT * FROM animations WHERE id = ?", (animation_id,)).fetchone()
        if row is None:
            raise NotFound
        return self._animation(row)

    def add_animation(self, title: str, code: str, source: Source) -> Animation:
        now = _now()
        try:
            with self._tx() as db:
                cursor = db.execute(
                    "INSERT INTO animations (title, code, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (title, code, source, now, now),
                )
                if source == "ai":
                    # The latest request to Astro got its answer
                    db.execute(
                        "UPDATE generations SET status = 'saved', detail = ? WHERE id = "
                        "(SELECT MAX(id) FROM generations) AND status = 'sent'",
                        (title,),
                    )
        except sqlite3.IntegrityError as error:
            raise DuplicateTitle from error
        return self.animation(cursor.lastrowid)

    def update_animation(
        self, animation_id: int, title: str | None, code: str | None, enabled: bool | None
    ) -> Animation:
        fields: dict[str, object] = {}
        if title is not None:
            fields["title"] = title
        if code is not None:
            # New code gets a clean slate
            fields["code"] = code
            fields["failures"] = 0
        if enabled is not None:
            fields["enabled"] = int(enabled)
            if enabled:
                fields["failures"] = 0
        fields["updated_at"] = _now()
        sets = ", ".join(f"{name} = ?" for name in fields)
        try:
            with self._tx() as db:
                cursor = db.execute(f"UPDATE animations SET {sets} WHERE id = ?", (*fields.values(), animation_id))
        except sqlite3.IntegrityError as error:
            raise DuplicateTitle from error
        if cursor.rowcount == 0:
            raise NotFound
        return self.animation(animation_id)

    def delete_animation(self, animation_id: int) -> None:
        with self._tx() as db:
            if db.execute("DELETE FROM animations WHERE id = ?", (animation_id,)).rowcount == 0:
                raise NotFound

    def record_failure(self, animation_id: int) -> Animation:
        with self._tx() as db:
            cursor = db.execute(
                "UPDATE animations SET failures = failures + 1, "
                "enabled = CASE WHEN failures + 1 >= ? THEN 0 ELSE enabled END WHERE id = ?",
                (MAX_FAILURES, animation_id),
            )
        if cursor.rowcount == 0:
            raise NotFound
        return self.animation(animation_id)

    # Messages

    @staticmethod
    def _message(row: sqlite3.Row) -> Message:
        return Message(
            id=row["id"],
            text=row["text"],
            source=row["source"],
            enabled=bool(row["enabled"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def messages(self, enabled: bool | None = None) -> list[Message]:
        query = "SELECT * FROM messages"
        if enabled is not None:
            query += f" WHERE enabled = {int(enabled)}"
        with self._tx() as db:
            return [self._message(r) for r in db.execute(query + " ORDER BY created_at DESC, id DESC")]

    def message(self, message_id: int) -> Message:
        with self._tx() as db:
            row = db.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
        if row is None:
            raise NotFound
        return self._message(row)

    def add_message(self, text: str, source: MessageSource = "manual") -> Message:
        now = _now()
        with self._tx() as db:
            cursor = db.execute(
                "INSERT INTO messages (text, source, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (text, source, now, now),
            )
        return self.message(cursor.lastrowid)

    def update_message(self, message_id: int, text: str | None, enabled: bool | None) -> Message:
        fields: dict[str, object] = {}
        if text is not None:
            fields["text"] = text
        if enabled is not None:
            fields["enabled"] = int(enabled)
        fields["updated_at"] = _now()
        sets = ", ".join(f"{name} = ?" for name in fields)
        with self._tx() as db:
            cursor = db.execute(f"UPDATE messages SET {sets} WHERE id = ?", (*fields.values(), message_id))
        if cursor.rowcount == 0:
            raise NotFound
        return self.message(message_id)

    def delete_message(self, message_id: int) -> None:
        with self._tx() as db:
            if db.execute("DELETE FROM messages WHERE id = ?", (message_id,)).rowcount == 0:
                raise NotFound

    # The requests to Astro for a new animation

    def add_generation(self, status: GenerationStatus, detail: str | None = None) -> None:
        with self._tx() as db:
            db.execute(
                "INSERT INTO generations (started_at, status, detail) VALUES (?, ?, ?)", (_now(), status, detail)
            )

    def generations(self, limit: int = 20) -> list[Generation]:
        with self._tx() as db:
            rows = db.execute("SELECT * FROM generations ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [
            Generation(
                id=r["id"], started_at=datetime.fromisoformat(r["started_at"]), status=r["status"], detail=r["detail"]
            )
            for r in rows
        ]


def get_pet(request: Request) -> PetStore:
    return request.app.state.pet


PetDep = Annotated[PetStore, Depends(get_pet)]
