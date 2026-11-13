"""The server's CPU, memory, disks and network, read from /proc and the filesystems the way top and df do.

A thread samples every second, so the CPU use and the network speed are the ones of the last second instead of since
boot, and the dashboard can show them changing live. Every 5 minutes it also stores the network speed in a SQLite file, for the traffic of the last week, and
the bytes the interface has carried, which keep adding up across reboots of the server. Only uses the standard
library, like the agent.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROC = Path(os.environ.get("PROC_ROOT", "/proc"))
SYSTEM_DISK_MOUNT = os.environ.get("SYSTEM_DISK_MOUNT", "/")
EXTERNAL_DISK_MOUNT = os.environ.get("EXTERNAL_DISK_MOUNT", "/mnt/external")

SAMPLE_SECONDS = 1
STORE_SECONDS = 5 * 60
HISTORY_SECONDS = 7 * 24 * 3600
BUCKET_SECONDS = 15 * 60
# A day more than the history shows, so its first bucket is whole
RETENTION_SECONDS = HISTORY_SECONDS + 24 * 3600

# Columns of the cpu line of /proc/stat that count as time spent: user nice system idle iowait irq softirq steal
CPU_FIELDS = 8
IDLE_FIELDS = (3, 4)
# A default route is up when this bit of its flags is set
RTF_UP = 0x1


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def _read(path: Path) -> str | None:
    try:
        return path.read_text()
    except OSError:
        return None


def read_cpu(proc: Path = PROC) -> tuple[int, int] | None:
    """The time the CPUs have been busy and the total, in ticks since boot; None away from Linux."""
    text = _read(proc / "stat")
    if text is None:
        return None
    for line in text.splitlines():
        if line.startswith("cpu "):
            ticks = [int(value) for value in line.split()[1 : CPU_FIELDS + 1]]
            total = sum(ticks)
            return total - sum(ticks[i] for i in IDLE_FIELDS if i < len(ticks)), total
    return None


def read_memory(proc: Path = PROC) -> dict[str, Any] | None:
    """In use is what is not available, as `free` counts it: the page cache can be given back, so it is not used."""
    text = _read(proc / "meminfo")
    if text is None:
        return None
    values = {}
    for line in text.splitlines():
        key, _, rest = line.partition(":")
        if rest.strip():
            values[key] = int(rest.split()[0]) * 1024
    total = values.get("MemTotal")
    available = values.get("MemAvailable")
    if not total or available is None:
        return None
    used = max(0, total - available)
    return {
        "total_bytes": total,
        "used_bytes": used,
        "available_bytes": available,
        "percent": round(used / total * 100, 1),
    }


def default_interface(proc: Path = PROC) -> str | None:
    """The interface the default route goes through, the one that carries the server's internet traffic."""
    text = _read(proc / "net/route")
    if text is None:
        return None
    for line in text.splitlines()[1:]:
        fields = line.split()
        if len(fields) > 3 and fields[1] == "00000000" and int(fields[3], 16) & RTF_UP:
            return fields[0]
    return None


def read_interface(name: str, proc: Path = PROC) -> tuple[int, int] | None:
    """The bytes received and sent by the interface since it came up."""
    text = _read(proc / "net/dev")
    if text is None:
        return None
    for line in text.splitlines()[2:]:
        interface, _, counters = line.partition(":")
        if interface.strip() == name:
            fields = counters.split()
            return int(fields[0]), int(fields[8])
    return None


def read_disk(name: str, mount: str) -> dict[str, Any] | None:
    """How full the filesystem mounted there is, as df shows it: the space reserved for root counts as not free."""
    try:
        stats = os.statvfs(mount)
    except OSError:
        return None
    total = stats.f_blocks * stats.f_frsize
    used = (stats.f_blocks - stats.f_bfree) * stats.f_frsize
    available = stats.f_bavail * stats.f_frsize
    if total == 0:
        return None
    return {
        "name": name,
        "mount": mount,
        "total_bytes": total,
        "used_bytes": used,
        "available_bytes": available,
        "percent": round(used / (used + available) * 100, 1) if used + available else 0.0,
    }


def read_disks(system_mount: str = SYSTEM_DISK_MOUNT, external_mount: str = EXTERNAL_DISK_MOUNT) -> list[dict]:
    disks = [read_disk("system", system_mount)]
    # Without the disk plugged in its folder is still there, on the system disk, so only a mount point counts
    if external_mount and os.path.ismount(external_mount):
        disks.append(read_disk("external", external_mount))
    return [disk for disk in disks if disk is not None]


@dataclass
class Reading:
    at: float
    cpu: tuple[int, int] | None
    interface: str | None
    network: tuple[int, int] | None


def _delta(current: int, last: int) -> int:
    # A counter lower than before was reset by a reboot, and counts again from 0
    return current - last if current >= last else current


class Monitor:
    """Samples the server on its own thread and answers the dashboard from the last samples."""

    def __init__(self, database: Path, proc: Path = PROC, disks=read_disks) -> None:
        self.proc = proc
        self.disks = disks
        self.lock = threading.Lock()
        self.db = sqlite3.connect(database, check_same_thread=False)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS traffic (at REAL PRIMARY KEY, rx REAL NOT NULL, tx REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS totals (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                interface TEXT, last_rx INTEGER, last_tx INTEGER, total_rx INTEGER, total_tx INTEGER
            );
            """
        )
        row = self.db.execute("SELECT interface, last_rx, last_tx, total_rx, total_tx FROM totals").fetchone()
        # The counters as of the last time they were stored, so what the interface carried while the agent was
        # stopped still adds up
        self.counted_interface: str | None = row[0] if row else None
        self.counted: tuple[int, int] | None = (row[1], row[2]) if row else None
        self.totals = [row[3], row[4]] if row else [0, 0]
        self.last: Reading | None = None
        self.cpu_percent: float | None = None
        self.rates: tuple[float, float] | None = None
        # The reading the network speed stored every 5 minutes is measured from
        self.stored: Reading | None = None

    def sample(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        interface = default_interface(self.proc)
        reading = Reading(
            at=now,
            cpu=read_cpu(self.proc),
            interface=interface,
            network=read_interface(interface, self.proc) if interface else None,
        )
        with self.lock:
            last = self.last
            if last and last.cpu and reading.cpu and reading.cpu[1] > last.cpu[1]:
                busy, total = (reading.cpu[i] - last.cpu[i] for i in (0, 1))
                self.cpu_percent = round(max(0.0, min(100.0, busy / total * 100)), 1)
            self.rates = self._rates(last, reading)
            self._count(reading)
            self.last = reading
            if self.stored is None:
                self.stored = reading
            elif now - self.stored.at >= STORE_SECONDS:
                self._store(reading)

    @staticmethod
    def _rates(start: Reading | None, end: Reading) -> tuple[float, float] | None:
        if not (start and start.network and end.network and start.interface == end.interface and end.at > start.at):
            return None
        seconds = end.at - start.at
        return (
            round(_delta(end.network[0], start.network[0]) / seconds, 1),
            round(_delta(end.network[1], start.network[1]) / seconds, 1),
        )

    def _count(self, reading: Reading) -> None:
        if reading.network is None:
            return
        if self.counted is not None and self.counted_interface == reading.interface:
            self.totals[0] += _delta(reading.network[0], self.counted[0])
            self.totals[1] += _delta(reading.network[1], self.counted[1])
        self.counted_interface = reading.interface
        self.counted = reading.network

    def _store(self, reading: Reading) -> None:
        rates = self._rates(self.stored, reading)
        self.stored = reading
        with self.db:
            if rates is not None:
                self.db.execute("INSERT OR REPLACE INTO traffic VALUES (?, ?, ?)", (reading.at, *rates))
            if self.counted is not None:
                self.db.execute(
                    "INSERT OR REPLACE INTO totals VALUES (1, ?, ?, ?, ?, ?)",
                    (self.counted_interface, *self.counted, *self.totals),
                )
            self.db.execute("DELETE FROM traffic WHERE at < ?", (reading.at - RETENTION_SECONDS,))

    def current(self) -> dict[str, Any]:
        with self.lock:
            last = self.last
            rates = self.rates
            return {
                "updated_at": _iso(last.at if last else time.time()),
                "cpu_percent": self.cpu_percent,
                "memory": read_memory(self.proc),
                "disks": self.disks(),
                "network": {
                    "interface": last.interface if last else None,
                    "rx_bytes_per_second": rates[0] if rates else None,
                    "tx_bytes_per_second": rates[1] if rates else None,
                    "total_rx_bytes": self.totals[0],
                    "total_tx_bytes": self.totals[1],
                },
            }

    def traffic(self, now: float | None = None) -> dict[str, Any]:
        """The network speed over the last week, averaged every 15 minutes."""
        now = time.time() if now is None else now
        with self.lock:
            rows = self.db.execute(
                "SELECT CAST(at / ? AS INTEGER) * ? AS bucket, avg(rx), avg(tx) FROM traffic"
                " WHERE at >= ? GROUP BY bucket ORDER BY bucket",
                (BUCKET_SECONDS, BUCKET_SECONDS, now - HISTORY_SECONDS),
            ).fetchall()
        return {
            "interval_minutes": BUCKET_SECONDS // 60,
            "points": [
                {"at": _iso(bucket), "rx_bytes_per_second": round(rx, 1), "tx_bytes_per_second": round(tx, 1)}
                for bucket, rx, tx in rows
            ],
        }

    def run(self) -> None:
        while True:
            time.sleep(SAMPLE_SECONDS)
            try:
                self.sample()
            except Exception as err:  # noqa: BLE001 - a bad reading must not stop the sampling
                print(f"metrics: could not sample the server: {err!r}", flush=True)

    def start(self) -> None:
        self.sample()
        threading.Thread(target=self.run, daemon=True).start()
