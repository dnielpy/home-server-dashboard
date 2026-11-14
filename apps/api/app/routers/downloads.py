from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.downloader import (
    MAX_ATTEMPTS,
    AlreadyFinished,
    Download,
    Downloader,
    DownloaderDep,
    DownloadNotFound,
    NotFinished,
)
from app.schemas import DownloadIn, DownloadOut

router = APIRouter(prefix="/downloads", tags=["downloads"])

DownloadId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]

NOT_FOUND = {404: {"description": "There is no download with that id"}}
FINISHED = {409: {"description": "The download already finished"}}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "There is no such download")


def _finished() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "The download already finished")


def _out(downloader: Downloader, download: Download) -> DownloadOut:
    return DownloadOut(
        id=download.id,
        url=download.url,
        name=download.name,
        state=download.state,
        size=download.size,
        received=downloader.received(download),
        speed=downloader.speed(download.id) if download.state == "downloading" else 0,
        error=download.error,
        attempts=download.attempts,
        max_attempts=MAX_ATTEMPTS,
        retry_at=datetime.fromtimestamp(download.retry_at, UTC) if download.retry_at else None,
        created_at=datetime.fromisoformat(download.created_at),
        finished_at=datetime.fromisoformat(download.finished_at) if download.finished_at else None,
    )


@router.get("", response_model=list[DownloadOut], description="Every download, the newest first.")
async def downloads(downloader: DownloaderDep) -> list[DownloadOut]:
    return [_out(downloader, d) for d in await run_in_threadpool(downloader.downloads)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=DownloadOut,
    description=(
        "Has the server download a link. It retries every cut and resumes from the bytes it has, until the file is "
        "whole or it fails ten times in a row without progress."
    ),
)
async def add(body: DownloadIn, downloader: DownloaderDep) -> DownloadOut:
    return _out(downloader, await downloader.add(body.url, body.name))


@router.post(
    "/{download_id}/pause",
    response_model=DownloadOut,
    responses={**NOT_FOUND, **FINISHED},
    description="Stops a download, keeping what it has; /resume goes on from there.",
)
async def pause(download_id: DownloadId, downloader: DownloaderDep) -> DownloadOut:
    try:
        return _out(downloader, await downloader.pause(download_id))
    except DownloadNotFound:
        raise _not_found()
    except AlreadyFinished:
        raise _finished()


@router.post(
    "/{download_id}/resume",
    response_model=DownloadOut,
    responses={**NOT_FOUND, **FINISHED},
    description="Goes on with a paused download, or tries a failed one again from where it stopped.",
)
async def resume(download_id: DownloadId, downloader: DownloaderDep) -> DownloadOut:
    try:
        return _out(downloader, await downloader.resume(download_id))
    except DownloadNotFound:
        raise _not_found()
    except AlreadyFinished:
        raise _finished()


@router.delete(
    "/{download_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    description="Stops a download if it is running and deletes it from the server with its file.",
)
async def delete(download_id: DownloadId, downloader: DownloaderDep) -> None:
    try:
        await downloader.delete(download_id)
    except DownloadNotFound:
        raise _not_found()


@router.get(
    "/{download_id}/file",
    responses={
        **NOT_FOUND,
        409: {"description": "The download has not finished"},
        200: {"content": {"application/octet-stream": {}}},
    },
    response_class=FileResponse,
    description=(
        "The downloaded file, for a device to take it from the server. It answers Range, so a browser can resume it "
        "when the connection is cut."
    ),
)
async def file(download_id: DownloadId, downloader: DownloaderDep) -> FileResponse:
    try:
        download, path = await run_in_threadpool(downloader.file, download_id)
    except DownloadNotFound:
        raise _not_found()
    except NotFinished:
        raise HTTPException(status.HTTP_409_CONFLICT, "The download has not finished")
    return FileResponse(path, filename=download.name, media_type="application/octet-stream")
