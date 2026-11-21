from typing import Annotated

from fastapi import APIRouter, Path, Query
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.clients import files
from app.clients.upstream import UpstreamsDep
from app.schemas import FilePathOut, FileTransferOut, FolderOut, UpstreamErrorOut

router = APIRouter(
    prefix="/files",
    tags=["files"],
    responses={
        502: {"model": UpstreamErrorOut, "description": "The agent on the server did not answer"},
        503: {"description": "The external disk is not mounted"},
    },
)

# Relative to the external disk; "" is its top
FilePath = Annotated[str, Query(max_length=4096, description="Relative to the external disk")]
Name = Annotated[str, Query(min_length=1, max_length=255)]
Destination = Annotated[str, Query(max_length=4096, description="The folder it goes into, relative to the disk")]
TransferId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
NOT_FOUND = {404: {"description": "There is no such file or folder"}}
FORBIDDEN = {403: {"description": "It is outside the disk, an app's folder, or the server's user cannot change it"}}
TAKEN = {409: {"description": "There is already something with that name"}}
# The headers of the agent's answer that make the browser save the file
DOWNLOAD_HEADERS = ("Content-Type", "Content-Length", "Content-Disposition", "Cache-Control")


@router.get(
    "",
    response_model=FolderOut,
    responses={**NOT_FOUND, **FORBIDDEN},
    description="What a folder of the external disk has, folders first, and how much room the disk has left.",
)
async def folder(upstreams: UpstreamsDep, path: FilePath = "") -> FolderOut:
    return await files.folder(upstreams.agent, path)


@router.get(
    "/download",
    responses={**NOT_FOUND, **FORBIDDEN, 200: {"content": {"application/octet-stream": {}, "application/zip": {}}}},
    response_class=StreamingResponse,
    description="Downloads a file as it is, or a folder as a zip made while it downloads.",
)
async def download(upstreams: UpstreamsDep, path: FilePath) -> StreamingResponse:
    response = await files.open_download(upstreams.agent, path)
    return StreamingResponse(
        response.aiter_raw(),
        headers={name: response.headers[name] for name in DOWNLOAD_HEADERS if name in response.headers},
        background=BackgroundTask(response.aclose),
    )


@router.post(
    "/rename",
    response_model=FilePathOut,
    responses={**NOT_FOUND, **FORBIDDEN, **TAKEN, 400: {"description": "The new name is not valid"}},
    description="Renames a file or folder in the folder it is in.",
)
async def rename(upstreams: UpstreamsDep, path: FilePath, name: Name) -> FilePathOut:
    return await files.rename(upstreams.agent, path, name)


@router.post(
    "/delete",
    response_model=FilePathOut,
    responses={**NOT_FOUND, **FORBIDDEN},
    description="Deletes a file, or a folder with everything in it. It cannot be undone.",
)
async def delete(upstreams: UpstreamsDep, path: FilePath) -> FilePathOut:
    return await files.delete(upstreams.agent, path)


@router.post(
    "/mkdir",
    response_model=FilePathOut,
    responses={**NOT_FOUND, **FORBIDDEN, **TAKEN, 400: {"description": "The name is not valid"}},
    description="Creates a folder inside another one.",
)
async def mkdir(upstreams: UpstreamsDep, name: Name, path: FilePath = "") -> FilePathOut:
    return await files.mkdir(upstreams.agent, path, name)


@router.post(
    "/move",
    response_model=FilePathOut,
    responses={
        **NOT_FOUND,
        **FORBIDDEN,
        409: {"description": "Something with that name is already there, or it is already in that folder"},
        400: {"description": "A folder cannot go into itself"},
    },
    description="Moves a file or folder into another folder of the disk, keeping its name.",
)
async def move(upstreams: UpstreamsDep, path: FilePath, to: Destination) -> FilePathOut:
    return await files.move(upstreams.agent, path, to)


@router.post(
    "/copy",
    response_model=FileTransferOut,
    responses={
        **NOT_FOUND,
        **FORBIDDEN,
        409: {"description": "There is not enough free space, or the same copy is already running"},
        400: {"description": "A folder cannot be copied into itself"},
    },
    description=(
        "Starts copying a file or folder into another folder of the disk, in the background; /transfers follows it. "
        'The copy gets "(copy)" in its name when the folder already has one with that name.'
    ),
)
async def copy(upstreams: UpstreamsDep, path: FilePath, to: Destination) -> FileTransferOut:
    return await files.copy(upstreams.agent, path, to)


@router.get(
    "/transfers",
    response_model=list[FileTransferOut],
    description="The copies running and those that ended in the last 15 minutes, the newest first.",
)
async def transfers(upstreams: UpstreamsDep) -> list[FileTransferOut]:
    return await files.transfers(upstreams.agent)


@router.post(
    "/transfers/{transfer_id}/cancel",
    response_model=FileTransferOut,
    responses={404: {"description": "There is no such copy"}, 409: {"description": "The copy already ended"}},
    description="Stops a copy; what it had copied is deleted.",
)
async def cancel_transfer(upstreams: UpstreamsDep, transfer_id: TransferId) -> FileTransferOut:
    return await files.cancel_transfer(upstreams.agent, transfer_id)
