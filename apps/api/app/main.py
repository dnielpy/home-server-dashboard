import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.clients.upstream import UpstreamError, Upstreams
from app.config import get_settings
from app.downloader import Downloader
from app.routers import dashboard, downloads, health, management, sender
from app.sender import SenderStore, remove_old_drafts
from app.status import StatusTracker, watch


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.upstreams = Upstreams.from_settings(get_settings())
    app.state.status = StatusTracker()
    app.state.sender = SenderStore(Path(get_settings().sender_dir))
    app.state.downloader = Downloader(Path(get_settings().downloads_dir), get_settings().downloads_parallel)
    await app.state.downloader.start()
    watcher = asyncio.create_task(watch(app.state.upstreams, app.state.status))
    cleaner = asyncio.create_task(remove_old_drafts(app.state.sender))
    yield
    watcher.cancel()
    cleaner.cancel()
    await app.state.downloader.aclose()
    await app.state.upstreams.aclose()


app = FastAPI(title="Home Server Dashboard API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(management.router)
app.include_router(sender.router)
app.include_router(downloads.router)


@app.exception_handler(UpstreamError)
async def upstream_error(request: Request, err: UpstreamError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": err.detail, "source": err.source})
