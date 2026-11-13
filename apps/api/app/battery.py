from app.clients.bluetti import BatteryEstimate
from app.schemas import BatteryOut, BatteryState

# Above this the battery counts as charged while it neither charges nor drains
FULL_PERCENT = 95


def battery_state(status: str, soc: int | None) -> BatteryState:
    """What the battery card shows from the Bluetti's estimate status. With grid power the Bluetti keeps reporting
    input once it is full, so a charge at 100 % is full."""
    if soc is None:
        return "unknown"
    if status in ("discharging", "reserve"):
        return "discharging"
    if status == "charging":
        return "full" if soc >= 100 else "charging"
    if status == "idle":
        return "full" if soc >= FULL_PERCENT else "idle"
    return "unknown"


def battery_out(estimate: BatteryEstimate) -> BatteryOut:
    state = battery_state(estimate.status, estimate.soc)
    out = BatteryOut(
        soc=estimate.soc,
        state=state,
        load_w=estimate.load_w,
        reserve_percent=estimate.reserve_percent,
        eta=None,
        hours_left=None,
        eta_kind=None,
    )
    if state == "discharging" and estimate.eta is not None:
        out.eta, out.hours_left, out.eta_kind = estimate.eta, estimate.hours_left, "reserve"
    elif state == "charging" and estimate.full_eta is not None:
        out.eta, out.hours_left, out.eta_kind = estimate.full_eta, estimate.hours_to_full, "full"
    return out
