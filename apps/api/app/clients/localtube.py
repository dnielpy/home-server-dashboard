import uuid

from pydantic import BaseModel

from app.clients.upstream import Upstream


class ActiveDownload(BaseModel):
    id: uuid.UUID
    title: str | None
    status: str
    progress: float
    speed: str | None
    eta: str | None


class ActiveDownloads(BaseModel):
    count: int
    items: list[ActiveDownload]


class WatchTime(BaseModel):
    profile_id: uuid.UUID
    name: str
    seconds: float


async def active_downloads(localtube: Upstream) -> ActiveDownloads:
    return ActiveDownloads.model_validate(await localtube.get("/api/stats/downloads/active"))


async def watch_time(localtube: Upstream, hours: float | None = None) -> list[WatchTime]:
    """Every profile, the one that watched the most first; all time when `hours` is None."""
    return [WatchTime.model_validate(item) for item in await localtube.get("/api/stats/watch-time", hours=hours)]
