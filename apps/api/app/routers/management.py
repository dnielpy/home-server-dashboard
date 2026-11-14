from typing import Annotated

from fastapi import APIRouter, Query, status

from app.clients import agent
from app.clients.upstream import UpstreamsDep
from app.schemas import (
    AgentInfoOut,
    ContainerAction,
    ContainerLogsOut,
    ProjectDetailOut,
    ProjectOut,
    UpdateJobOut,
    UpstreamErrorOut,
)

router = APIRouter(
    prefix="/management",
    tags=["management"],
    responses={502: {"model": UpstreamErrorOut, "description": "The agent on the server did not answer"}},
)

NOT_FOUND = {404: {"description": "There is no project with that name"}}


@router.get("/info", response_model=AgentInfoOut, description="The user, host and folder the agent manages.")
async def info(upstreams: UpstreamsDep) -> AgentInfoOut:
    return await agent.info(upstreams.agent)


@router.get(
    "/projects",
    response_model=list[ProjectOut],
    description=(
        "Every folder with a git repo next to the dashboard: its branch, how many commits behind GitHub it is as of "
        "the last fetch, and whether its containers are running and since when."
    ),
)
async def projects(upstreams: UpstreamsDep) -> list[ProjectOut]:
    return await agent.projects(upstreams.agent)


@router.post(
    "/projects/fetch",
    status_code=status.HTTP_202_ACCEPTED,
    description="Starts a git fetch of every project; `fetch` is pending in /projects until it ends.",
)
async def fetch_all(upstreams: UpstreamsDep) -> None:
    await agent.fetch_all(upstreams.agent)


@router.get(
    "/projects/{name}",
    response_model=ProjectDetailOut,
    responses=NOT_FOUND,
    description="A project with its last commit on the server and on GitHub, and the commits it is missing.",
)
async def project(name: str, upstreams: UpstreamsDep) -> ProjectDetailOut:
    return await agent.project(upstreams.agent, name)


@router.post(
    "/projects/{name}/fetch",
    status_code=status.HTTP_202_ACCEPTED,
    responses=NOT_FOUND,
    description="Starts a git fetch of the project.",
)
async def fetch(name: str, upstreams: UpstreamsDep) -> None:
    await agent.fetch(upstreams.agent, name)


@router.post(
    "/projects/{name}/update",
    response_model=UpdateJobOut,
    responses={**NOT_FOUND, 409: {"description": "It is already updating, or has no scripts/update.sh"}},
    description=(
        "Runs the project's scripts/update.sh on the server: stops its containers, pulls from GitHub and builds and "
        "starts them again. Deploys it for the first time when it has no containers."
    ),
)
async def start_update(name: str, upstreams: UpstreamsDep) -> UpdateJobOut:
    return await agent.start_update(upstreams.agent, name)


@router.get(
    "/projects/{name}/update",
    response_model=UpdateJobOut,
    responses={404: {"description": "No such project, or it was never updated from the dashboard"}},
    description="The project's last update: its steps, whether it ended and how, and its output from line `offset`.",
)
async def update(name: str, upstreams: UpstreamsDep, offset: Annotated[int, Query(ge=0)] = 0) -> UpdateJobOut:
    return await agent.update(upstreams.agent, name, offset)


@router.post(
    "/projects/{name}/update/cancel",
    response_model=UpdateJobOut,
    responses={**NOT_FOUND, 409: {"description": "It is not updating"}},
    description="Stops the running update. The containers can be left stopped.",
)
async def cancel_update(name: str, upstreams: UpstreamsDep) -> UpdateJobOut:
    return await agent.cancel_update(upstreams.agent, name)


@router.post(
    "/projects/{name}/{action}",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        **NOT_FOUND,
        409: {"description": "It has no containers, is updating or already doing one, or is the dashboard to stop"},
    },
    description=(
        "Stops, starts or restarts the project's containers in the background; `action` is pending in /projects "
        "until it ends."
    ),
)
async def container_action(name: str, action: ContainerAction, upstreams: UpstreamsDep) -> None:
    await agent.container_action(upstreams.agent, name, action)


@router.get(
    "/projects/{name}/logs",
    response_model=ContainerLogsOut,
    responses={404: {"description": "No such project, or it has no container with that name"}},
    description="The last `tail` lines of one of the project's containers, by its compose service; the first by default.",
)
async def logs(
    name: str,
    upstreams: UpstreamsDep,
    container: str | None = None,
    tail: Annotated[int, Query(ge=1, le=2000)] = 300,
) -> ContainerLogsOut:
    return await agent.logs(upstreams.agent, name, container, tail)
