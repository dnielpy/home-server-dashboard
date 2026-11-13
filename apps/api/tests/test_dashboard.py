import httpx

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
