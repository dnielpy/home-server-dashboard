import asyncio

from fastapi import APIRouter

from app.battery import battery_out
from app.clients import bluetti, homenet, localtube
from app.clients.upstream import UpstreamsDep
from app import history, status
from app.schemas import (
    BandwidthHourOut,
    BatteryHistoryOut,
    BatteryOut,
    DownloadsOut,
    LocalTubeOut,
    NetworkSpeedOut,
    NetworkUsageOut,
    PowerOut,
    PowerPeriodOut,
    SourceStatusOut,
    SpeedTestOut,
    TopDeviceOut,
    UpstreamErrorOut,
    WatchTimeOut,
)

DAY_HOURS = 24

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    responses={502: {"model": UpstreamErrorOut, "description": "The app the card reads from failed"}},
)


@router.get(
    "/status",
    response_model=list[SourceStatusOut],
    description=(
        "Whether each app answers its health check and since when, checked every 30 seconds. `since` is the first check "
        "after this API started when the app has not changed since."
    ),
)
async def source_status(upstreams: UpstreamsDep, tracker: status.StatusTrackerDep) -> list[SourceStatusOut]:
    # Right after startup the first background check may not have finished yet
    if not tracker.complete:
        await status.check_all(upstreams, tracker)
    return [
        SourceStatusOut(source=source, up=state.up, since=state.since, detail=state.detail)
        for source in status.HEALTH_PATHS
        if (state := tracker.states.get(source))
    ]


@router.get(
    "/power",
    response_model=PowerOut,
    description="Hours with and without grid power in the last 24 hours, with the periods of each (Bluetti).",
)
async def power(upstreams: UpstreamsDep) -> PowerOut:
    totals, periods = await asyncio.gather(
        bluetti.power_totals(upstreams.bluetti, DAY_HOURS),
        bluetti.power_periods(upstreams.bluetti, DAY_HOURS),
    )
    return PowerOut(
        hours=DAY_HOURS,
        with_power_hours=totals.with_power_hours,
        without_power_hours=totals.without_power_hours,
        receiving_ac=totals.receiving_ac,
        outage_ongoing=totals.outage_ongoing,
        periods=[PowerPeriodOut(**period.model_dump()) for period in periods],
    )


@router.get(
    "/battery",
    response_model=BatteryOut,
    description=(
        "The Bluetti's battery: its percentage, whether it is full, charging or discharging, and when it reaches the "
        "reserve level (discharging) or 100 % (charging)."
    ),
)
async def battery(upstreams: UpstreamsDep) -> BatteryOut:
    return battery_out(await bluetti.battery_estimate(upstreams.bluetti))


@router.get(
    "/battery/history",
    response_model=BatteryHistoryOut,
    description="The battery percentage and the load (W) over the last 24 hours, in 10 minute steps (Bluetti).",
)
async def battery_history(upstreams: UpstreamsDep) -> BatteryHistoryOut:
    battery, load = await asyncio.gather(
        bluetti.battery_history(upstreams.bluetti, DAY_HOURS),
        bluetti.load_history(upstreams.bluetti, DAY_HOURS),
    )
    return BatteryHistoryOut(hours=DAY_HOURS, points=history.battery_history(battery, load))


@router.get(
    "/network/speed",
    response_model=NetworkSpeedOut,
    description="The Nano's speed right now (rx is download), read live by Home Net in about a second.",
)
async def network_speed(upstreams: UpstreamsDep) -> NetworkSpeedOut:
    throughput = await homenet.current_throughput(upstreams.homenet)
    return NetworkSpeedOut(**throughput.model_dump())


@router.get(
    "/network/usage",
    response_model=NetworkUsageOut,
    description=(
        "Bandwidth used in the last 24 hours, in total and per hour, and the device that used the most (Home Net)."
    ),
)
async def network_usage(upstreams: UpstreamsDep) -> NetworkUsageOut:
    total, devices = await asyncio.gather(
        homenet.bandwidth(upstreams.homenet, DAY_HOURS),
        homenet.device_usage(upstreams.homenet, DAY_HOURS),
    )
    return NetworkUsageOut(
        hours=DAY_HOURS,
        total_rx_bytes=total.total_rx_bytes,
        total_tx_bytes=total.total_tx_bytes,
        top_device=TopDeviceOut(**devices[0].model_dump()) if devices else None,
        hourly=[BandwidthHourOut(**item.model_dump()) for item in total.items],
    )


@router.get(
    "/network/speed-test",
    response_model=SpeedTestOut | None,
    description="The last speed test Home Net ran (every 10 minutes), or null before the first one.",
)
async def speed_test(upstreams: UpstreamsDep) -> SpeedTestOut | None:
    result = await homenet.latest_speed_test(upstreams.homenet)
    return None if result is None else SpeedTestOut(**result.model_dump())


@router.get(
    "/localtube",
    response_model=LocalTubeOut,
    description="Videos LocalTube is downloading now and the time each profile has watched, all time.",
)
async def local_tube(upstreams: UpstreamsDep) -> LocalTubeOut:
    downloads, watched = await asyncio.gather(
        localtube.active_downloads(upstreams.localtube),
        localtube.watch_time(upstreams.localtube),
    )
    return LocalTubeOut(
        downloading=DownloadsOut(**downloads.model_dump()),
        watch_time=[WatchTimeOut(**row.model_dump()) for row in watched],
    )
