from datetime import datetime

from pydantic import BaseModel

from app.clients.upstream import Upstream


class Throughput(BaseModel):
    measured_at: datetime
    rx_bytes_per_second: int
    tx_bytes_per_second: int


class BandwidthPoint(BaseModel):
    start: datetime
    rx_bytes: int
    tx_bytes: int


class Bandwidth(BaseModel):
    total_rx_bytes: int
    total_tx_bytes: int
    items: list[BandwidthPoint]


class SpeedTest(BaseModel):
    measured_at: datetime
    download_mbps: float
    ping_ms: float | None


class DeviceUsage(BaseModel):
    mac: str
    name: str
    down_bytes: int
    up_bytes: int


async def current_throughput(homenet: Upstream) -> Throughput:
    return Throughput.model_validate(await homenet.get("/connection/throughput/current"))


async def bandwidth(homenet: Upstream, hours: float) -> Bandwidth:
    """Per hour, oldest first, with the totals of the whole range."""
    return Bandwidth.model_validate(await homenet.get("/bandwidth", hours=hours, bucket="hour"))


async def device_usage(homenet: Upstream, hours: float) -> list[DeviceUsage]:
    """Heaviest first; devices without usage are left out."""
    return [DeviceUsage.model_validate(item) for item in await homenet.get("/device-usage", hours=hours)]


async def latest_speed_test(homenet: Upstream) -> SpeedTest | None:
    """The last speed test Home Net ran (every 10 minutes), or None before the first one."""
    body = await homenet.get("/speed-test/latest")
    return None if body is None else SpeedTest.model_validate(body)
