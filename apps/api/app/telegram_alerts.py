"""Alerts the bot sends on its own: grid power going and coming back, internet coming back after an outage, and
finished downloads.

Every 30 seconds the watcher compares the sources with what it saw last, which it keeps in the bot's state so a
restart neither repeats an alert nor misses a change that happened while it was down. The first look at a source only
records it. Alerts wait in an outbox until Telegram takes them, so one written while there is no internet arrives
when it comes back.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from html import escape
from typing import TYPE_CHECKING

from pydantic import AwareDatetime, BaseModel, Field

from app.clients.videodownloader import VideoDownloads, dashboard
from app.telegram_messages import (
    DESTINATION_NAMES,
    Estimate,
    PowerStatus,
    SummaryPage,
    _read,
    _safely,
    bar,
    clock,
    duration,
    recent,
    short,
    size,
)

if TYPE_CHECKING:
    from app.telegram import TelegramBot

log = logging.getLogger(__name__)

INTERVAL_SECONDS = 30
# A change has to last this long to be told: the Bluetti's AC input flickers for a few seconds now and then, and a
# single failed internet check is not an outage
MIN_CHANGE = timedelta(minutes=1)
MAX_OUTBOX = 30
BREAK_NAMES = {
    "router": "el router", "nano": "la antena Nano", "provider": "el proveedor", "internet": "internet (fuera del proveedor)",
}


class Outgoing(BaseModel):
    text: str
    # Who still has to receive it
    users: list[int]


class AlertState(BaseModel):
    # The grid power last told (or first seen), and since when; None before the first fresh reading
    power_ac: bool | None = None
    power_since: AwareDatetime | None = None
    # The end of the last internet outage already told, once Home Net was read at least once
    internet_seen: bool = False
    outage_end: AwareDatetime | None = None
    # The finished downloads already known, once the video downloader was read at least once
    downloads_seen: bool = False
    finished: list[str] = Field(default_factory=list)
    outbox: list[Outgoing] = Field(default_factory=list)


class OutagePeriod(BaseModel):
    start: AwareDatetime
    end: AwareDatetime
    break_at: str | None = None


class ConnectionStatus(BaseModel):
    online: bool | None
    last_outage: OutagePeriod | None = None


def _battery_lines(estimate: Estimate | None) -> list[str]:
    if estimate is None or estimate.soc is None or estimate.status in ("stale", "no_data"):
        return []
    lines = [f"🔋 Batería: {estimate.soc}% {bar(estimate.soc)}"]
    if estimate.status == "discharging" and estimate.hours_left is not None:
        lines.append(f"⏳ Autonomía hasta la reserva ({estimate.reserve_percent:g}%): {duration(estimate.hours_left)}")
    return lines


def power_off_alert(since: datetime, estimate: Estimate | None, now: datetime) -> str:
    return "\n".join(["🚨 <b>Se fue la luz</b>", f"🕒 {clock(since, now)}", "", *_battery_lines(estimate)]).strip()


def power_on_alert(since: datetime, outage_start: datetime | None, estimate: Estimate | None, now: datetime) -> str:
    lines = ["✅ <b>Vino la luz</b>", f"🕒 {clock(since, now)}"]
    if outage_start is not None and outage_start < since:
        hours = (since - outage_start).total_seconds() / 3600
        lines.append(f"⏱️ Estuvo <b>{duration(hours)}</b> sin luz (desde {clock(outage_start, now)})")
    battery = _battery_lines(estimate)
    return "\n".join([*lines, *([""] + battery[:1] if battery else [])])


def internet_alert(outage: OutagePeriod, now: datetime) -> str:
    hours = (outage.end - outage.start).total_seconds() / 3600
    lines = [
        "🌐 <b>Volvió internet</b>",
        f"📴 Se fue a las {clock(outage.start, now)} y volvió a las {clock(outage.end, now)}",
        f"⏱️ Estuvo <b>{duration(hours)}</b> desconectado",
    ]
    if outage.break_at:
        lines.append(f"📍 Falló en {escape(BREAK_NAMES.get(outage.break_at, outage.break_at))}")
    return "\n".join(lines)


def downloads_alert(finished: list, now: datetime) -> str:
    if len(finished) == 1:
        download = finished[0]
        details = [size(download.totalBytes or download.completedBytes), f"📁 {DESTINATION_NAMES[download.destination]}"]
        return "\n".join([
            "✅ <b>Descarga terminada</b>", f"📄 {escape(short(download.fileName))}", f"💾 {' · '.join(details)}",
        ])
    lines = [f"✅ <b>{len(finished)} descargas terminadas</b>", ""]
    lines += [
        f"• {escape(short(download.fileName, 40))} ({size(download.totalBytes or download.completedBytes)})"
        for download in finished
    ]
    return "\n".join(lines)


class AlertWatcher:
    def __init__(self, bot: "TelegramBot") -> None:
        self.bot = bot

    @property
    def state(self) -> AlertState:
        return self.bot.store.state.alerts

    def _save(self, **changes: object) -> None:
        self.bot.store.save(alerts=self.state.model_copy(update=changes))

    async def run(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                # One bad answer must not end the alerts for good
                log.exception("Telegram alerts check failed")
            await asyncio.sleep(INTERVAL_SECONDS)

    async def tick(self, now: datetime | None = None) -> None:
        now = now or datetime.now(UTC)
        alerts = [*await self._power(now), *await self._internet(now), *await self._downloads(now)]
        if alerts:
            users = [user.user_id for user in self.bot.users()]
            outbox = [*self.state.outbox, *(Outgoing(text=text, users=users) for text in alerts if users)]
            self._save(outbox=outbox[-MAX_OUTBOX:])
        await self.flush()

    async def _power(self, now: datetime) -> list[str]:
        bluetti = self.bot.upstreams.bluetti
        power, page = await asyncio.gather(
            _read(bluetti, "/power-status", PowerStatus), _read(bluetti, "/data-summary", SummaryPage, page_size=1),
        )
        reading = page.items[0] if page and page.items else None
        # Only a fresh reading says what the grid is doing now, and the power status since when
        if reading is None or not recent(reading.date, now):
            return []
        if power is None or power.receiving_ac != reading.ac or power.current_since is None:
            return []
        since = power.current_since
        state = self.state
        if state.power_ac is None:
            self._save(power_ac=reading.ac, power_since=since)
            return []
        if reading.ac == state.power_ac or now - since < MIN_CHANGE:
            return []
        estimate = await _read(bluetti, "/battery-estimate", Estimate)
        text = (
            power_on_alert(since, state.power_since, estimate, now) if reading.ac
            else power_off_alert(since, estimate, now)
        )
        self._save(power_ac=reading.ac, power_since=since)
        return [text]

    async def _internet(self, now: datetime) -> list[str]:
        status = await _read(self.bot.upstreams.homenet, "/connection-status", ConnectionStatus)
        if status is None:
            return []
        outage = status.last_outage
        state = self.state
        if not state.internet_seen:
            self._save(internet_seen=True, outage_end=outage.end if outage else None)
            return []
        if not status.online or outage is None or (state.outage_end is not None and outage.end <= state.outage_end):
            return []
        self._save(outage_end=outage.end)
        return [internet_alert(outage, now)] if outage.end - outage.start >= MIN_CHANGE else []

    async def _downloads(self, now: datetime) -> list[str]:
        data: VideoDownloads | None = await _safely(dashboard(self.bot.upstreams.videodownloader))
        if data is None:
            return []
        complete = [download for download in data.downloads if download.status == "complete"]
        known = set(self.state.finished)
        new = [download for download in complete if download.id not in known] if self.state.downloads_seen else []
        # Only the ones still listed, so the list does not grow forever
        finished = [download.id for download in complete]
        if not self.state.downloads_seen or finished != self.state.finished:
            self._save(downloads_seen=True, finished=finished)
        return [downloads_alert(new, now)] if new else []

    async def flush(self) -> None:
        # Imported here: telegram.py imports this module
        from app.telegram import TelegramError

        outbox = list(self.state.outbox)
        for index, item in enumerate(outbox):
            for position, user_id in enumerate(item.users):
                if not self.bot.is_allowed(user_id):
                    continue
                try:
                    await self.bot._call(
                        "sendMessage", chat_id=user_id, text=item.text, parse_mode="HTML",
                        link_preview_options={"is_disabled": True},
                    )
                except TelegramError as err:
                    # A blocked bot or a gone chat will not take it later either
                    if err.code in (400, 403):
                        continue
                    # Most likely no internet: keep the rest of this one and the ones after it for the next check
                    rest = item.model_copy(update={"users": item.users[position:]})
                    self._save(outbox=[rest, *outbox[index + 1:]])
                    return
            # Saved after each one, so a crash does not send what was already sent again
            self._save(outbox=outbox[index + 1:])
