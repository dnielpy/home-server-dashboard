import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.clients.upstream import UpstreamError, Upstreams
from app.config import get_settings
from app.downloader import Downloader
from app.pet import PetStore
from app.pet_generator import run_pet_generator
from app.routers import astro, dashboard, downloads, health, management, pet, sender
from app.sender import SenderStore, remove_old_drafts
from app.status import StatusTracker, watch


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.upstreams = Upstreams.from_settings(settings)
    app.state.status = StatusTracker()
    app.state.sender = SenderStore(Path(settings.sender_dir))
    app.state.downloader = Downloader(Path(settings.downloads_dir), settings.downloads_parallel)
    app.state.pet = PetStore(Path(settings.pet_db_path))
    await app.state.downloader.start()
    watcher = asyncio.create_task(watch(app.state.upstreams, app.state.status))
    cleaner = asyncio.create_task(remove_old_drafts(app.state.sender))
    generator = (
        asyncio.create_task(run_pet_generator(app.state.pet, settings)) if settings.pet_generate_minutes > 0 else None
    )
    yield
    watcher.cancel()
    cleaner.cancel()
    if generator is not None:
        generator.cancel()
    app.state.pet.close()
    await app.state.downloader.aclose()
    await app.state.upstreams.aclose()


app = FastAPI(title="Home Server Dashboard API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(management.router)
app.include_router(sender.router)
app.include_router(downloads.router)
app.include_router(astro.router)
app.include_router(pet.router)


@app.exception_handler(UpstreamError)
async def upstream_error(request: Request, err: UpstreamError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": err.detail, "source": err.source})
