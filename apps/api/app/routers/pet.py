from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.pet import Animation, DuplicateTitle, Generation, Message, NotFound, PetDep
from app.pet_generator import GUIDE, GenerationFailed, request_animation
from app.schemas import (
    PetAnimationIn,
    PetAnimationOut,
    PetAnimationPatch,
    PetGenerationOut,
    PetMessageIn,
    PetMessageOut,
    PetMessagePatch,
)

router = APIRouter(prefix="/pet", tags=["pet"])

NOT_FOUND = {404: {"description": "There is no animation or message with that id"}}
DUPLICATE = {409: {"description": "Another animation already has that title"}}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "There is no such animation or message")


def _duplicate() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "Another animation already has that title; pick another one")


def _animation_out(animation: Animation) -> PetAnimationOut:
    return PetAnimationOut.model_validate(animation, from_attributes=True)


def _message_out(message: Message) -> PetMessageOut:
    return PetMessageOut.model_validate(message, from_attributes=True)


def _generation_out(generation: Generation) -> PetGenerationOut:
    return PetGenerationOut.model_validate(generation, from_attributes=True)


# Animations


@router.get(
    "/animations",
    response_model=list[PetAnimationOut],
    description="The animations of the Pet with their code, the newest first; ?enabled=true for the ones /pet plays.",
)
async def animations(pet: PetDep, enabled: bool | None = Query(None)) -> list[PetAnimationOut]:
    return [_animation_out(a) for a in await run_in_threadpool(pet.animations, enabled)]


@router.post(
    "/animations",
    status_code=status.HTTP_201_CREATED,
    response_model=PetAnimationOut,
    responses=DUPLICATE,
    description=(
        "Saves a new animation; /pet plays it from its next round. Astro calls it with source \"ai\" for the "
        "animations it makes. The code is the body of an async JavaScript function (GET /pet/guide)."
    ),
)
async def save_animation(body: PetAnimationIn, pet: PetDep) -> PetAnimationOut:
    try:
        return _animation_out(await run_in_threadpool(pet.add_animation, body.title, body.code, body.source))
    except DuplicateTitle:
        raise _duplicate() from None


@router.patch(
    "/animations/{animation_id}",
    response_model=PetAnimationOut,
    responses={**NOT_FOUND, **DUPLICATE},
    description="Renames an animation, changes its code or turns it on or off. New code or turning it on clears its failures.",
)
async def update_animation(animation_id: int, body: PetAnimationPatch, pet: PetDep) -> PetAnimationOut:
    try:
        return _animation_out(
            await run_in_threadpool(pet.update_animation, animation_id, body.title, body.code, body.enabled)
        )
    except NotFound:
        raise _not_found() from None
    except DuplicateTitle:
        raise _duplicate() from None


@router.delete("/animations/{animation_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
async def delete_animation(animation_id: int, pet: PetDep) -> None:
    try:
        await run_in_threadpool(pet.delete_animation, animation_id)
    except NotFound:
        raise _not_found() from None


@router.post(
    "/animations/{animation_id}/failures",
    response_model=PetAnimationOut,
    responses=NOT_FOUND,
    description="/pet reports that the animation threw; after 3 failures it is turned off.",
)
async def animation_failed(animation_id: int, pet: PetDep) -> PetAnimationOut:
    try:
        return _animation_out(await run_in_threadpool(pet.record_failure, animation_id))
    except NotFound:
        raise _not_found() from None


@router.get(
    "/guide",
    response_class=PlainTextResponse,
    description="How an animation is written, in Markdown: the guide Astro gets with every request.",
)
async def guide() -> str:
    return GUIDE


# Asking Astro for new animations


@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    responses={502: {"description": "Astro could not be reached"}},
    description="Asks Astro for a new animation now instead of waiting for the next round. It saves it on its own.",
)
async def generate(pet: PetDep) -> dict[str, bool]:
    try:
        await request_animation(pet, get_settings())
    except GenerationFailed as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Astro unavailable: {error}") from None
    return {"ok": True}


@router.get(
    "/generations",
    response_model=list[PetGenerationOut],
    description="The last 20 requests to Astro for an animation and how they went, the newest first.",
)
async def generations(pet: PetDep) -> list[PetGenerationOut]:
    return [_generation_out(g) for g in await run_in_threadpool(pet.generations)]


# Messages


@router.get(
    "/messages",
    response_model=list[PetMessageOut],
    description="The messages Astro holds up on a sign, the newest first; ?enabled=true for the ones /pet shows.",
)
async def messages(pet: PetDep, enabled: bool | None = Query(None)) -> list[PetMessageOut]:
    return [_message_out(m) for m in await run_in_threadpool(pet.messages, enabled)]


@router.post(
    "/messages",
    status_code=status.HTTP_201_CREATED,
    response_model=PetMessageOut,
    description="Adds a message for the sign; Astro adds its own with source \"ai\".",
)
async def add_message(body: PetMessageIn, pet: PetDep) -> PetMessageOut:
    return _message_out(await run_in_threadpool(pet.add_message, body.text, body.source))


@router.patch("/messages/{message_id}", response_model=PetMessageOut, responses=NOT_FOUND)
async def update_message(message_id: int, body: PetMessagePatch, pet: PetDep) -> PetMessageOut:
    try:
        return _message_out(await run_in_threadpool(pet.update_message, message_id, body.text, body.enabled))
    except NotFound:
        raise _not_found() from None


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
async def delete_message(message_id: int, pet: PetDep) -> None:
    try:
        await run_in_threadpool(pet.delete_message, message_id)
    except NotFound:
        raise _not_found() from None
