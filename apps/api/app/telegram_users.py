"""A single, short-lived enrollment window. Capturing an ID never grants access by itself."""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

ENROLLMENT_SECONDS = 5 * 60
UserName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class TelegramCandidate(BaseModel):
    user_id: int = Field(gt=0)
    telegram_name: str | None = None
    username: str | None = None


class TelegramUser(TelegramCandidate):
    name: UserName


class UserIn(BaseModel):
    model_config = {"extra": "forbid"}
    user_id: int = Field(gt=0)
    name: UserName

    @field_validator("name")
    @classmethod
    def single_line_name(cls, value: str) -> str:
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("El nombre debe estar en una sola línea.")
        return value


class EnrollmentOut(BaseModel):
    state: Literal["closed", "waiting", "captured"] = "closed"
    opened_at: datetime | None = None
    expires_at: datetime | None = None
    candidate: TelegramCandidate | None = None
    notice: str | None = None


class EnrollmentError(Exception):
    pass


class EnrollmentWindow:
    def __init__(self) -> None:
        self._view = EnrollmentOut()
        self._deadline: float | None = None
        self._timer: asyncio.Task | None = None
        self._clock = time.monotonic

    def snapshot(self) -> EnrollmentOut:
        if self._deadline is not None and self._clock() >= self._deadline:
            self.close("La ventana de cinco minutos ha caducado.")
        return self._view.model_copy(deep=True)

    def open(self) -> EnrollmentOut:
        current = self.snapshot()
        if current.state == "captured":
            raise EnrollmentError("Completa o cancela el usuario detectado antes de abrir otra ventana.")
        if current.state == "waiting":
            return current  # Repeated clicks never extend an existing window.
        now = datetime.now(UTC)
        self._view = EnrollmentOut(
            state="waiting", opened_at=now, expires_at=now + timedelta(seconds=ENROLLMENT_SECONDS),
        )
        self._deadline = self._clock() + ENROLLMENT_SECONDS
        self._timer = asyncio.create_task(self._expire(), name="telegram-enrollment")
        return self.snapshot()

    async def _expire(self) -> None:
        await asyncio.sleep(ENROLLMENT_SECONDS)
        self.close("La ventana de cinco minutos ha caducado.")

    def close(self, notice: str | None = None) -> EnrollmentOut:
        self._stop_timer()
        self._deadline = None
        self._view = EnrollmentOut(notice=notice)
        return self.snapshot()

    def _stop_timer(self) -> None:
        if self._timer and self._timer is not asyncio.current_task():
            self._timer.cancel()

    def capture(self, candidate: TelegramCandidate, sent_at: object) -> bool:
        current = self.snapshot()
        if current.state != "waiting":
            return False
        # Telegram messages have second-resolution dates. Reject queued /add messages from earlier windows.
        if (
            type(sent_at) is not int
            or sent_at < int(current.opened_at.timestamp())
            or sent_at >= current.expires_at.timestamp()
        ):
            return False
        self._stop_timer()
        self._deadline = None
        self._view = current.model_copy(update={"state": "captured", "candidate": candidate})
        return True

    async def aclose(self) -> None:
        timer = self._timer
        self.close()
        if timer:
            await asyncio.gather(timer, return_exceptions=True)
        self._timer = None
