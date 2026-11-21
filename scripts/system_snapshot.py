#!/usr/bin/env python3
"""Read the home server's local APIs for an OpenClaw system summary.

Run on the server. This script uses only HTTP GET against loopback and keeps
independent source errors in the output instead of losing the whole snapshot.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROUTES = {
    "dashboard_health": (3021, "/health"),
    "sources": (3021, "/dashboard/status"),
    "battery": (3021, "/dashboard/battery"),
    "battery_detail": (3001, "/battery-estimate"),
    "power": (3021, "/dashboard/power"),
    "network_speed": (3021, "/dashboard/network/speed"),
    "network_usage_24h": (3021, "/dashboard/network/usage"),
    "last_speed_test": (3021, "/dashboard/network/speed-test"),
    "internet_status": (3003, "/connection-status"),
    "internet_outages_24h": (3003, "/outages?hours=24"),
    "localtube": (3021, "/dashboard/localtube"),
    "server": (3021, "/dashboard/system"),
    "projects": (3021, "/management/projects"),
}


def fetch(route):
    port, path = route
    request = Request(f"http://127.0.0.1:{port}{path}", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            return {"ok": True, "data": json.load(response)}
    except HTTPError as error:
        return {"ok": False, "error": f"HTTP {error.code}"}
    except (URLError, TimeoutError, ValueError, OSError) as error:
        return {"ok": False, "error": str(error)[:240]}


def compact(name, result):
    if not result["ok"]:
        return result
    data = result["data"]
    if name == "power":
        periods = data.get("periods", [])
        data["period_count_24h"] = len(periods)
        data["recent_periods"] = periods[-5:]
        del data["periods"]
    elif name == "internet_outages_24h":
        result["data"] = {"count": len(data), "recent": data[-10:]}
    return result


def main():
    snapshot = {"checked_at": datetime.now(timezone.utc).isoformat(), "checks": {}}
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(fetch, route): name for name, route in ROUTES.items()}
        for job in as_completed(jobs):
            name = jobs[job]
            snapshot["checks"][name] = compact(name, job.result())
    json.dump(snapshot, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
