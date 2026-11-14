from typing import Any
from urllib.parse import quote

from fastapi import HTTPException

from app.clients.upstream import Upstream, UpstreamError
from app.schemas import (
    AgentInfoOut,
    ContainerAction,
    ContainerLogsOut,
    ProjectDetailOut,
    ProjectOut,
    SystemOut,
    SystemTrafficOut,
    UpdateJobOut,
)

# The agent's answers for a project that does not exist or an update that cannot start or stop now
PASSED_THROUGH = {404, 409}


def _project(name: str) -> str:
    return f"/projects/{quote(name, safe='')}"


async def _call(upstream: Upstream, method: str, path: str, **params: Any) -> Any:
    try:
        return await (upstream.get(path, **params) if method == "GET" else upstream.post(path))
    except UpstreamError as err:
        if err.status in PASSED_THROUGH:
            raise HTTPException(status_code=err.status, detail=err.reason) from err
        raise


async def info(upstream: Upstream) -> AgentInfoOut:
    return AgentInfoOut.model_validate(await _call(upstream, "GET", "/info"))


async def projects(upstream: Upstream) -> list[ProjectOut]:
    return [ProjectOut.model_validate(item) for item in await _call(upstream, "GET", "/projects")]


async def fetch_all(upstream: Upstream) -> None:
    await _call(upstream, "POST", "/projects/fetch")


async def project(upstream: Upstream, name: str) -> ProjectDetailOut:
    return ProjectDetailOut.model_validate(await _call(upstream, "GET", _project(name)))


async def fetch(upstream: Upstream, name: str) -> None:
    await _call(upstream, "POST", f"{_project(name)}/fetch")


async def start_update(upstream: Upstream, name: str) -> UpdateJobOut:
    return UpdateJobOut.model_validate(await _call(upstream, "POST", f"{_project(name)}/update"))


async def update(upstream: Upstream, name: str, offset: int) -> UpdateJobOut:
    return UpdateJobOut.model_validate(await _call(upstream, "GET", f"{_project(name)}/update", offset=offset))


async def cancel_update(upstream: Upstream, name: str) -> UpdateJobOut:
    return UpdateJobOut.model_validate(await _call(upstream, "POST", f"{_project(name)}/update/cancel"))


async def container_action(upstream: Upstream, name: str, action: ContainerAction) -> None:
    await _call(upstream, "POST", f"{_project(name)}/{action}")


async def logs(upstream: Upstream, name: str, container: str | None, tail: int) -> ContainerLogsOut:
    body = await _call(upstream, "GET", f"{_project(name)}/logs", container=container, tail=tail)
    return ContainerLogsOut.model_validate(body)


async def system(upstream: Upstream) -> SystemOut:
    return SystemOut.model_validate(await _call(upstream, "GET", "/system"))


async def system_traffic(upstream: Upstream) -> SystemTrafficOut:
    return SystemTrafficOut.model_validate(await _call(upstream, "GET", "/system/traffic"))
