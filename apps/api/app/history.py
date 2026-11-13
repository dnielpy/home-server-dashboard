from datetime import datetime, timedelta

from app.clients.bluetti import BatteryPoint, LoadPoint
from app.schemas import BatteryHistoryPointOut

# The Bluetti is read every minute; 10 minute steps keep a day at 144 points, plenty for a chart
STEP = timedelta(minutes=10)


def _step_start(date: datetime) -> datetime:
    return date - (date - datetime.min.replace(tzinfo=date.tzinfo)) % STEP


def battery_history(battery: list[BatteryPoint], load: list[LoadPoint]) -> list[BatteryHistoryPointOut]:
    """The readings in 10 minute steps, oldest first: the last percentage of each step and its average load. A step
    with readings of only one of the two series leaves the other as None."""
    soc: dict[datetime, int] = {}
    for point in battery:
        soc[_step_start(point.date)] = point.battery_percent
    watts: dict[datetime, list[int]] = {}
    for point in load:
        watts.setdefault(_step_start(point.date), []).append(point.ac_output)

    return [
        BatteryHistoryPointOut(
            at=start,
            soc=soc.get(start),
            load_w=round(sum(watts[start]) / len(watts[start]), 1) if start in watts else None,
        )
        for start in sorted(soc.keys() | watts.keys())
    ]
