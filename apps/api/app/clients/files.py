from typing import Any

import httpx
from fastapi import HTTPException

from app.clients.upstream import Upstream, UpstreamError
from app.schemas import FilePathOut, FileTransferOut, FolderOut

# The agent's answers for a bad name, something that cannot be touched, a missing path, a name taken and a disk
# that is not plugged in
PASSED_THROUGH = {400, 403, 404, 409, 503}
# Deleting a big folder takes a while
DELETE_TIMEOUT_SECONDS = 300
# Between two chunks of a download; zipping a folder of small files can pause a bit
DOWNLOAD_TIMEOUT = httpx.Timeout(10, read=120)


async def _call(upstream: Upstream, method: str, endpoint: str, /, timeout: float | None = None, **params: Any) -> Any:
    try:
        if method == "GET":
            return await upstream.get(endpoint, **params)
        return await upstream.post(endpoint, timeout=timeout, **params)
    except UpstreamError as err:
        if err.status in PASSED_THROUGH:
            raise HTTPException(status_code=err.status, detail=err.reason) from err
        raise


async def folder(upstream: Upstream, path: str) -> FolderOut:
    return FolderOut.model_validate(await _call(upstream, "GET", "/files", path=path))


async def rename(upstream: Upstream, path: str, name: str) -> FilePathOut:
    return FilePathOut.model_validate(await _call(upstream, "POST", "/files/rename", path=path, name=name))


async def delete(upstream: Upstream, path: str) -> FilePathOut:
    body = await _call(upstream, "POST", "/files/delete", timeout=DELETE_TIMEOUT_SECONDS, path=path)
    return FilePathOut.model_validate(body)


async def mkdir(upstream: Upstream, path: str, name: str) -> FilePathOut:
    return FilePathOut.model_validate(await _call(upstream, "POST", "/files/mkdir", path=path, name=name))


async def move(upstream: Upstream, path: str, to: str) -> FilePathOut:
    return FilePathOut.model_validate(await _call(upstream, "POST", "/files/move", path=path, to=to))


async def copy(upstream: Upstream, path: str, to: str) -> FileTransferOut:
    # Measuring a big folder before starting takes a moment; the copy itself runs in the background
    body = await _call(upstream, "POST", "/files/copy", timeout=DELETE_TIMEOUT_SECONDS, path=path, to=to)
    return FileTransferOut.model_validate(body)


async def transfers(upstream: Upstream) -> list[FileTransferOut]:
    return [FileTransferOut.model_validate(item) for item in await _call(upstream, "GET", "/files/transfers")]


async def cancel_transfer(upstream: Upstream, transfer_id: str) -> FileTransferOut:
    body = await _call(upstream, "POST", f"/files/transfers/{transfer_id}/cancel")
    return FileTransferOut.model_validate(body)


async def open_download(upstream: Upstream, path: str) -> httpx.Response:
    """The agent's answer to a download, still streaming; the caller closes it."""
    request = upstream.http.build_request("GET", "/files/download", params={"path": path}, timeout=DOWNLOAD_TIMEOUT)
    try:
        response = await upstream.http.send(request, stream=True)
    except httpx.HTTPError as err:
        raise UpstreamError(upstream.source, f"Could not reach {upstream.source}: {err!r}") from err
    if response.is_success:
        return response
    await response.aread()
    await response.aclose()
    try:
        detail = str(response.json()["detail"])
    except (ValueError, KeyError, TypeError):
        detail = response.text[:200]
    if response.status_code in PASSED_THROUGH:
        raise HTTPException(status_code=response.status_code, detail=detail)
    raise UpstreamError(upstream.source, f"{upstream.source} answered {response.status_code}: {detail}")
