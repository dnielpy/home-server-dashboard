from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.clients import files
from app.clients.upstream import UpstreamsDep
from app.schemas import FilePathOut, FolderOut, UpstreamErrorOut

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
