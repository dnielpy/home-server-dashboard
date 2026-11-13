from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.clients.upstream import UpstreamError, Upstreams
from app.config import get_settings
from app.routers import dashboard, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.upstreams = Upstreams.from_settings(get_settings())
    yield
    await app.state.upstreams.aclose()


app = FastAPI(title="Home Server Dashboard API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(dashboard.router)


@app.exception_handler(UpstreamError)
async def upstream_error(request: Request, err: UpstreamError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": err.detail, "source": err.source})
