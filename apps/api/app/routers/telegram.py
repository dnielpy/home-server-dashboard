from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool

from app.telegram import StateError, TelegramCommandOut, TelegramDep, TelegramStatusOut
from app.telegram_users import EnrollmentError, EnrollmentOut, TelegramUser, UserIn

router = APIRouter(prefix="/telegram", tags=["telegram"])


class CommandIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: StrictBool


@router.get("/status", response_model=TelegramStatusOut)
async def status(bot: TelegramDep) -> TelegramStatusOut:
    return bot.status()


@router.get("/commands", response_model=list[TelegramCommandOut])
async def commands(bot: TelegramDep) -> list[TelegramCommandOut]:
    return bot.commands()


@router.patch("/commands/{name}", response_model=TelegramCommandOut)
async def set_command(name: str, body: CommandIn, bot: TelegramDep) -> TelegramCommandOut:
    try:
        return bot.set_command(name, body.enabled)
    except KeyError:
        raise HTTPException(404, "Comando no encontrado.")
    except StateError as err:
        raise HTTPException(503, str(err))


@router.get("/users", response_model=list[TelegramUser])
async def users(bot: TelegramDep) -> list[TelegramUser]:
    return bot.users()


@router.get("/enrollment", response_model=EnrollmentOut)
async def enrollment(bot: TelegramDep) -> EnrollmentOut:
    return bot.enrollment.snapshot()


@router.post("/enrollment", response_model=EnrollmentOut)
async def open_enrollment(bot: TelegramDep) -> EnrollmentOut:
    try:
        return bot.open_enrollment()
    except EnrollmentError as err:
        raise HTTPException(409, str(err))
    except StateError as err:
        raise HTTPException(503, str(err))


@router.delete("/enrollment", response_model=EnrollmentOut)
async def cancel_enrollment(bot: TelegramDep) -> EnrollmentOut:
    return bot.enrollment.close("Registro cancelado.")


@router.post("/users", response_model=TelegramUser, status_code=201)
async def add_user(body: UserIn, bot: TelegramDep) -> TelegramUser:
    try:
        return bot.add_user(body)
    except EnrollmentError as err:
        raise HTTPException(409, str(err))
    except StateError as err:
        raise HTTPException(503, str(err))


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, bot: TelegramDep) -> None:
    try:
        bot.delete_user(user_id)
    except KeyError:
        raise HTTPException(404, "Usuario no encontrado.")
    except StateError as err:
        raise HTTPException(503, str(err))
