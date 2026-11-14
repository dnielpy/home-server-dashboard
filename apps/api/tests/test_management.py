import httpx

SERVICE = {"deployed": True, "up": True, "since": "2026-11-13T10:00:00Z", "detail": None, "containers": []}
PROJECT = {
    "name": "local-tube",
    "path": "/home/lianny/home-server/local-tube",
    "branch": "main",
    "fetch": "ok",
    "fetch_error": None,
    "behind": 2,
    "local_epoch": 1763020000,
    "remote_epoch": 1763030000,
    "service": SERVICE,
    "updating": False,
}
DETAIL = {
    **PROJECT,
    "has_upstream": True,
    "head": {"hash": "abc1234", "epoch": 1763020000, "subject": "feat: old"},
    "remote": {"hash": "def5678", "epoch": 1763030000, "subject": "fix: new"},
    "ahead": 0,
    "commits": [{"hash": "def5678", "epoch": 1763030000, "author": "dnielpy", "subject": "fix: new"}],
    "dirty": False,
}
JOB = {
    "project": "local-tube",
    "running": True,
    "code": None,
    "cancelled": False,
    "first_deploy": False,
    "started_at": 1763040000.5,
    "finished_at": None,
    "hash": None,
    "steps": [{"label": "Stopping containers", "started_at": 1763040000.6, "finished_at": None}],
    "expected_steps": ["Stopping containers", "Pulling latest code", "Building and starting containers"],
    "lines": ["==> Stopping containers"],
    "offset": 1,
    "total_lines": 1,
    "now": 1763040003.0,
}


def test_projects(client, upstreams) -> None:
    upstreams(agent={"/projects": [PROJECT]})

    body = client.get("/management/projects").json()

    assert [project["name"] for project in body] == ["local-tube"]
    assert body[0]["service"]["since"] == "2026-11-13T10:00:00Z"
    assert "containers" not in body[0]["service"]


def test_project_detail(client, upstreams) -> None:
    upstreams(agent={"/projects/local-tube": DETAIL})

    body = client.get("/management/projects/local-tube").json()

    assert body["commits"][0]["author"] == "dnielpy"
    assert body["head"]["hash"] == "abc1234"


def test_fetch(client, upstreams) -> None:
    started = {"status": "started"}
    calls = upstreams(agent={"/projects/fetch": started, "/projects/local-tube/fetch": started})

    assert client.post("/management/projects/fetch").status_code == 202
    assert client.post("/management/projects/local-tube/fetch").status_code == 202
    assert [call.method for call in calls] == ["POST", "POST"]


def test_update_passes_the_offset(client, upstreams) -> None:
    calls = upstreams(agent={"/projects/local-tube/update": JOB})

    body = client.get("/management/projects/local-tube/update", params={"offset": 40}).json()

    assert body["steps"][0]["label"] == "Stopping containers"
    assert calls[0].url.params["offset"] == "40"


def test_start_and_cancel_update(client, upstreams) -> None:
    cancelled = {**JOB, "running": False, "cancelled": True, "code": 130}
    calls = upstreams(agent={"/projects/local-tube/update": JOB, "/projects/local-tube/update/cancel": cancelled})

    assert client.post("/management/projects/local-tube/update").json()["running"] is True
    assert client.post("/management/projects/local-tube/update/cancel").json()["cancelled"] is True
    assert [call.method for call in calls] == ["POST", "POST"]


def test_unknown_project_and_busy_update_pass_through(client, upstreams) -> None:
    upstreams(
        agent={
            "/projects/missing": (404, {"detail": "There is no project called missing"}),
            "/projects/local-tube/update": (409, {"detail": "local-tube is already updating"}),
        }
    )

    missing = client.get("/management/projects/missing")
    busy = client.post("/management/projects/local-tube/update")

    assert (missing.status_code, missing.json()["detail"]) == (404, "There is no project called missing")
    assert (busy.status_code, busy.json()["detail"]) == (409, "local-tube is already updating")


def test_agent_down(client, upstreams) -> None:
    upstreams(agent={"/projects": httpx.ConnectError("refused")})

    response = client.get("/management/projects")

    assert response.status_code == 502
    assert response.json()["source"] == "agent"


def test_container_actions(client, upstreams) -> None:
    started = {"status": "started"}
    calls = upstreams(agent={"/projects/local-tube/restart": started, "/projects/local-tube/stop": started})

    assert client.post("/management/projects/local-tube/restart").status_code == 202
    assert client.post("/management/projects/local-tube/stop").status_code == 202
    assert client.post("/management/projects/local-tube/kill").status_code == 422
    assert [call.url.path for call in calls] == ["/projects/local-tube/restart", "/projects/local-tube/stop"]


def test_project_with_an_action(client, upstreams) -> None:
    action = {"name": "restart", "state": "err", "error": "no such container"}
    upstreams(agent={"/projects": [{**PROJECT, "action": action, "dashboard": True}]})

    body = client.get("/management/projects").json()

    assert body[0]["action"] == action
    assert body[0]["dashboard"] is True


def test_logs(client, upstreams) -> None:
    logs = {"containers": ["api", "web"], "container": "web", "lines": [{"time": "2026-11-13T10:00:00Z", "text": "ok"}]}
    calls = upstreams(agent={"/projects/local-tube/logs": logs})

    body = client.get("/management/projects/local-tube/logs", params={"container": "web", "tail": 50}).json()

    assert body["lines"][0]["text"] == "ok"
    assert dict(calls[0].url.params) == {"container": "web", "tail": "50"}
