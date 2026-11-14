import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

BatteryState = Literal["full", "charging", "discharging", "idle", "unknown"]


class UpstreamErrorOut(BaseModel):
    detail: str
    source: str


class SourceStatusOut(BaseModel):
    source: Literal["bluetti", "homenet", "localtube"]
    up: bool
    # When it came up or went down; the first check after this API started when it has not changed since
    since: datetime
    detail: str | None


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


class BatteryHistoryPointOut(BaseModel):
    at: datetime
    soc: int | None
    load_w: float | None


class BatteryHistoryOut(BaseModel):
    hours: float
    points: list[BatteryHistoryPointOut]


class NetworkSpeedOut(BaseModel):
    measured_at: datetime
    rx_bytes_per_second: int
    tx_bytes_per_second: int


class TopDeviceOut(BaseModel):
    mac: str
    name: str
    down_bytes: int
    up_bytes: int


class BandwidthHourOut(BaseModel):
    start: datetime
    rx_bytes: int
    tx_bytes: int


class NetworkUsageOut(BaseModel):
    hours: float
    total_rx_bytes: int
    total_tx_bytes: int
    top_device: TopDeviceOut | None
    hourly: list[BandwidthHourOut]


class SpeedTestOut(BaseModel):
    measured_at: datetime
    download_mbps: float
    ping_ms: float | None


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


# The server itself, as the agent reads it from /proc and the filesystems


class MemoryOut(BaseModel):
    total_bytes: int
    used_bytes: int
    available_bytes: int
    percent: float


class DiskOut(BaseModel):
    name: Literal["system", "external"]
    mount: str
    total_bytes: int
    used_bytes: int
    available_bytes: int
    percent: float


class SystemNetworkOut(BaseModel):
    # The interface of the default route; None away from Linux
    interface: str | None
    # Over the last second; None until the agent has two readings to compare
    rx_bytes_per_second: float | None
    tx_bytes_per_second: float | None
    # Since the agent started counting, across reboots of the server
    total_rx_bytes: int
    total_tx_bytes: int


class TrafficPointOut(BaseModel):
    at: datetime
    rx_bytes_per_second: float | None
    tx_bytes_per_second: float | None


class LastShutdownOut(BaseModel):
    # When the boot before this one wrote its last line to the journal
    at: datetime
    # True when systemd shut it down (a restart or a power off), False when it was cut off (the power went, it hung)
    clean: bool


class BootOut(BaseModel):
    # None away from Linux
    booted_at: datetime | None
    # None when the agent cannot read the journal or there was no boot before
    last_shutdown: LastShutdownOut | None


class SystemOut(BaseModel):
    updated_at: datetime
    # Over the last second; None until the agent has two readings to compare
    cpu_percent: float | None
    # None away from Linux, where there is no /proc/meminfo
    memory: MemoryOut | None
    # The system disk, and the external one while it is mounted
    disks: list[DiskOut]
    network: SystemNetworkOut
    # None from an agent older than this field
    boot: BootOut | None = None


class SystemTrafficOut(BaseModel):
    interval_minutes: int
    points: list[TrafficPointOut]


# Management: the projects on the server and their updates, as the agent reports them. Times as Unix seconds.

FetchState = Literal["pending", "ok", "err", "noup"]


class AgentInfoOut(BaseModel):
    user: str
    host: str
    # The folder with the projects, as ~/home-server
    root: str


class ServiceStatusOut(BaseModel):
    # False when the project never had containers, None when Docker could not be asked
    deployed: bool | None
    up: bool
    # When the last container came up, or the last one stopped
    since: datetime | None
    detail: str | None


ContainerAction = Literal["stop", "start", "restart"]
PowerAction = Literal["reboot", "poweroff"]


class ContainerActionOut(BaseModel):
    # The last stop, start or restart of its containers from the dashboard
    name: ContainerAction
    state: Literal["pending", "ok", "err"]
    error: str | None


class ProjectOut(BaseModel):
    name: str
    path: str
    branch: str | None
    # The last git fetch: running, done, failed, or done on a branch that follows no remote
    fetch: FetchState
    fetch_error: str | None
    behind: int
    local_epoch: int | None
    remote_epoch: int | None
    service: ServiceStatusOut
    updating: bool
    action: ContainerActionOut | None = None
    # The dashboard itself, which can be restarted but not stopped from here
    dashboard: bool = False


class CommitOut(BaseModel):
    hash: str
    epoch: int
    subject: str


class NewCommitOut(CommitOut):
    author: str


class ProjectDetailOut(ProjectOut):
    has_upstream: bool
    head: CommitOut | None
    remote: CommitOut | None
    # Commits on the server that are not on GitHub
    ahead: int
    # Commits on GitHub that are not on the server, newest first
    commits: list[NewCommitOut]
    # Uncommitted changes to tracked files, which can make the pull fail
    dirty: bool


class UpdateStepOut(BaseModel):
    label: str
    started_at: float
    finished_at: float | None


class UpdateJobOut(BaseModel):
    project: str
    running: bool
    code: int | None
    cancelled: bool
    first_deploy: bool
    started_at: float
    finished_at: float | None
    # The commit the server is on after the update
    hash: str | None
    steps: list[UpdateStepOut]
    # The steps update.sh prints, to show them before it reaches them
    expected_steps: list[str]
    lines: list[str]
    # Ask again from here for the lines that came after
    offset: int
    total_lines: int
    # The agent's clock, to count the elapsed time without trusting the browser's
    now: float


class LogLineOut(BaseModel):
    time: datetime | None
    text: str


class ContainerLogsOut(BaseModel):
    # The project's containers, by their compose service
    containers: list[str]
    # The one the lines are from, None when the project has no containers
    container: str | None
    lines: list[LogLineOut]


class SenderFileOut(BaseModel):
    id: str
    name: str
    size: int
    downloaded: bool


class SenderDraftOut(BaseModel):
    id: str
    files: list[SenderFileOut]


class SenderPackageOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    # The files still waiting to be downloaded and their size; the names are only shown after the PIN
    file_count: int
    total_bytes: int


class SenderUnlockOut(BaseModel):
    package: SenderPackageOut
    files: list[SenderFileOut]
    # Downloads the package's files (?token=) for half an hour
    token: str


class SenderSealIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    pin: Annotated[str, StringConstraints(pattern=r"^\d{4}$")]


class SenderPinIn(BaseModel):
    pin: Annotated[str, StringConstraints(pattern=r"^\d{4}$")]
