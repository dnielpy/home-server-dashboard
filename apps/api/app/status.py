import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Request

from app.clients.upstream import Upstream, UpstreamError, Upstreams

# Each app's health check, relative to its base URL
HEALTH_PATHS = {"bluetti": "/health", "homenet": "/health", "localtube": "/api/health"}
CHECK_INTERVAL_SECONDS = 30


@dataclass
class SourceState:
    up: bool
    # When the app was first seen in this state. Kept in memory, so after a restart of this API it is the first check
    since: datetime
    detail: str | None


class StatusTracker:
    """Whether each app answers its health check, and since when."""

    def __init__(self) -> None:
        self.states: dict[str, SourceState] = {}

    def record(self, source: str, up: bool, detail: str | None, now: datetime) -> None:
        state = self.states.get(source)
        if state is None or state.up != up:
            self.states[source] = SourceState(up=up, since=now, detail=detail)
        else:
            state.detail = detail

    @property
    def complete(self) -> bool:
        return self.states.keys() >= HEALTH_PATHS.keys()


async def _check(upstream: Upstream) -> tuple[bool, str | None]:
    try:
        await upstream.get(HEALTH_PATHS[upstream.source])
    except UpstreamError as err:
        return False, err.detail
    return True, None


async def check_all(upstreams: Upstreams, tracker: StatusTracker) -> None:
    sources = (upstreams.bluetti, upstreams.homenet, upstreams.localtube)
    results = await asyncio.gather(*(_check(upstream) for upstream in sources))
    now = datetime.now(timezone.utc)
    for upstream, (up, detail) in zip(sources, results):
        tracker.record(upstream.source, up, detail, now)


async def watch(upstreams: Upstreams, tracker: StatusTracker) -> None:
    """Checks every app on a fixed interval while the API runs, so a change is caught even with no one looking."""
    while True:
        await check_all(upstreams, tracker)
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def get_status_tracker(request: Request) -> StatusTracker:
    return request.app.state.status


StatusTrackerDep = Annotated[StatusTracker, Depends(get_status_tracker)]
