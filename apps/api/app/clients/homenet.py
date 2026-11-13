from datetime import datetime

from pydantic import BaseModel

from app.clients.upstream import Upstream


class Throughput(BaseModel):
    measured_at: datetime
    rx_bytes_per_second: int
    tx_bytes_per_second: int


class Bandwidth(BaseModel):
    total_rx_bytes: int
    total_tx_bytes: int


class DeviceUsage(BaseModel):
    mac: str
    name: str
    down_bytes: int
    up_bytes: int


async def current_throughput(homenet: Upstream) -> Throughput:
    return Throughput.model_validate(await homenet.get("/connection/throughput/current"))


async def bandwidth(homenet: Upstream, hours: float) -> Bandwidth:
    # Daily buckets keep the response small; only the totals are used
    return Bandwidth.model_validate(await homenet.get("/bandwidth", hours=hours, bucket="day"))


async def device_usage(homenet: Upstream, hours: float) -> list[DeviceUsage]:
    """Heaviest first; devices without usage are left out."""
    return [DeviceUsage.model_validate(item) for item in await homenet.get("/device-usage", hours=hours)]
