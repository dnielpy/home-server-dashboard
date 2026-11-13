from datetime import datetime

from pydantic import BaseModel

from app.clients.upstream import Upstream


class PowerTotals(BaseModel):
    with_power_hours: float
    without_power_hours: float
    receiving_ac: bool | None
    outage_ongoing: bool


class PowerPeriod(BaseModel):
    start: datetime
    end: datetime
    receiving_ac: bool


class BatteryEstimate(BaseModel):
    status: str
    soc: int | None
    load_w: float | None
    reserve_percent: float
    eta: datetime | None
    hours_left: float | None
    full_eta: datetime | None = None
    hours_to_full: float | None = None


async def power_totals(bluetti: Upstream, hours: float) -> PowerTotals:
    return PowerTotals.model_validate(await bluetti.get("/power-totals", hours=hours))


async def power_periods(bluetti: Upstream, hours: float) -> list[PowerPeriod]:
    return [PowerPeriod.model_validate(item) for item in await bluetti.get("/power-periods", hours=hours)]


async def battery_estimate(bluetti: Upstream) -> BatteryEstimate:
    return BatteryEstimate.model_validate(await bluetti.get("/battery-estimate"))
