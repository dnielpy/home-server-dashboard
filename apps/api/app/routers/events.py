"""The dashboard's fixed event controls, forwarded to the host monitor."""

from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings

router = APIRouter(prefix="/events", tags=["events"])
Rule = Literal[
    "download_done", "download_failed", "power_out", "power_restored",
    "battery_full", "container_down", "container_restored",
]
Action = Literal["enable", "disable"]


async def _call(method: str, path: str):
    settings = get_settings()
    if not settings.events_api_token:
        raise HTTPException(503, "Event monitor is not configured")
    try:
        async with httpx.AsyncClient(base_url=settings.events_api_url, timeout=10,
                                     headers={"X-Events-Token": settings.events_api_token}) as client:
            response = await client.request(method, path)
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Event monitor unavailable: {error}") from error
    if not response.is_success:
        raise HTTPException(response.status_code, response.json().get("detail", "Event monitor error"))
    return response.json()


@router.get("")
async def list_events(limit: Annotated[int, Query(ge=1, le=100)] = 30,
                      offset: Annotated[int, Query(ge=0)] = 0):
    return await _call("GET", f"/events?limit={limit}&offset={offset}")


@router.get("/rules")
async def rules():
    return await _call("GET", "/rules")


@router.post("/rules/{rule}/{action}")
async def set_rule(rule: Rule, action: Action):
    return await _call("POST", f"/rules/{rule}/{action}")


@router.post("/test", status_code=202)
async def test_alert():
    return await _call("POST", "/test")
