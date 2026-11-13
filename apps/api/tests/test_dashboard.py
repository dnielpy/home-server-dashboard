from datetime import datetime, timezone

import httpx

from app.main import app
from app.status import StatusTracker, get_status_tracker

PERIODS = [
    {"start": "2026-11-12T12:00:00Z", "end": "2026-11-13T02:00:00Z", "receiving_ac": True},
    {"start": "2026-11-13T02:00:00Z", "end": "2026-11-13T06:00:00Z", "receiving_ac": False},
    {"start": "2026-11-13T06:00:00Z", "end": "2026-11-13T12:00:00Z", "receiving_ac": True},
]
TOTALS = {
    "since": "2026-11-12T12:00:00Z",
    "with_power_hours": 20.0,
    "without_power_hours": 4.0,
    "receiving_ac": True,
    "last_outage_start": "2026-11-13T02:00:00Z",
    "outage_ongoing": False,
}


def test_power_reads_the_last_24_hours(client, upstreams) -> None:
    calls = upstreams(bluetti={"/power-totals": TOTALS, "/power-periods": PERIODS})

    body = client.get("/dashboard/power").json()

    assert (body["with_power_hours"], body["without_power_hours"], body["outage_ongoing"]) == (20, 4, False)
    assert [period["receiving_ac"] for period in body["periods"]] == [True, False, True]
    assert {call.url.params["hours"] for call in calls} == {"24"}


def test_network_speed(client, upstreams) -> None:
    upstreams(
        homenet={
            "/connection/throughput/current": {
                "measured_at": "2026-11-13T12:00:00Z",
                "rx_bytes_per_second": 125_000,
                "tx_bytes_per_second": 2_000,
            }
        }
    )

    body = client.get("/dashboard/network/speed").json()

    assert (body["rx_bytes_per_second"], body["tx_bytes_per_second"]) == (125_000, 2_000)


def test_network_usage_takes_the_heaviest_device(client, upstreams) -> None:
    upstreams(
        homenet={
            "/bandwidth": {"total_rx_bytes": 5_000_000, "total_tx_bytes": 300_000, "items": []},
            "/device-usage": [
                {"mac": "aa", "name": "TV", "down_bytes": 4_000_000, "up_bytes": 100_000},
                {"mac": "bb", "name": "Phone", "down_bytes": 900_000, "up_bytes": 50_000},
            ],
        }
    )

    body = client.get("/dashboard/network/usage").json()

    assert (body["total_rx_bytes"], body["total_tx_bytes"]) == (5_000_000, 300_000)
    assert body["top_device"]["name"] == "TV"


def test_network_usage_without_devices(client, upstreams) -> None:
    upstreams(homenet={"/bandwidth": {"total_rx_bytes": 0, "total_tx_bytes": 0, "items": []}, "/device-usage": []})

    assert client.get("/dashboard/network/usage").json()["top_device"] is None


def test_localtube(client, upstreams) -> None:
    calls = upstreams(
        localtube={
            "/api/stats/downloads/active": {
                "count": 1,
                "items": [
                    {
                        "id": "8a3c1a8e-5f55-4a3e-9f0e-2f1d2c3b4a59",
                        "title": "A video",
                        "status": "downloading",
                        "progress": 42.0,
                        "speed": "1.2MiB/s",
                        "eta": "00:30",
                    }
                ],
            },
            "/api/stats/watch-time": [
                {
                    "profile_id": "1b0c3d2e-6a77-4b8c-8d9e-0f1a2b3c4d5e",
                    "name": "Daniel",
                    "avatar_url": None,
                    "seconds": 7200.0,
                },
            ],
        }
    )

    body = client.get("/dashboard/localtube").json()

    assert body["downloading"]["count"] == 1
    assert body["downloading"]["items"][0]["progress"] == 42
    assert body["watch_time"][0] == {
        "profile_id": "1b0c3d2e-6a77-4b8c-8d9e-0f1a2b3c4d5e",
        "name": "Daniel",
        "seconds": 7200,
    }
    assert "hours" not in calls[-1].url.params


def test_unreachable_app_is_502_with_its_source(client, upstreams) -> None:
    upstreams(bluetti={"/battery-estimate": httpx.ConnectError("refused")})

    response = client.get("/dashboard/battery")

    assert response.status_code == 502
    assert response.json()["source"] == "bluetti"


def test_app_error_is_502_with_its_detail(client, upstreams) -> None:
    upstreams(homenet={"/connection/throughput/current": (503, {"detail": "The Nano did not answer in time"})})

    response = client.get("/dashboard/network/speed")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "homenet answered 503: The Nano did not answer in time",
        "source": "homenet",
    }


def test_redirect_or_html_is_502(client, upstreams) -> None:
    upstreams(bluetti={"/power-totals": (303, None), "/power-periods": []})

    response = client.get("/dashboard/power")

    assert response.status_code == 502
    assert response.json()["source"] == "bluetti"


def test_battery_history_in_10_minute_steps(client, upstreams) -> None:
    calls = upstreams(
        bluetti={
            "/battery-status": [
                {"date": "2026-11-13T10:01:00Z", "battery_percent": 80},
                {"date": "2026-11-13T10:09:00Z", "battery_percent": 78},
                {"date": "2026-11-13T10:12:00Z", "battery_percent": 77},
            ],
            "/ac-output-history": [
                {"date": "2026-11-13T10:01:00Z", "ac_output": 100},
                {"date": "2026-11-13T10:09:00Z", "ac_output": 150},
                {"date": "2026-11-13T10:25:00Z", "ac_output": 90},
            ],
        }
    )

    body = client.get("/dashboard/battery/history").json()

    assert body["points"] == [
        {"at": "2026-11-13T10:00:00Z", "soc": 78, "load_w": 125.0},
        {"at": "2026-11-13T10:10:00Z", "soc": 77, "load_w": None},
        {"at": "2026-11-13T10:20:00Z", "soc": None, "load_w": 90.0},
    ]
    assert {call.url.params["hours"] for call in calls} == {"24"}


def test_network_usage_per_hour(client, upstreams) -> None:
    calls = upstreams(
        homenet={
            "/bandwidth": {
                "total_rx_bytes": 3_000,
                "total_tx_bytes": 300,
                "items": [
                    {"start": "2026-11-13T10:00:00Z", "rx_bytes": 1_000, "tx_bytes": 100},
                    {"start": "2026-11-13T11:00:00Z", "rx_bytes": 2_000, "tx_bytes": 200},
                ],
            },
            "/device-usage": [],
        }
    )

    body = client.get("/dashboard/network/usage").json()

    assert [hour["rx_bytes"] for hour in body["hourly"]] == [1_000, 2_000]
    assert calls[0].url.params["bucket"] == "hour"


def test_speed_test(client, upstreams) -> None:
    upstreams(
        homenet={
            "/speed-test/latest": {
                "measured_at": "2026-11-13T12:00:00Z",
                "download_mbps": 48.5,
                "ping_ms": 31.0,
                "duration_ms": 9000,
                "server_location": "Havana",
                "client_location": None,
            }
        }
    )

    body = client.get("/dashboard/network/speed-test").json()

    assert (body["download_mbps"], body["ping_ms"]) == (48.5, 31.0)


def test_speed_test_before_the_first_one(client, upstreams) -> None:
    upstreams(homenet={"/speed-test/latest": (200, None)})

    assert client.get("/dashboard/network/speed-test").json() is None


def test_status_checks_every_app(client, upstreams) -> None:
    upstreams(
        bluetti={"/health": {"status": "ok"}},
        homenet={"/health": {"status": "ok"}},
        localtube={"/api/health": httpx.ConnectError("refused")},
    )
    app.dependency_overrides[get_status_tracker] = StatusTracker

    body = client.get("/dashboard/status").json()

    assert [(item["source"], item["up"]) for item in body] == [
        ("bluetti", True),
        ("homenet", True),
        ("localtube", False),
    ]
    assert "Could not reach localtube" in body[2]["detail"]


def test_status_keeps_since_until_the_state_changes() -> None:
    tracker = StatusTracker()
    first, second, third = (datetime(2026, 11, 13, hour, tzinfo=timezone.utc) for hour in (10, 11, 12))

    tracker.record("bluetti", True, None, first)
    tracker.record("bluetti", True, None, second)
    assert tracker.states["bluetti"].since == first

    tracker.record("bluetti", False, "refused", third)
    assert (tracker.states["bluetti"].up, tracker.states["bluetti"].since) == (False, third)


SYSTEM = {
    "updated_at": "2026-11-13T12:00:00+00:00",
    "cpu_percent": 12.5,
    "memory": {"total_bytes": 8_000, "used_bytes": 2_000, "available_bytes": 6_000, "percent": 25.0},
    "disks": [
        {
            "name": "system",
            "mount": "/",
            "total_bytes": 1_000,
            "used_bytes": 400,
            "available_bytes": 600,
            "percent": 40.0,
        }
    ],
    "network": {
        "interface": "eth0",
        "rx_bytes_per_second": 1_250.5,
        "tx_bytes_per_second": None,
        "total_rx_bytes": 9_000_000,
        "total_tx_bytes": 1_000_000,
    },
}


def test_system(client, upstreams) -> None:
    upstreams(agent={"/system": SYSTEM})

    body = client.get("/dashboard/system").json()

    assert body["cpu_percent"] == 12.5
    assert body["memory"]["percent"] == 25
    assert [disk["name"] for disk in body["disks"]] == ["system"]
    assert (body["network"]["rx_bytes_per_second"], body["network"]["total_rx_bytes"]) == (1_250.5, 9_000_000)


def test_system_away_from_linux(client, upstreams) -> None:
    upstreams(agent={"/system": {**SYSTEM, "cpu_percent": None, "memory": None}})

    body = client.get("/dashboard/system").json()

    assert (body["cpu_percent"], body["memory"]) == (None, None)


def test_system_when_the_agent_is_down_is_502(client, upstreams) -> None:
    upstreams(agent={"/system": httpx.ConnectError("refused")})

    response = client.get("/dashboard/system")

    assert response.status_code == 502
    assert response.json()["source"] == "agent"


def test_system_traffic(client, upstreams) -> None:
    upstreams(
        agent={
            "/system/traffic": {
                "interval_minutes": 15,
                "points": [
                    {"at": "2026-11-13T11:45:00+00:00", "rx_bytes_per_second": 2_000.0, "tx_bytes_per_second": 300.0}
                ],
            }
        }
    )

    body = client.get("/dashboard/system/traffic").json()

    assert body["interval_minutes"] == 15
    assert body["points"][0]["rx_bytes_per_second"] == 2_000
