import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import metrics  # noqa: E402

ROUTE = """Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT
eth0\t0001A8C0\t00000000\t0001\t0\t0\t0\t00FFFFFF\t0\t0\t0
eth0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0
"""
MEMINFO = """MemTotal:        8000000 kB
MemFree:          500000 kB
MemAvailable:    6000000 kB
Buffers:          100000 kB
"""
DISK = {"name": "system", "mount": "/", "total_bytes": 100, "used_bytes": 40, "available_bytes": 60, "percent": 40.0}


class FakeProc:
    """A /proc with the files the monitor reads, set to the values each test needs."""

    def __init__(self, root: Path) -> None:
        self.root = root
        (root / "net").mkdir()
        (root / "net/route").write_text(ROUTE)
        (root / "meminfo").write_text(MEMINFO)
        self.set(cpu=(100, 100, 50, 700, 50), rx=1_000, tx=500)

    def set(self, cpu: tuple[int, ...], rx: int, tx: int, interface: str = "eth0") -> None:
        (self.root / "stat").write_text(f"cpu  {' '.join(map(str, cpu))} 0 0 0 0 0\ncpu0 1 2 3 4\n")
        (self.root / "net/dev").write_text(
            "Inter-|   Receive                                                |  Transmit\n"
            " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets\n"
            "    lo: 999 1 0 0 0 0 0 0 999 1 0 0 0 0 0 0\n"
            f"  {interface}: {rx} 10 0 0 0 0 0 0 {tx} 5 0 0 0 0 0 0\n"
        )


@pytest.fixture
def proc(tmp_path: Path) -> FakeProc:
    root = tmp_path / "proc"
    root.mkdir()
    return FakeProc(root)


def monitor(tmp_path: Path, proc: FakeProc) -> metrics.Monitor:
    return metrics.Monitor(tmp_path / "metrics.sqlite3", proc=proc.root, disks=lambda: [DISK])


def test_reads_the_default_interface_and_memory(proc) -> None:
    assert metrics.default_interface(proc.root) == "eth0"
    assert metrics.read_interface("eth0", proc.root) == (1_000, 500)
    memory = metrics.read_memory(proc.root)
    assert (memory["total_bytes"], memory["used_bytes"], memory["percent"]) == (8_192_000_000, 2_048_000_000, 25.0)


def test_without_proc_there_is_nothing_to_read(tmp_path) -> None:
    missing = tmp_path / "missing"
    assert (metrics.read_cpu(missing), metrics.read_memory(missing), metrics.default_interface(missing)) == (
        None,
        None,
        None,
    )


def test_cpu_and_speed_are_those_between_two_samples(tmp_path, proc) -> None:
    watcher = monitor(tmp_path, proc)
    watcher.sample(now=1_000)
    first = watcher.current()
    assert (first["cpu_percent"], first["network"]["rx_bytes_per_second"]) == (None, None)

    # 100 more busy ticks out of 400, and 10 kB received and 5 kB sent in 5 seconds
    proc.set(cpu=(150, 100, 100, 950, 100), rx=11_000, tx=5_500)
    watcher.sample(now=1_005)

    current = watcher.current()
    assert current["cpu_percent"] == 25.0
    assert current["network"] == {
        "interface": "eth0",
        "rx_bytes_per_second": 2_000.0,
        "tx_bytes_per_second": 1_000.0,
        "total_rx_bytes": 10_000,
        "total_tx_bytes": 5_000,
    }
    assert current["memory"]["percent"] == 25.0
    assert current["disks"] == [DISK]


def test_totals_keep_adding_up_across_a_reboot_and_a_restart(tmp_path, proc) -> None:
    watcher = monitor(tmp_path, proc)
    watcher.sample(now=0)
    proc.set(cpu=(1, 1, 1, 1, 1), rx=5_000, tx=1_500)
    watcher.sample(now=metrics.STORE_SECONDS)
    # The server rebooted: the counters start again from 0
    proc.set(cpu=(1, 1, 1, 1, 1), rx=2_000, tx=100)
    watcher.sample(now=2 * metrics.STORE_SECONDS)
    assert watcher.current()["network"]["total_rx_bytes"] == 4_000 + 2_000

    # The agent restarts and picks up from what it stored
    restarted = monitor(tmp_path, proc)
    proc.set(cpu=(1, 1, 1, 1, 1), rx=3_000, tx=200)
    restarted.sample(now=3 * metrics.STORE_SECONDS)
    network = restarted.current()["network"]
    assert (network["total_rx_bytes"], network["total_tx_bytes"]) == (7_000, 1_200)


def test_traffic_is_averaged_every_15_minutes(tmp_path, proc) -> None:
    watcher = monitor(tmp_path, proc)
    start = 1_800_000_000 - 1_800_000_000 % metrics.BUCKET_SECONDS
    received = 1_000
    watcher.sample(now=start)
    # Every 5 minutes, 300 kB then 600 kB then 900 kB: 1, 2 and 3 kB/s
    for step, kilobytes in enumerate((300, 600, 900, 300), start=1):
        received += kilobytes * 1_000
        proc.set(cpu=(1, 1, 1, 1, 1), rx=received, tx=500)
        watcher.sample(now=start + step * metrics.STORE_SECONDS)

    traffic = watcher.traffic(now=start + 4 * metrics.STORE_SECONDS)

    assert traffic["interval_minutes"] == 15
    # The first bucket holds the samples at 5 and 10 minutes, the second those at 15 and 20
    assert [point["rx_bytes_per_second"] for point in traffic["points"]] == [1_500.0, 2_000.0]
    assert traffic["points"][1]["tx_bytes_per_second"] == 0.0


def test_traffic_leaves_out_the_samples_older_than_a_week(tmp_path, proc) -> None:
    watcher = monitor(tmp_path, proc)
    watcher.sample(now=0)
    proc.set(cpu=(1, 1, 1, 1, 1), rx=301_000, tx=500)
    watcher.sample(now=metrics.STORE_SECONDS)

    assert watcher.traffic(now=metrics.STORE_SECONDS + metrics.HISTORY_SECONDS + 1)["points"] == []


def test_a_missing_external_disk_is_left_out(tmp_path) -> None:
    not_mounted = tmp_path / "external"
    not_mounted.mkdir()

    disks = metrics.read_disks(system_mount=str(tmp_path), external_mount=str(not_mounted))

    assert [disk["name"] for disk in disks] == ["system"]
    assert disks[0]["total_bytes"] > 0


def test_localtube_media_path_is_read_without_its_quotes(tmp_path) -> None:
    (tmp_path / "local-tube").mkdir()
    (tmp_path / "local-tube" / ".env.production").write_text('# The videos\nMEDIA_PATH="/mnt/disco/localtube"\n')

    assert metrics.env_value(tmp_path / "local-tube" / ".env.production", "MEDIA_PATH") == "/mnt/disco/localtube"


def test_media_on_the_system_disk_is_not_an_external_disk(tmp_path) -> None:
    media = tmp_path / "videos"
    media.mkdir()
    (tmp_path / "local-tube").mkdir()
    (tmp_path / "local-tube" / ".env.production").write_text(f"MEDIA_PATH={media}\n")

    assert metrics.media_disk_mount(str(tmp_path), system_mount=str(tmp_path)) is None


def test_without_localtube_there_is_no_external_disk(tmp_path) -> None:
    assert metrics.media_disk_mount(str(tmp_path)) is None


def test_the_mount_point_is_the_nearest_mounted_folder(tmp_path) -> None:
    assert metrics.mount_point("/") == "/"
    assert os.path.ismount(metrics.mount_point(str(tmp_path)))
