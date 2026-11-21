"""Private Telegram bot. One polling worker shares the API's lifecycle and upstream clients."""

import asyncio
import json
import os
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx
from fastapi import Depends, Request
from pydantic import BaseModel, Field, ValidationError

from app.clients.upstream import Upstreams
from app.config import Settings
from app.telegram_stats import stats_message
from app.telegram_users import EnrollmentError, EnrollmentOut, EnrollmentWindow, TelegramCandidate, TelegramUser, UserIn

COMMANDS = {"stats": "Estado de corriente, batería, consumo, autonomía e internet de la casa."}
COMMAND_PATTERN = re.compile(r"^/([a-z0-9_]{1,32})(?:@([a-z0-9_]+))?(?=\s|$)", re.IGNORECASE | re.ASCII)


class TelegramState(BaseModel):
    bot_id: int | None = None
    offset: int = Field(default=0, ge=0)
    counted_update_id: int | None = None
    total_requests: int = Field(default=0, ge=0)
    commands: dict[str, bool] = Field(default_factory=lambda: {"stats": True})
    # None identifies the old state format; an empty list deliberately allows nobody.
    users: list[TelegramUser] | None = None


class StateError(Exception):
    pass


class TelegramStore:
    def __init__(self, root: Path) -> None:
        self.path = root / "state.json"
        try:
            root.mkdir(parents=True, exist_ok=True)
            self.state = (
                TelegramState.model_validate_json(self.path.read_text()) if self.path.exists() else TelegramState()
            )
            self.save()
        except (OSError, ValueError) as from_error:
            raise StateError("No se pudo leer o guardar el estado de Telegram; revisa sus permisos e integridad.") from from_error

    def save(self, **changes: Any) -> None:
        updated = self.state.model_copy(update=changes)
        temporary = self.path.with_suffix(".json.tmp")
        try:
            with temporary.open("w") as output:
                json.dump(updated.model_dump(mode="json"), output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        except OSError as err:
            raise StateError("No se pudo guardar el estado de Telegram; revisa el almacenamiento.") from err
        self.state = updated


class BotIdentity(BaseModel):
    id: int
    first_name: str
    username: str


class TelegramCommandOut(BaseModel):
    name: str
    description: str
    enabled: bool


class TelegramStatusOut(BaseModel):
    state: Literal["unconfigured", "connecting", "connected", "reconnecting", "error", "stopped"]
    bot_name: str | None
    bot_username: str | None
    started_at: datetime | None
    uptime_seconds: int
    total_requests: int
    error: str | None
    missing_settings: list[str]
    menu_synced: bool


class TelegramError(Exception):
    def __init__(self, code: int, retry_after: float = 0) -> None:
        self.code = code
        self.retry_after = retry_after
        # Never propagate Telegram bodies or httpx errors: their URLs contain the token.
        messages = {
            401: "Token de Telegram inválido. Revisa TELEGRAM_BOT_TOKEN y reinicia la API.",
            404: "Token de Telegram inválido. Revisa TELEGRAM_BOT_TOKEN y reinicia la API.",
            403: "Telegram rechazó el acceso; comprueba que no hayas bloqueado el bot.",
            409: "Otra instancia o un webhook está usando este bot. Usa un bot dedicado y un solo proceso.",
            429: "Telegram ha limitado las peticiones; reintentando tras la espera indicada.",
        }
        super().__init__(messages.get(code, "No se pudo conectar con Telegram; reintentando automáticamente."))


class TelegramBot:
    def __init__(
        self, settings: Settings, upstreams: Upstreams, *, transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.upstreams = upstreams
        self.transport = transport
        self.store: TelegramStore | None = None
        self.identity: BotIdentity | None = None
        self.started_at: datetime | None = None
        self._started_clock: float | None = None
        self.state = "unconfigured"
        self.error: str | None = None
        self._http: httpx.AsyncClient | None = None
        self._task: asyncio.Task | None = None
        self._wake = asyncio.Event()
        self._synced_menu: tuple[str, ...] | None = None
        self.enrollment = EnrollmentWindow()
        try:
            self.store = TelegramStore(Path(settings.telegram_state_dir))
            if self.store.state.users is None:
                owner = settings.telegram_owner_user_id
                initial = [TelegramUser(user_id=owner, name="Propietario")] if owner else []
                self.store.save(users=initial)
        except StateError as err:
            self.store = None
            self.state, self.error = "error", str(err)

    @property
    def missing_settings(self) -> list[str]:
        missing = []
        if not self.settings.telegram_bot_token:
            missing.append("TELEGRAM_BOT_TOKEN")
        return missing

    def users(self) -> list[TelegramUser]:
        return list(self.store.state.users or []) if self.store else []

    def is_allowed(self, user_id: int) -> bool:
        return any(user.user_id == user_id for user in self.users())

    def open_enrollment(self) -> EnrollmentOut:
        if self.store is None:
            raise StateError(self.error or "Estado de Telegram no disponible.")
        if self.state != "connected":
            raise EnrollmentError("El bot debe estar conectado para agregar un usuario.")
        return self.enrollment.open()

    def add_user(self, body: UserIn) -> TelegramUser:
        if self.store is None:
            raise StateError(self.error or "Estado de Telegram no disponible.")
        candidate = self.enrollment.snapshot().candidate
        if candidate is None or candidate.user_id != body.user_id:
            raise EnrollmentError("No hay un registro pendiente para ese usuario. Abre una nueva ventana.")
        if self.is_allowed(body.user_id):
            raise EnrollmentError("Este usuario ya tiene acceso.")
        user = TelegramUser(**candidate.model_dump(), name=body.name)
        self.store.save(users=[*self.users(), user])
        self.enrollment.close("Usuario agregado.")
        return user

    def delete_user(self, user_id: int) -> None:
        if self.store is None:
            raise StateError(self.error or "Estado de Telegram no disponible.")
        if not self.is_allowed(user_id):
            raise KeyError(user_id)
        self.store.save(users=[user for user in self.users() if user.user_id != user_id])

    def commands(self) -> list[TelegramCommandOut]:
        return [
            TelegramCommandOut(name=name, description=description, enabled=self.enabled(name))
            for name, description in COMMANDS.items()
        ]

    def enabled(self, name: str) -> bool:
        return self.store is not None and self.store.state.commands.get(name, True)

    def status(self) -> TelegramStatusOut:
        return TelegramStatusOut(
            state=self.state,
            bot_name=self.identity.first_name if self.identity else None,
            bot_username=self.identity.username if self.identity else None,
            started_at=self.started_at,
            uptime_seconds=int(time.monotonic() - self._started_clock) if self._started_clock is not None else 0,
            total_requests=self.store.state.total_requests if self.store else 0,
            error=self.error,
            missing_settings=self.missing_settings,
            menu_synced=self._synced_menu == self._desired_menu(),
        )

    def set_command(self, name: str, enabled: bool) -> TelegramCommandOut:
        if name not in COMMANDS:
            raise KeyError(name)
        if self.store is None:
            raise StateError(self.error or "Estado de Telegram no disponible.")
        self.store.save(commands={**self.store.state.commands, name: enabled})
        self._wake.set()
        return next(command for command in self.commands() if command.name == name)

    async def start(self) -> None:
        if self._task is not None or self.missing_settings or self.store is None:
            return
        token = self.settings.telegram_bot_token.get_secret_value()
        self._http = httpx.AsyncClient(
            base_url=f"https://api.telegram.org/bot{token}/",
            timeout=httpx.Timeout(35, connect=8), transport=self.transport,
        )
        self.started_at = datetime.now(UTC)
        self._started_clock = time.monotonic()
        self.state = "connecting"
        self._task = asyncio.create_task(self._run(), name="telegram-bot")

    async def aclose(self) -> None:
        await self.enrollment.aclose()
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
            self.state = "stopped"
        if self._http:
            await self._http.aclose()

    async def _call(self, method: str, **body: Any) -> Any:
        try:
            response = await self._http.post(method, json=body)
            data = response.json()
            if not response.is_success or not isinstance(data, dict) or data.get("ok") is not True:
                code = data.get("error_code", response.status_code) if isinstance(data, dict) else response.status_code
                parameters = data.get("parameters") if isinstance(data, dict) else None
                delay = parameters.get("retry_after", 0) if isinstance(parameters, dict) else 0
                raise TelegramError(int(code), max(0, float(delay)))
            return data.get("result")
        except (httpx.HTTPError, ValueError, TypeError):
            raise TelegramError(0) from None

    def _desired_menu(self) -> tuple[str, ...]:
        return tuple(name for name in COMMANDS if self.enabled(name))

    async def _sync_menu(self) -> None:
        desired = self._desired_menu()
        if self._synced_menu == desired:
            return
        await self._call(
            "setMyCommands", commands=[{"command": name, "description": COMMANDS[name]} for name in desired],
            scope={"type": "default"},
        )
        self._synced_menu = desired

    async def _poll(self) -> list[dict[str, Any]]:
        # A dashboard toggle interrupts the long poll so the Telegram menu updates promptly.
        poll = asyncio.create_task(self._call(
            "getUpdates", offset=self.store.state.offset, timeout=25, allowed_updates=["message"],
        ))
        wake = asyncio.create_task(self._wake.wait())
        try:
            done, _ = await asyncio.wait((poll, wake), return_when=asyncio.FIRST_COMPLETED)
            return poll.result() if poll in done else []
        finally:
            for task in (poll, wake):
                task.cancel()
            await asyncio.gather(poll, wake, return_exceptions=True)

    async def _run(self) -> None:
        failures = 0
        while True:
            try:
                if self.identity is None:
                    self.identity = BotIdentity.model_validate(await self._call("getMe"))
                if self.store.state.bot_id != self.identity.id:
                    self.store.save(bot_id=self.identity.id, offset=0, counted_update_id=None)
                self._wake.clear()
                await self._sync_menu()
                self.state, self.error = "connected", None
                updates = await self._poll()
                if not isinstance(updates, list):
                    raise TelegramError(0)
                self.state, self.error = "connected", None
                for update in updates:
                    await self._process(update)
                failures = 0
            except TelegramError as err:
                self.error = str(err)
                self.state = "error" if err.code in (401, 404, 409) else "reconnecting"
                failures += 1
                await asyncio.sleep(max(err.retry_after, min(60, 2 ** min(failures, 6))))
            except (StateError, ValidationError) as err:
                self.state = "error"
                self.error = str(err) if isinstance(err, StateError) else "Telegram devolvió datos inesperados; reintentando."
                await asyncio.sleep(30)

    async def _process(self, update: dict[str, Any]) -> None:
        if not isinstance(update, dict) or not isinstance(update.get("update_id"), int):
            return
        update_id = update["update_id"]
        if update_id < self.store.state.offset:
            return
        message = update.get("message") or {}
        if not isinstance(message, dict):
            self.store.save(offset=update_id + 1)
            return
        sender, chat = message.get("from") or {}, message.get("chat") or {}
        private = (
            isinstance(sender, dict) and isinstance(chat, dict)
            and type(sender.get("id")) is int and sender["id"] > 0
            and sender.get("is_bot") is not True
            and chat.get("type") == "private" and chat.get("id") == sender["id"]
        )
        user_id = sender["id"] if private else None
        authorized = private and self.is_allowed(user_id)
        text = message.get("text")
        match = COMMAND_PATTERN.match(text) if private and isinstance(text, str) else None
        if match and match[2] and match[2].lower() != self.identity.username.lower():
            match = None
        if match and authorized:
            # Persist the count before sending. A failed send can be retried without counting it twice.
            if self.store.state.counted_update_id != update_id:
                self.store.save(total_requests=self.store.state.total_requests + 1, counted_update_id=update_id)
        if match and match[1].lower() == "add":
            candidate = TelegramCandidate(
                user_id=user_id, username=sender.get("username"),
                telegram_name=" ".join(filter(None, [sender.get("first_name"), sender.get("last_name")])) or None,
            )
            if self.enrollment.capture(candidate, message.get("date")):
                if authorized:
                    self.enrollment.close("El usuario detectado ya tiene acceso. La ventana se ha cerrado.")
                    reply = "Ya tienes acceso al bot. La ventana de registro se ha cerrado."
                else:
                    reply = "Usuario detectado. Ponle un nombre y guarda el registro en el dashboard para habilitar el acceso."
                # The candidate is already captured, so retries must not consume a different window.
                self.store.save(offset=update_id + 1)
                await self._call("sendMessage", chat_id=user_id, text=reply)
                return
        if match and authorized:
            name = match[1].lower()
            reply = (
                await stats_message(self.upstreams)
                if name == "stats" and self.enabled(name) else "Comando no disponible."
            )
            # A toggle may have changed while the sources were being read.
            if name in COMMANDS and not self.enabled(name):
                reply = "Comando no disponible."
            if not self.is_allowed(user_id):
                self.store.save(offset=update_id + 1)
                return
            try:
                await self._call("sendMessage", chat_id=user_id, text=reply)
            except TelegramError as err:
                if err.code != 403:
                    raise
                # A blocked bot cannot deliver this reply. Advance so it cannot stall the queue forever.
                self.error = str(err)
        self.store.save(offset=update_id + 1)


def get_telegram(request: Request) -> TelegramBot:
    return request.app.state.telegram


TelegramDep = Annotated[TelegramBot, Depends(get_telegram)]
