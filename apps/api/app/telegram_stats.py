"""A partial, timestamp-aware snapshot for Telegram; an unavailable source never hides the others."""

import asyncio
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, TypeVar

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError

from app.clients.bluetti import BatteryEstimate
from app.clients.upstream import Upstream, UpstreamError, Upstreams

# Match apps/web/lib/time-zone.ts, rather than the host/container's timezone.
LOCAL_ZONE = timezone(timedelta(hours=-4))
MAX_AGE = timedelta(minutes=3)
T = TypeVar("T", bound=BaseModel)


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


class Connection(BaseModel):
    checked_at: AwareDatetime
    online: bool


class Estimate(BatteryEstimate):
    model_config = ConfigDict(allow_inf_nan=False)


async def _read(upstream: Upstream, path: str, model: type[T], **params: Any) -> T | None:
    try:
        body = await upstream.get(path, **params)
        return None if body is None else model.model_validate(body)
    except (UpstreamError, ValidationError, ValueError, TypeError):
        return None


def local_time(value: datetime) -> str:
    return value.astimezone(LOCAL_ZONE).strftime("%d/%m/%Y %H:%M")


def recent(value: datetime, now: datetime) -> bool:
    return value.tzinfo is not None and -timedelta(seconds=30) <= now - value <= MAX_AGE


def duration(hours: float) -> str:
    minutes = max(0, round(hours * 60))
    if minutes < 1:
        return "menos de 1 min"
    h, m = divmod(minutes, 60)
    return f"{h} h {m} min" if h else f"{m} min"


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
    lines = ["🏠 Estado de la casa", f"Consulta: {local_time(now)}", ""]

    # PowerStatus has no measurement timestamp: corroborate it with the latest stored reading.
    if fresh:
        lines.append("⚡ Corriente: disponible" if reading.ac else "⚡ Corriente: apagón")
        event = "Vino la luz" if reading.ac else "Se fue la luz"
        since = power.current_since if power and power.receiving_ac == reading.ac else None
        lines.append(f"{event}: {local_time(since)}" if since and since.tzinfo else f"{event}: hora no disponible")
    elif reading:
        state = "con corriente" if reading.ac else "sin corriente"
        lines.append(f"⚡ Corriente: no disponible (última lectura: {state}, {local_time(reading.date)})")
    else:
        lines.append("⚡ Corriente: no disponible")

    usable = estimate and estimate.status not in ("stale", "no_data") and (fresh or page is None)
    if usable and estimate.soc is not None:
        states = {
            "charging": "cargando", "discharging": "descargando", "reserve": "en reserva", "idle": "en reposo",
        }
        state = (
            "cargada" if estimate.soc >= 100 and estimate.status in ("charging", "idle")
            else states.get(estimate.status, "estado no disponible")
        )
        lines.append(f"🔋 Batería Bluetti: {estimate.soc}% · {state}")
    elif fresh:
        lines.append(f"🔋 Batería Bluetti: {reading.battery_percent}% · estado no disponible")
    elif reading:
        lines.append(
            f"🔋 Batería Bluetti: no disponible (última lectura: {reading.battery_percent}%, {local_time(reading.date)})"
        )
    else:
        lines.append("🔋 Batería Bluetti: no disponible")

    load = estimate.load_w if usable else None
    if load is None and fresh:
        load = reading.ac_output
    lines.append(f"Consumo: {load:g} W" if load is not None else "Consumo: no disponible")
    if usable and estimate.status == "charging" and estimate.soc is not None and estimate.soc >= 100:
        lines.append("Carga completa")
    elif usable and estimate.status == "charging" and estimate.hours_to_full is not None:
        lines.append(f"Hasta carga completa: {duration(estimate.hours_to_full)}")
    elif usable and estimate.status == "reserve":
        lines.append(f"Autonomía: reserva del {estimate.reserve_percent:g}% alcanzada")
    elif usable and estimate.hours_left is not None:
        lines.append(f"Autonomía hasta reserva del {estimate.reserve_percent:g}%: {duration(estimate.hours_left)}")
    else:
        lines.append("Autonomía / tiempo de carga: no disponible")

    if network and recent(network.checked_at, now):
        lines.append("🌐 Internet: disponible" if network.online else "🌐 Internet: sin conexión")
    elif network:
        state = "disponible" if network.online else "sin conexión"
        lines.append(f"🌐 Internet: no disponible (última lectura: {state}, {local_time(network.checked_at)})")
    else:
        lines.append("🌐 Internet: no disponible")
    return "\n".join(lines)
