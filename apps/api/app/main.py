import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.clients.upstream import UpstreamError, Upstreams
from app.config import get_settings
from app.downloader import Downloader
from app.routers import astro, dashboard, downloads, files, health, management, sender, telegram
from app.sender import SenderStore, remove_old_drafts
from app.status import StatusTracker, watch
from app.telegram import TelegramBot


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.upstreams = Upstreams.from_settings(get_settings())
    app.state.status = StatusTracker()
    app.state.sender = SenderStore(Path(get_settings().sender_dir))
    app.state.downloader = Downloader(Path(get_settings().downloads_dir), get_settings().downloads_parallel)
    await app.state.downloader.start()
    watcher = asyncio.create_task(watch(app.state.upstreams, app.state.status))
    cleaner = asyncio.create_task(remove_old_drafts(app.state.sender))
    app.state.telegram = TelegramBot(get_settings(), app.state.upstreams)
    await app.state.telegram.start()
    try:
        yield
    finally:
        await app.state.telegram.aclose()
        watcher.cancel()
        cleaner.cancel()
        await asyncio.gather(watcher, cleaner, return_exceptions=True)
        await app.state.downloader.aclose()
        await app.state.upstreams.aclose()


app = FastAPI(title="Home Server Dashboard API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(management.router)
app.include_router(sender.router)
app.include_router(downloads.router)
app.include_router(astro.router)
app.include_router(files.router)
app.include_router(telegram.router)


@app.exception_handler(UpstreamError)
async def upstream_error(request: Request, err: UpstreamError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": err.detail, "source": err.source})
