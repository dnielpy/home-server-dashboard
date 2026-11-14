"""Narrow dashboard proxy for the host-side Astro Gateway bridge."""

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from app.config import get_settings

router = APIRouter(prefix="/astro", tags=["astro"])


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH"])
async def forward_astro(path: str, request: Request):
    settings = get_settings()
    if not settings.astro_api_token:
        raise HTTPException(503, "Astro is not configured")
    if any(segment in (".", "..") for segment in path.split("/")):
        raise HTTPException(404, "Not found")
    target = f"/{path}"
    if request.url.query:
        target += f"?{request.url.query}"
    headers = {"X-Astro-Token": settings.astro_api_token}
    if request.headers.get("content-type"):
        headers["Content-Type"] = request.headers["content-type"]
    client = httpx.AsyncClient(base_url=settings.astro_api_url, timeout=None if path.endswith("/events") else 200)
    if path.endswith("/events") and request.method == "GET":
        try:
            upstream = await client.send(client.build_request("GET", target, headers=headers), stream=True)
        except httpx.HTTPError as error:
            await client.aclose()
            raise HTTPException(502, f"Astro unavailable: {error}") from error

        async def chunks():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(chunks(), status_code=upstream.status_code,
                                 media_type=upstream.headers.get("content-type", "text/event-stream"),
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
    try:
        upstream = await client.request(request.method, target, headers=headers, content=await request.body())
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Astro unavailable: {error}") from error
    finally:
        await client.aclose()
    return Response(content=upstream.content, status_code=upstream.status_code,
                    media_type=upstream.headers.get("content-type", "application/json"))
