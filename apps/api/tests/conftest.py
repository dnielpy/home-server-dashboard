import json
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients.upstream import Upstream, Upstreams, get_upstreams
from app.main import app

Routes = dict[str, Any]


def _client(source: str, routes: Routes, calls: list[httpx.Request]) -> Upstream:
    """An upstream that answers each path from `routes`: a JSON body, an (status, body) tuple, or an exception."""

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        answer = routes.get(request.url.path)
        if answer is None:
            return httpx.Response(404, json={"detail": "Not Found"})
        if isinstance(answer, Exception):
            raise answer
        if isinstance(answer, tuple):
            # Serialized by hand so a None body is sent as `null`, as the apps do, instead of no body
            return httpx.Response(
                answer[0], content=json.dumps(answer[1]), headers={"Content-Type": "application/json"}
            )
        return httpx.Response(200, json=answer)

    return Upstream(source, httpx.AsyncClient(base_url=f"http://{source}", transport=httpx.MockTransport(handle)))


@pytest.fixture
def upstreams() -> Iterator[Callable[..., list[httpx.Request]]]:
    """Points the API at fake upstream apps; returns the requests they received."""

    def use(bluetti: Routes | None = None, homenet: Routes | None = None, localtube: Routes | None = None):
        calls: list[httpx.Request] = []
        fake = Upstreams(
            bluetti=_client("bluetti", bluetti or {}, calls),
            homenet=_client("homenet", homenet or {}, calls),
            localtube=_client("localtube", localtube or {}, calls),
        )
        app.dependency_overrides[get_upstreams] = lambda: fake
        return calls

    yield use
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
