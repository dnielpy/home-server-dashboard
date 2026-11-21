from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends, Request

from app.config import Settings


class UpstreamError(Exception):
    """An app the dashboard reads from could not be reached or answered with an error."""

    def __init__(self, source: str, detail: str, status: int | None = None, reason: str | None = None) -> None:
        super().__init__(detail)
        self.source = source
        self.detail = detail
        # The status and detail the app answered with, when it did answer
        self.status = status
        self.reason = reason


@dataclass
class Upstream:
    source: str
    http: httpx.AsyncClient

    # Positional-only, so a query parameter can be called path too
    async def get(self, path: str, /, **params: Any) -> Any:
        return await self._request("GET", path, params)

    async def post(self, path: str, /, timeout: float | None = None, **params: Any) -> Any:
        return await self._request("POST", path, params, timeout)

    async def _request(self, method: str, path: str, params: dict[str, Any], timeout: float | None = None) -> Any:
        try:
            response = await self.http.request(
                method,
                path,
                params={k: v for k, v in params.items() if v is not None},
                # Unless the call says otherwise, the client's own
                **({"timeout": timeout} if timeout is not None else {}),
            )
        except httpx.HTTPError as err:
            raise UpstreamError(self.source, f"Could not reach {self.source}: {err!r}") from err
        if not response.is_success:
            reason = _detail(response)
            raise UpstreamError(
                self.source, f"{self.source} answered {response.status_code}: {reason}", response.status_code, reason
            )
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
    agent: Upstream

    @classmethod
    def from_settings(cls, settings: Settings) -> "Upstreams":
        def client(base_url: str, **headers: str) -> httpx.AsyncClient:
            return httpx.AsyncClient(base_url=base_url, timeout=settings.upstream_timeout_seconds, headers=headers)

        token = {"X-Service-Token": settings.localtube_service_token} if settings.localtube_service_token else {}
        return cls(
            bluetti=Upstream("bluetti", client(settings.bluetti_api_url)),
            homenet=Upstream("homenet", client(settings.homenet_api_url)),
            localtube=Upstream("localtube", client(settings.localtube_api_url, **token)),
            agent=Upstream("agent", client(settings.agent_url)),
        )

    async def aclose(self) -> None:
        for upstream in (self.bluetti, self.homenet, self.localtube, self.agent):
            await upstream.http.aclose()


def get_upstreams(request: Request) -> Upstreams:
    return request.app.state.upstreams


UpstreamsDep = Annotated[Upstreams, Depends(get_upstreams)]
