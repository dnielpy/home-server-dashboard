"""The bot's replies, in Telegram HTML. Partial and timestamp-aware: an unavailable source never hides the others."""

import asyncio
from datetime import UTC, datetime, timedelta, timezone
from html import escape
from typing import Any, TypeVar

from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel, ValidationError

from app.battery import battery_out
from app.clients.agent import system
from app.clients.bluetti import BatteryEstimate, PowerPeriod, PowerTotals
from app.clients.homenet import Bandwidth, DeviceUsage, SpeedTest, Throughput
from app.clients.upstream import Upstream, UpstreamError, Upstreams
from app.clients.videodownloader import VideoDownload, VideoDownloads, dashboard
from app.schemas import SystemOut

# Match apps/web/lib/time-zone.ts, rather than the host/container's timezone.
LOCAL_ZONE = timezone(timedelta(hours=-4))
MAX_AGE = timedelta(minutes=3)
DAY_HOURS = 24
# The Bluetti's AC input flickers for a few seconds now and then; that is not an outage
MIN_OUTAGE_HOURS = 1 / 60
# Downloads listed one by one, and of the waiting ones only their names; the rest are only counted
MAX_DOWNLOADS = 8
MAX_WAITING = 3
MAX_NAME = 48
T = TypeVar("T", bound=BaseModel)

DESTINATION_NAMES = {"downloads": "Descargas", "gallery": "Galería"}
COMMAND_ICONS = {"stats": "🏠", "battery": "🔋", "internet": "🌐", "server": "🖥️", "downloads": "📥", "help": "❓"}


class PowerStatus(BaseModel):
    receiving_ac: bool | None
    current_since: AwareDatetime | None


class Reading(BaseModel):
    date: AwareDatetime
    battery_percent: int = Field(ge=0, le=100)
    ac_output: int
    ac: bool


class SummaryPage(BaseModel):
    items: list[Reading]


class Hop(BaseModel):
    name: str
    ok: bool
    latency_ms: float | None = None


class Connection(BaseModel):
    checked_at: AwareDatetime
    online: bool
    # The first hop that did not answer, while offline
    break_at: str | None = None
    hops: list[Hop] = []


class Estimate(BatteryEstimate):
    model_config = ConfigDict(allow_inf_nan=False)


class Periods(RootModel[list[PowerPeriod]]):
    pass


class Devices(RootModel[list[DeviceUsage]]):
    pass


async def _read(upstream: Upstream, path: str, model: type[T], **params: Any) -> T | None:
    try:
        body = await upstream.get(path, **params)
        return None if body is None else model.model_validate(body)
    except (UpstreamError, ValidationError, ValueError, TypeError):
        return None


async def _safely(call: Any) -> Any:
    try:
        return await call
    # The agent's client raises HTTPException for the answers the dashboard passes through
    except (UpstreamError, HTTPException, ValidationError, ValueError, TypeError, KeyError):
        return None


# Formatting


def local_time(value: datetime) -> str:
    return value.astimezone(LOCAL_ZONE).strftime("%d/%m/%Y %H:%M")


def clock(value: datetime, now: datetime) -> str:
    """Only the hour when it is today, and the day too otherwise."""
    local = value.astimezone(LOCAL_ZONE)
    same_day = local.date() == now.astimezone(LOCAL_ZONE).date()
    return local.strftime("%H:%M" if same_day else "%d/%m %H:%M")


def recent(value: datetime, now: datetime) -> bool:
    return value.tzinfo is not None and -timedelta(seconds=30) <= now - value <= MAX_AGE


def duration(hours: float) -> str:
    minutes = max(0, round(hours * 60))
    if minutes < 1:
        return "menos de 1 min"
    h, m = divmod(minutes, 60)
    if h >= 24:
        d, h = divmod(h, 24)
        return f"{d} d {h} h"
    return f"{h} h {m} min" if h else f"{m} min"


def bar(percent: float, width: int = 10) -> str:
    filled = round(max(0, min(100, percent)) / 100 * width)
    return "▰" * filled + "▱" * (width - filled)


def level(percent: float) -> str:
    """A traffic light for how full something is."""
    return "🔴" if percent >= 90 else "🟡" if percent >= 75 else "🟢"


def size(value: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(value) < 1024:
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def rate(bytes_per_second: float) -> str:
    return f"{size(bytes_per_second)}/s"


def mbps(bytes_per_second: float) -> str:
    return f"{bytes_per_second * 8 / 1_000_000:.1f} Mbps"


def short(name: str, limit: int = MAX_NAME) -> str:
    """Cut in the middle, so the end of a file name (part28.rar) stays."""
    if len(name) <= limit:
        return name
    tail = limit // 3
    return name[: limit - tail - 1] + "…" + name[-tail:]


def header(icon: str, title: str, now: datetime) -> list[str]:
    return [f"{icon} <b>{title}</b>", f"🕒 <i>{local_time(now)}</i>", ""]


# /help


def help_message(commands: list[tuple[str, str]], links: bool) -> str:
    lines = ["👋 <b>¡Hola! Soy el bot de la casa</b>", "", "Esto es lo que puedo hacer:", ""]
    lines += [f"{COMMAND_ICONS.get(name, '▫️')} /{name} — {escape(description)}" for name, description in commands]
    if not commands:
        lines.append("<i>Ahora mismo no hay comandos activos.</i>")
    if links:
        lines += ["", "📎 <b>¿Quieres descargar algo?</b>", "Mándame un enlace y te pregunto si lo agrego a las descargas."]
    return "\n".join(lines)


# /stats


async def stats_message(upstreams: Upstreams, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    power, estimate, page, network = await asyncio.gather(
        _read(upstreams.bluetti, "/power-status", PowerStatus),
        _read(upstreams.bluetti, "/battery-estimate", Estimate),
        _read(upstreams.bluetti, "/data-summary", SummaryPage, page_size=1),
        _read(upstreams.homenet, "/connection/latest", Connection),
    )
    reading = page.items[0] if page and page.items else None
    fresh = reading is not None and recent(reading.date, now)
    lines = header("🏠", "Estado de la casa", now)

    # PowerStatus has no measurement timestamp: corroborate it with the latest stored reading.
    if fresh:
        lines.append("⚡ <b>Corriente:</b> ✅ hay luz" if reading.ac else "⚡ <b>Corriente:</b> 🚨 apagón")
        event = "Vino la luz" if reading.ac else "Se fue la luz"
        since = power.current_since if power and power.receiving_ac == reading.ac else None
        lines.append(f"   └ {event}: {local_time(since)}" if since and since.tzinfo else f"   └ {event}: hora no disponible")
    elif reading:
        state = "con corriente" if reading.ac else "sin corriente"
        lines.append(f"⚡ <b>Corriente:</b> no disponible\n   └ última lectura: {state}, {local_time(reading.date)}")
    else:
        lines.append("⚡ <b>Corriente:</b> no disponible")
    lines.append("")

    usable = estimate and estimate.status not in ("stale", "no_data") and (fresh or page is None)
    if usable and estimate.soc is not None:
        states = {
            "charging": "⚡ cargando", "discharging": "🔻 descargando", "reserve": "🪫 en reserva", "idle": "💤 en reposo",
        }
        state = (
            "✅ cargada" if estimate.soc >= 100 and estimate.status in ("charging", "idle")
            else states.get(estimate.status, "estado no disponible")
        )
        lines.append(f"🔋 <b>Batería:</b> {estimate.soc}% {bar(estimate.soc)} · {state}")
    elif fresh:
        lines.append(f"🔋 <b>Batería:</b> {reading.battery_percent}% {bar(reading.battery_percent)} · estado no disponible")
    elif reading:
        lines.append(
            f"🔋 <b>Batería:</b> no disponible\n   └ última lectura: {reading.battery_percent}%, {local_time(reading.date)}"
        )
    else:
        lines.append("🔋 <b>Batería:</b> no disponible")

    load = estimate.load_w if usable else None
    if load is None and fresh:
        load = reading.ac_output
    lines.append(f"   └ 🔌 Consumo: {load:g} W" if load is not None else "   └ 🔌 Consumo: no disponible")
    if usable and estimate.status == "charging" and estimate.soc is not None and estimate.soc >= 100:
        lines.append("   └ ✅ Carga completa")
    elif usable and estimate.status == "charging" and estimate.hours_to_full is not None:
        lines.append(f"   └ ⏳ Hasta carga completa: {duration(estimate.hours_to_full)}")
    elif usable and estimate.status == "reserve":
        lines.append(f"   └ 🪫 Reserva del {estimate.reserve_percent:g}% alcanzada")
    elif usable and estimate.hours_left is not None:
        lines.append(f"   └ ⏳ Autonomía hasta reserva del {estimate.reserve_percent:g}%: {duration(estimate.hours_left)}")
    else:
        lines.append("   └ ⏳ Autonomía / tiempo de carga: no disponible")
    lines.append("")

    if network and recent(network.checked_at, now):
        lines.append("🌐 <b>Internet:</b> ✅ conectado" if network.online else "🌐 <b>Internet:</b> ❌ sin conexión")
    elif network:
        state = "conectado" if network.online else "sin conexión"
        lines.append(f"🌐 <b>Internet:</b> no disponible\n   └ última lectura: {state}, {local_time(network.checked_at)}")
    else:
        lines.append("🌐 <b>Internet:</b> no disponible")
    lines += ["", "💡 <i>Más detalle:</i> /battery · /internet · /server · /downloads"]
    return "\n".join(lines)


# /battery


async def battery_message(upstreams: Upstreams, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    estimate, power, totals, periods = await asyncio.gather(
        _read(upstreams.bluetti, "/battery-estimate", Estimate),
        _read(upstreams.bluetti, "/power-status", PowerStatus),
        _read(upstreams.bluetti, "/power-totals", PowerTotals, hours=DAY_HOURS),
        _read(upstreams.bluetti, "/power-periods", Periods, hours=DAY_HOURS),
    )
    lines = header("🔋", "Batería Bluetti", now)

    stale = estimate is None or estimate.status in ("stale", "no_data")
    if estimate is None or estimate.soc is None:
        lines.append("❔ No pude leer la batería")
    elif stale:
        lines += ["⚠️ <b>Sin lecturas recientes de la Bluetti</b>", f"Última conocida: {estimate.soc}% {bar(estimate.soc)}"]
    else:
        out = battery_out(estimate)
        states = {
            "charging": "⚡ Cargando", "discharging": "🔻 Descargando", "full": "✅ Llena", "idle": "💤 En reposo",
        }
        state = "🪫 En reserva" if estimate.status == "reserve" else states.get(out.state, "❔ Estado desconocido")
        lines += [f"<b>{estimate.soc}%</b>  {bar(estimate.soc)}", state]
        if out.load_w is not None:
            lines.append(f"🔌 Consumo: <b>{out.load_w:g} W</b>")
        if out.eta_kind == "reserve" and out.hours_left is not None:
            lines.append(
                f"⏳ Llega a la reserva ({out.reserve_percent:g}%) en <b>{duration(out.hours_left)}</b> · {clock(out.eta, now)}"
            )
        elif out.eta_kind == "full" and out.hours_left is not None:
            lines.append(f"⏳ Llena en <b>{duration(out.hours_left)}</b> · {clock(out.eta, now)}")
        elif estimate.status == "reserve":
            lines.append(f"🪫 Alcanzó la reserva del {out.reserve_percent:g}%")
        lines.append(f"🛟 Reserva: {out.reserve_percent:g}%")

    lines += ["", "⚡ <b>Corriente</b>"]
    receiving = totals.receiving_ac if totals else None
    if receiving is None:
        lines.append("• Ahora: no disponible")
    else:
        now_text = "✅ hay luz" if receiving else "🚨 apagón"
        since = power.current_since if power and power.receiving_ac == receiving else None
        if since:
            now_text += f" desde {clock(since, now)} (hace {duration((now - since).total_seconds() / 3600)})"
        lines.append(f"• Ahora: {now_text}" + (" <i>(última lectura)</i>" if stale else ""))
    if totals:
        lines.append(
            f"• Últimas {DAY_HOURS} h: ☀️ {duration(totals.with_power_hours)} con luz · "
            f"🌑 {duration(totals.without_power_hours)} sin luz"
        )
    else:
        lines.append(f"• Últimas {DAY_HOURS} h: no disponible")
    if periods is not None:
        outages = [
            hours for period in periods.root
            if not period.receiving_ac and (hours := (period.end - period.start).total_seconds() / 3600) >= MIN_OUTAGE_HOURS
        ]
        if outages:
            lines.append(f"• Apagones: {len(outages)} · el más largo de {duration(max(outages))}")
        else:
            lines.append(f"• Sin apagones en {DAY_HOURS} h 🎉")
    return "\n".join(lines)


# /internet


async def internet_message(upstreams: Upstreams, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    homenet = upstreams.homenet
    connection, throughput, test, usage, devices = await asyncio.gather(
        _read(homenet, "/connection/latest", Connection),
        _read(homenet, "/connection/throughput/current", Throughput),
        _read(homenet, "/speed-test/latest", SpeedTest),
        _read(homenet, "/bandwidth", Bandwidth, hours=DAY_HOURS, bucket="hour"),
        _read(homenet, "/device-usage", Devices, hours=DAY_HOURS),
    )
    lines = header("🌐", "Internet", now)

    if connection is None:
        lines.append("❔ Estado de la conexión no disponible")
    else:
        live = recent(connection.checked_at, now)
        if connection.online:
            lines.append("✅ <b>Conectado</b>")
        else:
            lines.append("❌ <b>Sin conexión</b>")
            if connection.break_at:
                lines.append(f"   └ Falla en: {escape(connection.break_at)}")
        if not live:
            lines.append(f"   └ <i>última comprobación: {local_time(connection.checked_at)}</i>")
        internet = next((hop for hop in connection.hops if hop.name == "internet"), None)
        if connection.online and internet and internet.latency_ms is not None:
            lines.append(f"📶 Latencia: {internet.latency_ms:.0f} ms")

    lines += ["", "⚡ <b>Velocidad ahora</b>"]
    if throughput:
        lines.append(f"• ⬇️ {mbps(throughput.rx_bytes_per_second)} · ⬆️ {mbps(throughput.tx_bytes_per_second)}")
    else:
        lines.append("• no disponible")

    lines.append("")
    if test:
        lines.append(f"🚀 <b>Último test de velocidad</b> · {clock(test.measured_at, now)}")
        ping = f" · 📡 ping {test.ping_ms:.0f} ms" if test.ping_ms is not None else ""
        lines.append(f"• ⬇️ {test.download_mbps:g} Mbps{ping}")
    else:
        lines += ["🚀 <b>Último test de velocidad</b>", "• no disponible"]

    lines += ["", f"📊 <b>Últimas {DAY_HOURS} h</b>"]
    if usage:
        lines.append(f"• ⬇️ {size(usage.total_rx_bytes)} · ⬆️ {size(usage.total_tx_bytes)}")
    else:
        lines.append("• Consumo: no disponible")
    if devices and devices.root:
        top = devices.root[0]
        lines.append(f"• 🏆 Más consumo: <b>{escape(top.name)}</b> ({size(top.down_bytes)} ⬇️)")
    return "\n".join(lines)


# /server


async def server_message(upstreams: Upstreams, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    info: SystemOut | None = await _safely(system(upstreams.agent))
    lines = header("🖥️", "Servidor", now)
    if info is None:
        lines.append("❔ No pude leer el estado del servidor")
        return "\n".join(lines)

    if info.cpu_percent is not None:
        lines.append(f"{level(info.cpu_percent)} <b>CPU</b>  {info.cpu_percent:.0f}%  {bar(info.cpu_percent)}")
    else:
        lines.append("⚪ <b>CPU</b>  midiendo…")
    if info.memory:
        memory = info.memory
        lines.append(f"{level(memory.percent)} <b>RAM</b>  {memory.percent:.0f}%  {bar(memory.percent)}")
        lines.append(f"   └ {size(memory.used_bytes)} de {size(memory.total_bytes)} en uso")
    for disk in info.disks:
        title = "Disco del sistema" if disk.name == "system" else "Disco externo"
        lines.append(f"{level(disk.percent)} <b>{title}</b>  {disk.percent:.0f}%  {bar(disk.percent)}")
        lines.append(f"   └ {size(disk.available_bytes)} libres de {size(disk.total_bytes)}")
    if not any(disk.name == "external" for disk in info.disks):
        lines.append("⚠️ <b>Disco externo</b> no montado")

    network = info.network
    lines += ["", "🌐 <b>Red</b>" + (f" · <code>{escape(network.interface)}</code>" if network.interface else "")]
    if network.rx_bytes_per_second is not None and network.tx_bytes_per_second is not None:
        lines.append(f"• Ahora: ⬇️ {rate(network.rx_bytes_per_second)} · ⬆️ {rate(network.tx_bytes_per_second)}")
    lines.append(f"• Total: ⬇️ {size(network.total_rx_bytes)} · ⬆️ {size(network.total_tx_bytes)}")

    boot = info.boot
    if boot and boot.booted_at:
        lines += [
            "", f"⏱️ <b>Encendido</b> hace {duration((now - boot.booted_at).total_seconds() / 3600)}",
            f"   └ desde {clock(boot.booted_at, now)}",
        ]
        if boot.last_shutdown:
            shutdown = boot.last_shutdown
            kind = "✅ normal" if shutdown.clean else "⚡ corte (se fue la luz o se colgó)"
            lines.append(f"   └ Último apagado: {kind} · {clock(shutdown.at, now)}")
    return "\n".join(lines)


# /downloads

DOWNLOAD_STATES = {
    "active": ("⬇️", "Descargando"),
    "finalizing": ("🧩", "Terminando"),
    "retrying": ("🔁", "Reintentando"),
    "paused": ("⏸️", "En pausa"),
}
RUNNING = (*DOWNLOAD_STATES, "waiting")


def _download_lines(download: VideoDownload) -> list[str]:
    icon, label = DOWNLOAD_STATES[download.status]
    lines = [f"{icon} <b>{escape(short(download.fileName))}</b>"]
    if download.progress is not None:
        lines.append(f"   {bar(download.progress)} {download.progress:.1f}%")
    details = []
    if download.totalBytes:
        details.append(f"{size(download.completedBytes)} / {size(download.totalBytes)}")
    elif download.completedBytes:
        details.append(size(download.completedBytes))
    if download.status == "active":
        details.append(rate(download.speedBytesPerSecond))
        if download.etaSeconds is not None:
            details.append(f"⏳ {duration(download.etaSeconds / 3600)}")
    else:
        details.append(label)
    lines.append("   " + " · ".join(details))
    return lines


async def downloads_message(upstreams: Upstreams, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    data: VideoDownloads | None = await _safely(dashboard(upstreams.videodownloader))
    lines = header("📥", "Descargas", now)
    if data is None:
        lines.append("❔ No pude conectar con el gestor de descargas")
        return "\n".join(lines)

    count = {state: sum(1 for d in data.downloads if d.status == state) for state in RUNNING}
    active = count["active"] + count["finalizing"] + count["retrying"]
    started = sorted(
        (download for download in data.downloads if download.status in DOWNLOAD_STATES),
        key=lambda download: list(DOWNLOAD_STATES).index(download.status),
    )
    waiting = [download for download in data.downloads if download.status == "waiting"]

    lines.append(f"⚡ Velocidad: <b>{rate(data.stats.downloadSpeedBytesPerSecond)}</b>")
    lines.append(
        f"⬇️ {active} {'activa' if active == 1 else 'activas'} · ⏳ {count['waiting']} en espera · "
        f"⏸️ {count['paused']} en pausa"
    )
    if data.speedLimit:
        lines.append(f"🐢 Límite de velocidad: {rate(data.speedLimit)}")
    if data.queuePaused:
        lines.append("⏸️ <b>La cola está en pausa</b>")
    if not data.engineAvailable:
        lines.append("⚠️ <b>El motor de descargas no está disponible</b>")

    if not started and not waiting:
        lines += ["", "✅ No hay descargas en curso"]
    if started:
        lines.append("")
        for download in started[:MAX_DOWNLOADS]:
            lines += _download_lines(download)
        if len(started) > MAX_DOWNLOADS:
            lines.append(f"<i>…y {len(started) - MAX_DOWNLOADS} más</i>")
    if waiting:
        lines += ["", f"⏳ <b>En espera ({len(waiting)})</b>"]
        lines += [f"• {escape(short(download.fileName, 36))}" for download in waiting[:MAX_WAITING]]
        if len(waiting) > MAX_WAITING:
            lines.append(f"<i>…y {len(waiting) - MAX_WAITING} más</i>")
    return "\n".join(lines)
