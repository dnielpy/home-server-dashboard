from typing import Literal

from pydantic import BaseModel

from app.clients.upstream import Upstream

Destination = Literal["downloads", "gallery"]


class VideoDownload(BaseModel):
    id: str
    url: str
    destination: Destination
    fileName: str
    totalBytes: int | None
    completedBytes: int
    # 0 to 100, None while the size is unknown
    progress: float | None
    speedBytesPerSecond: float
    etaSeconds: float | None
    status: str
    errorMessage: str | None = None


class VideoDownloadStats(BaseModel):
    downloadSpeedBytesPerSecond: float
    active: int
    waiting: int
    stopped: int


class VideoDownloads(BaseModel):
    downloads: list[VideoDownload]
    stats: VideoDownloadStats
    # Bytes per second; 0 is no limit
    speedLimit: float = 0
    queuePaused: bool = False
    engineAvailable: bool = True


async def dashboard(videodownloader: Upstream) -> VideoDownloads:
    return VideoDownloads.model_validate(await videodownloader.get("/api/downloads"))


async def add(videodownloader: Upstream, url: str, destination: Destination, key: str) -> VideoDownload:
    """Queues the link. The same key never queues it twice, so a retried request is safe."""
    body = await videodownloader.post(
        "/api/downloads", json={"url": url, "destination": destination}, headers={"idempotency-key": key},
    )
    return VideoDownload.model_validate(body["download"])
