import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BatteryState = Literal["full", "charging", "discharging", "idle", "unknown"]


class UpstreamErrorOut(BaseModel):
    detail: str
    source: str


class PowerPeriodOut(BaseModel):
    start: datetime
    end: datetime
    receiving_ac: bool


class PowerOut(BaseModel):
    hours: float
    with_power_hours: float
    without_power_hours: float
    receiving_ac: bool | None
    outage_ongoing: bool
    periods: list[PowerPeriodOut]


class BatteryOut(BaseModel):
    soc: int | None
    state: BatteryState
    load_w: float | None
    reserve_percent: float
    # When the battery reaches the reserve level while discharging, or 100 % while charging
    eta: datetime | None
    hours_left: float | None
    eta_kind: Literal["reserve", "full"] | None


class NetworkSpeedOut(BaseModel):
    measured_at: datetime
    rx_bytes_per_second: int
    tx_bytes_per_second: int


class TopDeviceOut(BaseModel):
    mac: str
    name: str
    down_bytes: int
    up_bytes: int


class NetworkUsageOut(BaseModel):
    hours: float
    total_rx_bytes: int
    total_tx_bytes: int
    top_device: TopDeviceOut | None


class DownloadOut(BaseModel):
    id: uuid.UUID
    title: str | None
    status: str
    progress: float
    speed: str | None
    eta: str | None


class DownloadsOut(BaseModel):
    count: int
    items: list[DownloadOut]


class WatchTimeOut(BaseModel):
    profile_id: uuid.UUID
    name: str
    seconds: float


class LocalTubeOut(BaseModel):
    downloading: DownloadsOut
    watch_time: list[WatchTimeOut]
