from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends, Request

from app.config import Settings


class UpstreamError(Exception):
    """An app the dashboard reads from could not be reached or answered with an error."""

    def __init__(self, source: str, detail: str) -> None:
        super().__init__(detail)
        self.source = source
        self.detail = detail


@dataclass
class Upstream:
    source: str
    http: httpx.AsyncClient

    async def get(self, path: str, **params: Any) -> Any:
        try:
            response = await self.http.get(path, params={k: v for k, v in params.items() if v is not None})
        except httpx.HTTPError as err:
            raise UpstreamError(self.source, f"Could not reach {self.source}: {err!r}") from err
        if not response.is_success:
            raise UpstreamError(self.source, f"{self.source} answered {response.status_code}: {_detail(response)}")
        try:
            return response.json()
        except ValueError as err:
            # Something else is listening on that port
            raise UpstreamError(self.source, f"{self.source} did not answer with JSON") from err


def _detail(response: httpx.Response) -> str:
    try:
        return str(response.json()["detail"])
    except (ValueError, KeyError, TypeError):
        return response.text[:200]


@dataclass
class Upstreams:
    bluetti: Upstream
    homenet: Upstream
    localtube: Upstream

    @classmethod
    def from_settings(cls, settings: Settings) -> "Upstreams":
        def client(base_url: str, **headers: str) -> httpx.AsyncClient:
            return httpx.AsyncClient(base_url=base_url, timeout=settings.upstream_timeout_seconds, headers=headers)

        token = {"X-Service-Token": settings.localtube_service_token} if settings.localtube_service_token else {}
        return cls(
            bluetti=Upstream("bluetti", client(settings.bluetti_api_url)),
            homenet=Upstream("homenet", client(settings.homenet_api_url)),
            localtube=Upstream("localtube", client(settings.localtube_api_url, **token)),
        )

    async def aclose(self) -> None:
        for upstream in (self.bluetti, self.homenet, self.localtube):
            await upstream.http.aclose()


def get_upstreams(request: Request) -> Upstreams:
    return request.app.state.upstreams


UpstreamsDep = Annotated[Upstreams, Depends(get_upstreams)]
