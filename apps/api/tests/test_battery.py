from datetime import UTC, datetime

import pytest

from app.battery import battery_state

ESTIMATE = {
    "computed_at": "2026-11-13T12:00:00Z",
    "status": "discharging",
    "soc": 60,
    "soc_estimate": 59.5,
    "load_w": 45.0,
    "drain_pct_per_hour": 5.0,
    "reserve_percent": 20.0,
    "eta": "2026-11-13T20:00:00Z",
    "eta_earliest": None,
    "eta_latest": None,
    "hours_left": 8.0,
    "full_eta": None,
    "hours_to_full": None,
    "model": {"wh_per_percent": 10.0, "idle_w": 5.0, "steps_used": 10, "from_history": True},
}


@pytest.mark.parametrize(
    ("status", "soc", "state"),
    [
        ("discharging", 60, "discharging"),
        ("discharging", 100, "discharging"),
        ("reserve", 18, "discharging"),
        ("charging", 60, "charging"),
        ("charging", 100, "full"),
        ("idle", 98, "full"),
        ("idle", 70, "idle"),
        ("stale", 70, "unknown"),
        ("no_data", None, "unknown"),
    ],
)
def test_battery_state(status: str, soc: int | None, state: str) -> None:
    assert battery_state(status, soc) == state


def test_discharging_battery_reaches_the_reserve(client, upstreams) -> None:
    upstreams(bluetti={"/battery-estimate": ESTIMATE})

    body = client.get("/dashboard/battery").json()

    assert body["state"] == "discharging"
    assert body["soc"] == 60
    assert body["eta_kind"] == "reserve"
    assert datetime.fromisoformat(body["eta"]) == datetime(2026, 11, 13, 20, tzinfo=UTC)
    assert body["hours_left"] == 8


def test_charging_battery_reaches_full(client, upstreams) -> None:
    estimate = {**ESTIMATE, "status": "charging", "eta": None, "hours_left": None}
    estimate |= {"full_eta": "2026-11-13T14:30:00Z", "hours_to_full": 2.5}
    upstreams(bluetti={"/battery-estimate": estimate})

    body = client.get("/dashboard/battery").json()

    assert (body["state"], body["eta_kind"], body["hours_left"]) == ("charging", "full", 2.5)


def test_full_battery_has_no_eta(client, upstreams) -> None:
    upstreams(bluetti={"/battery-estimate": {**ESTIMATE, "status": "charging", "soc": 100, "eta": None}})

    body = client.get("/dashboard/battery").json()

    assert (body["state"], body["eta"], body["eta_kind"]) == ("full", None, None)
