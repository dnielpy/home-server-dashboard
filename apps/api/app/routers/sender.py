import unicodedata
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Path, Query, Request, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.schemas import (
    SenderDraftOut,
    SenderFileOut,
    SenderPackageOut,
    SenderPinIn,
    SenderSealIn,
    SenderUnlockOut,
)
from app.sender import (
    CHUNK_BYTES,
    FileNotFound,
    InvalidToken,
    NoSpace,
    Package,
    PackageEmpty,
    PackageLocked,
    PackageNotFound,
    PackageSealed,
    SenderDep,
    StoredFile,
    WrongPin,
    download_name,
)

router = APIRouter(prefix="/sender", tags=["sender"])

PackageId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
FileId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]

NOT_FOUND = {404: {"description": "There is no package (or file) with that id"}}
DRAFT_ONLY = {409: {"description": "The package already has its name and PIN"}}
TOKEN = {403: {"description": "The token is wrong or expired; unlock the package again"}}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "There is no such package or file")


def _sealed() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "The package already has its name and PIN")


def _bad_token() -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, "The token is wrong or expired")


def _file_out(stored: StoredFile) -> SenderFileOut:
    return SenderFileOut(id=stored.id, name=stored.name, size=stored.size, downloaded=stored.downloaded)


def _package_out(package: Package) -> SenderPackageOut:
    pending = package.pending
    return SenderPackageOut(
        id=package.id,
        name=package.name or "",
        created_at=package.created,
        file_count=len(pending),
        total_bytes=sum(f.size for f in pending),
    )


def _content_disposition(name: str) -> str:
    # The plain name is for old browsers; the others take the UTF-8 one
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().replace('"', "'") or "file"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"


@router.get(
    "/packages",
    response_model=list[SenderPackageOut],
    description="The packages waiting to be opened, the newest first.",
)
async def packages(sender: SenderDep) -> list[SenderPackageOut]:
    return [_package_out(p) for p in await run_in_threadpool(sender.sealed_packages)]


@router.post(
    "/packages",
    status_code=status.HTTP_201_CREATED,
    response_model=SenderDraftOut,
    description=(
        "Starts a package to upload files to. It is not listed until /seal gives it a name and a PIN, and is "
        "deleted after a day without one."
    ),
)
async def create(sender: SenderDep) -> SenderDraftOut:
    package = await run_in_threadpool(sender.create)
    return SenderDraftOut(id=package.id, files=[])


@router.post(
    "/packages/{package_id}/files",
    status_code=status.HTTP_201_CREATED,
    response_model=SenderFileOut,
    responses={**NOT_FOUND, **DRAFT_ONLY, 507: {"description": "There is no room for the file on the disk"}},
    description=(
        "Uploads a file to a package that has no PIN yet; the request body is the file as it is. A name with "
        "slashes keeps the folders the file came in."
    ),
)
async def upload(
    package_id: PackageId,
    request: Request,
    sender: SenderDep,
    name: Annotated[str, Query(min_length=1, max_length=1000)],
    size: Annotated[int | None, Query(ge=0, description="The file's size, when the body is sent chunked")] = None,
) -> SenderFileOut:
    length = request.headers.get("content-length")
    if size is None and length and length.isdigit():
        size = int(length)
    try:
        sender.check_space(size)
        file_id, path = await run_in_threadpool(sender.start_file, package_id)
    except NoSpace:
        raise HTTPException(status.HTTP_507_INSUFFICIENT_STORAGE, "There is no room for the file on the disk")
    except PackageNotFound:
        raise _not_found()
    except PackageSealed:
        raise _sealed()

    try:
        f = await run_in_threadpool(path.open, "wb")
        try:
            buffer = bytearray()
            async for chunk in request.stream():
                buffer += chunk
                if len(buffer) >= CHUNK_BYTES:
                    await run_in_threadpool(f.write, bytes(buffer))
                    buffer.clear()
            if buffer:
                await run_in_threadpool(f.write, bytes(buffer))
        finally:
            await run_in_threadpool(f.close)
    except (ClientDisconnect, OSError):
        path.unlink(missing_ok=True)
        raise

    try:
        stored = await run_in_threadpool(sender.add_file, package_id, file_id, name)
    except PackageNotFound:
        path.unlink(missing_ok=True)
        raise _not_found()
    except PackageSealed:
        raise _sealed()
    return _file_out(stored)


@router.delete(
    "/packages/{package_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **DRAFT_ONLY},
    description="Takes a file out of a package that has no PIN yet.",
)
async def remove_file(package_id: PackageId, file_id: FileId, sender: SenderDep) -> None:
    try:
        await run_in_threadpool(sender.remove_file, package_id, file_id)
    except (PackageNotFound, FileNotFound):
        raise _not_found()
    except PackageSealed:
        raise _sealed()


@router.post(
    "/packages/{package_id}/seal",
    response_model=SenderPackageOut,
    responses={**NOT_FOUND, **DRAFT_ONLY, 422: {"description": "The package has no files, or the name or PIN is wrong"}},
    description="Gives the package its name and its 4 digit PIN, which lists it for the other devices.",
)
async def seal(package_id: PackageId, body: SenderSealIn, sender: SenderDep) -> SenderPackageOut:
    try:
        package = await run_in_threadpool(sender.seal, package_id, body.name, body.pin)
    except PackageNotFound:
        raise _not_found()
    except PackageSealed:
        raise _sealed()
    except PackageEmpty:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The package has no files")
    return _package_out(package)


@router.post(
    "/packages/{package_id}/unlock",
    response_model=SenderUnlockOut,
    responses={
        **NOT_FOUND,
        401: {"description": "Wrong PIN"},
        429: {"description": "Too many wrong PINs; the package is locked for a few minutes"},
    },
    description="Checks the PIN and answers with the package's files and a token to download them.",
)
async def unlock(package_id: PackageId, body: SenderPinIn, sender: SenderDep) -> SenderUnlockOut:
    try:
        package, token = await run_in_threadpool(sender.unlock, package_id, body.pin)
    except PackageNotFound:
        raise _not_found()
    except WrongPin as err:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Wrong PIN, {err.attempts_left} {'try' if err.attempts_left == 1 else 'tries'} left",
        )
    except PackageLocked as err:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many wrong PINs, try again in {max(1, round(err.seconds / 60))} min",
            headers={"Retry-After": str(err.seconds)},
        )
    return SenderUnlockOut(package=_package_out(package), files=[_file_out(f) for f in package.files], token=token)


@router.get(
    "/packages/{package_id}/files",
    response_model=list[SenderFileOut],
    responses={**NOT_FOUND, **TOKEN},
    description="The files of an unlocked package and which have been downloaded; 404 once all of them were.",
)
async def files(package_id: PackageId, sender: SenderDep, token: Annotated[str, Query()]) -> list[SenderFileOut]:
    try:
        package = await run_in_threadpool(sender.unlocked, package_id, token)
    except InvalidToken:
        raise _bad_token()
    except PackageNotFound:
        raise _not_found()
    return [_file_out(f) for f in package.files]


@router.get(
    "/packages/{package_id}/files/{file_id}",
    responses={**NOT_FOUND, **TOKEN, 200: {"content": {"application/octet-stream": {}}}},
    response_class=StreamingResponse,
    description=(
        "Downloads a file of an unlocked package. Once it has gone out whole it is deleted from the server, and the "
        "package with it when it was its last file."
    ),
)
async def download(
    package_id: PackageId, file_id: FileId, sender: SenderDep, token: Annotated[str, Query()]
) -> StreamingResponse:
    try:
        stored, path = await run_in_threadpool(sender.open_file, package_id, file_id, token)
    except InvalidToken:
        raise _bad_token()
    except (PackageNotFound, FileNotFound):
        raise _not_found()
    return StreamingResponse(
        sender.read_file(package_id, file_id, path),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": _content_disposition(download_name(stored.name)),
            "Content-Length": str(stored.size),
            "Cache-Control": "no-store",
        },
    )


@router.delete(
    "/packages/{package_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **TOKEN},
    description=(
        "Deletes a package with every file it has left: an unlocked one with its token, or one still being uploaded "
        "without it."
    ),
)
async def delete(
    package_id: PackageId, sender: SenderDep, token: Annotated[str | None, Query()] = None
) -> None:
    try:
        if token is None:
            await run_in_threadpool(sender.discard_draft, package_id)
        else:
            await run_in_threadpool(sender.delete, package_id, token)
    except PackageNotFound:
        raise _not_found()
    except PackageSealed:
        raise _bad_token()
    except InvalidToken:
        raise _bad_token()
