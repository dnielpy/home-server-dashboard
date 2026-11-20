import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent  # noqa: E402

GIT_ENV = {
    "GIT_AUTHOR_NAME": "dnielpy",
    "GIT_AUTHOR_EMAIL": "dev@example.com",
    "GIT_COMMITTER_NAME": "dnielpy",
    "GIT_COMMITTER_EMAIL": "dev@example.com",
}


def sh(*args: str, cwd: Path) -> str:
    return subprocess.run(
        args, cwd=cwd, check=True, capture_output=True, text=True, env={**os.environ, **GIT_ENV}
    ).stdout.strip()


def make_commit(repo: Path, message: str) -> None:
    (repo / "file.txt").write_text(message)
    sh("git", "add", "file.txt", cwd=repo)
    sh("git", "commit", "-q", "-m", message, cwd=repo)


def wait_for(condition, timeout: float = 10) -> None:
    end = time.time() + timeout
    while time.time() < end:
        if condition():
            return
        time.sleep(0.05)
    raise AssertionError("timed out")


@pytest.fixture
def root(tmp_path, monkeypatch) -> Path:
    """A ROOT folder for the agent, with fresh state and a fake Docker that says nothing is deployed."""
    projects = tmp_path / "home-server"
    projects.mkdir()
    monkeypatch.setattr(agent, "ROOT", str(projects))
    monkeypatch.setattr(agent, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(agent, "FETCHES", agent.Fetches())
    monkeypatch.setattr(agent, "JOBS", agent.Jobs())
    monkeypatch.setattr(
        agent,
        "service_status",
        lambda path, fresh=False: {"deployed": False, "up": False, "since": None, "detail": None, "containers": []},
    )
    return projects


@pytest.fixture
def repos(root, tmp_path):
    """A GitHub stand-in (bare repo), the server's clone in ROOT and a dev clone to push new commits from."""
    remote = tmp_path / "remote.git"
    sh("git", "init", "-q", "--bare", "-b", "main", str(remote), cwd=tmp_path)
    dev = tmp_path / "dev"
    sh("git", "clone", "-q", str(remote), str(dev), cwd=tmp_path)
    sh("git", "checkout", "-q", "-b", "main", cwd=dev)
    make_commit(dev, "feat: first")
    sh("git", "push", "-q", "-u", "origin", "main", cwd=dev)
    server = root / "app"
    sh("git", "clone", "-q", str(remote), str(server), cwd=tmp_path)
    return server, dev


def fetched(name: str) -> dict:
    agent.FETCHES.start(name)
    wait_for(lambda: agent.FETCHES.get(name)["state"] != "pending")
    return agent.summary(name)


def test_lists_only_folders_with_a_repo(root, repos) -> None:
    (root / "not-a-repo").mkdir()
    assert agent.project_names() == ["app"]


def test_up_to_date(repos) -> None:
    project = fetched("app")
    assert project["fetch"] == "ok"
    assert project["branch"] == "main"
    assert project["behind"] == 0


def test_new_commits_on_github(repos) -> None:
    _, dev = repos
    make_commit(dev, "fix(api): second")
    make_commit(dev, "third without a type")
    sh("git", "push", "-q", cwd=dev)

    project = fetched("app")
    assert project["behind"] == 2
    assert project["remote_epoch"] is not None

    detail = agent.detail("app")
    assert [c["subject"] for c in detail["commits"]] == ["third without a type", "fix(api): second"]
    assert detail["commits"][0]["author"] == "dnielpy"
    assert detail["head"]["subject"] == "feat: first"
    assert detail["remote"]["subject"] == "third without a type"
    assert detail["ahead"] == 0
    assert detail["dirty"] is False


def test_local_changes_and_commits_ahead(repos) -> None:
    server, _ = repos
    make_commit(server, "chore: only on the server")
    (server / "file.txt").write_text("edited")

    detail = agent.detail("app")
    assert detail["ahead"] == 1
    assert detail["dirty"] is True


def test_branch_without_remote(root) -> None:
    repo = root / "local-only"
    repo.mkdir()
    sh("git", "init", "-q", "-b", "main", cwd=repo)
    make_commit(repo, "feat: local")

    assert fetched("local-only")["fetch"] == "noup"
    assert agent.detail("local-only")["has_upstream"] is False


def test_fetch_that_fails(repos, tmp_path) -> None:
    server, _ = repos
    sh("git", "remote", "set-url", "origin", str(tmp_path / "missing.git"), cwd=server)

    project = fetched("app")
    assert project["fetch"] == "err"
    assert project["fetch_error"]
    assert not project["fetch_error"].startswith("fatal: ")


def test_clean_line() -> None:
    assert agent.clean_line("\x1b[32mdone\x1b[0m") == "done"
    assert agent.clean_line("10%\r50%\r100%") == "100%"
    assert agent.clean_line("\tindented") == "    indented"
    assert agent.clean_line("   ") is None


def container(status: str = "running", health=None, started="2026-11-13T10:00:00Z", finished=None, exit_code=0):
    return {
        "name": "api",
        "status": status,
        "health": health,
        "exit_code": exit_code,
        "started_at": started,
        "finished_at": finished,
    }


def test_containers_up_since_the_last_one_started() -> None:
    status = agent.summarize_containers(
        [container(health="healthy"), container(started="2026-11-13T11:00:00Z")]
    )
    assert status["up"] is True
    assert status["since"] == "2026-11-13T11:00:00Z"
    assert status["detail"] is None


def test_containers_down_since_one_stopped() -> None:
    status = agent.summarize_containers(
        [container(), container(status="exited", finished="2026-11-13T12:00:00Z", exit_code=1)]
    )
    assert status["up"] is False
    assert status["since"] == "2026-11-13T12:00:00Z"
    assert status["detail"] == "api exited (1)"


def test_unhealthy_container_is_down() -> None:
    status = agent.summarize_containers([container(health="unhealthy")])
    assert status["up"] is False
    assert status["detail"] == "api unhealthy"


def test_host_ports_are_the_published_tcp_ports() -> None:
    item = {
        "NetworkSettings": {
            "Ports": {
                "3000/tcp": [{"HostIp": "0.0.0.0", "HostPort": "3006"}, {"HostIp": "::", "HostPort": "3006"}],
                "443/udp": [{"HostIp": "0.0.0.0", "HostPort": "443"}],
                "6800/tcp": None,
            }
        }
    }
    assert agent.host_ports(item) == [3006]
    assert agent.host_ports({"NetworkSettings": {"Ports": {}}}) == []


def test_ports_list_each_service() -> None:
    status = agent.summarize_containers([{**container(), "name": "web", "ports": [3020]}, {**container(), "ports": [3021]}])
    assert status["ports"] == [{"service": "web", "port": 3020}, {"service": "api", "port": 3021}]


def test_docker_time() -> None:
    assert agent._docker_time("2026-11-13T10:00:00.123456789Z") == "2026-11-13T10:00:00Z"
    assert agent._docker_time("0001-01-01T00:00:00Z") is None


def write_update_script(repo: Path, body: str) -> None:
    (repo / "scripts").mkdir(exist_ok=True)
    (repo / "scripts" / "update.sh").write_text(body)


def finished_job(name: str) -> dict:
    wait_for(lambda: not agent.JOBS.get(name).running())
    return agent.JOBS.get(name).state()


def test_update_runs_the_steps(repos) -> None:
    server, _ = repos
    write_update_script(
        server,
        'echo "==> Stopping containers"\necho "\033[1mstopped\033[0m"\necho "==> Pulling latest code"\n'
        'echo "==> Building and starting containers"\nprintf "no newline at the end"\n',
    )
    started = agent.JOBS.start("app").state()
    assert started["running"] is True
    assert started["first_deploy"] is True

    job = finished_job("app")
    assert job["code"] == 0
    assert job["cancelled"] is False
    assert [step["label"] for step in job["steps"]] == agent.EXPECTED_STEPS
    assert all(step["finished_at"] is not None for step in job["steps"])
    assert "stopped" in job["lines"]
    assert job["lines"][-1] == "no newline at the end"
    assert job["hash"] == sh("git", "rev-parse", "--short", "HEAD", cwd=server)
    assert job["offset"] == job["total_lines"] == len(job["lines"])
    assert agent.JOBS.get("app").state(offset=job["offset"])["lines"] == []


def test_update_that_fails(repos) -> None:
    server, _ = repos
    write_update_script(server, 'echo "==> Stopping containers"\necho "boom" >&2\nexit 3\n')
    agent.JOBS.start("app")

    job = finished_job("app")
    assert job["code"] == 3
    assert job["lines"] == ["==> Stopping containers", "boom"]


def test_only_one_update_at_a_time_and_cancel(repos) -> None:
    server, _ = repos
    write_update_script(server, 'echo "==> Stopping containers"\nsleep 30\n')
    agent.JOBS.start("app")
    with pytest.raises(agent.HttpError) as err:
        agent.JOBS.start("app")
    assert err.value.status == 409

    agent.JOBS.get("app").cancel()
    job = agent.JOBS.get("app").state()
    assert job["running"] is False
    assert job["cancelled"] is True
    assert job["code"] == agent.CANCELLED_CODE


def test_update_survives_a_restart_of_the_agent(repos) -> None:
    server, _ = repos
    write_update_script(server, 'echo "==> Stopping containers"\nsleep 0.5\necho "==> Pulling latest code"\n')
    agent.JOBS.start("app")
    wait_for(lambda: agent.JOBS.get("app").state()["steps"])

    # A new agent only has the files to go on
    agent.JOBS = agent.Jobs()
    job = finished_job("app")
    assert job["code"] == 0
    assert [step["label"] for step in job["steps"]] == ["Stopping containers", "Pulling latest code"]


def test_project_without_update_script(repos) -> None:
    with pytest.raises(agent.HttpError) as err:
        agent.JOBS.start("app")
    assert err.value.status == 409


@pytest.fixture
def http(root):
    server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def request(url: str, method: str = "GET") -> tuple[int, object]:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method)) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


def test_http(repos, http) -> None:
    status, projects = request(f"{http}/projects")
    assert status == 200
    assert [p["name"] for p in projects] == ["app"]

    assert request(f"{http}/projects/fetch", "POST")[0] == 200
    assert request(f"{http}/projects/app")[1]["name"] == "app"
    assert request(f"{http}/projects/missing")[0] == 404
    assert request(f"{http}/projects/app/update")[0] == 404
    assert request(f"{http}/projects/app", "POST")[0] == 404
    assert request(f"{http}/info")[1]["root"].endswith("home-server")


@pytest.fixture
def docker(tmp_path, monkeypatch, root):
    """A fake docker on PATH that logs its arguments; `sleep` makes stop, start and restart take that long."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "docker-calls"
    script = bin_dir / "docker"
    script.write_text(
        "#!/bin/sh\n"
        f'echo "$@" >> "{calls}"\n'
        'case "$1" in\n'
        '  ps) echo abc123 ;;\n'
        '  logs) echo "2026-11-13T10:00:00.123Z \033[32mready\033[0m"; echo "2026-11-13T10:00:01.000Z oops" >&2 ;;\n'
        '  *) sleep "${DOCKER_SLEEP:-0}" ;;\n'
        "esac\n"
    )
    script.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setattr(agent, "ACTIONS", agent.Actions())
    monkeypatch.setattr(
        agent,
        "service_status",
        lambda path, fresh=False: {
            "deployed": True, "up": True, "since": None, "detail": None,
            "containers": [{"name": "api"}, {"name": "web"}],
        },
    )
    return lambda: calls.read_text().splitlines()


def test_restart_runs_in_the_background(repos, docker, monkeypatch) -> None:
    monkeypatch.setenv("DOCKER_SLEEP", "3")
    agent.ACTIONS.start("app", "restart")
    assert agent.summary("app")["action"] == {"name": "restart", "state": "pending", "error": None}
    with pytest.raises(agent.HttpError) as err:
        agent.ACTIONS.start("app", "stop")
    assert (err.value.status, err.value.detail) == (409, "app is already restarting")

    wait_for(lambda: agent.ACTIONS.get("app")["state"] != "pending")
    assert agent.ACTIONS.get("app")["state"] == "ok"
    assert "restart abc123" in docker()


def test_the_dashboard_cannot_stop_itself(repos, docker, monkeypatch) -> None:
    monkeypatch.setattr(agent, "SELF", "app")
    with pytest.raises(agent.HttpError) as err:
        agent.ACTIONS.start("app", "stop")
    assert err.value.status == 409
    assert agent.summary("app")["dashboard"] is True


def test_logs_of_a_container(repos, docker) -> None:
    logs = agent.container_logs("app", None, 50)
    assert logs["containers"] == ["api", "web"]
    assert logs["container"] == "api"
    assert logs["lines"] == [
        {"time": "2026-11-13T10:00:00Z", "text": "ready"},
        {"time": "2026-11-13T10:00:01Z", "text": "oops"},
    ]
    assert any(call.startswith("ps -aq") and "com.docker.compose.service=api" in call for call in docker())
    assert "logs --timestamps --tail 50 abc123" in docker()


def test_http_container_routes(repos, docker, http) -> None:
    assert request(f"{http}/projects/app/start", "POST") == (200, {"status": "started"})
    assert request(f"{http}/projects/app/logs?container=web&tail=10")[1]["container"] == "web"
    assert request(f"{http}/projects/app/kill", "POST")[0] == 404


@pytest.fixture
def sudo(tmp_path, monkeypatch, root):
    """A fake sudo on PATH that logs what it runs; `-l` fails unless SUDO_ALLOWED is set."""
    bin_dir = tmp_path / "sudo-bin"
    bin_dir.mkdir()
    calls = tmp_path / "sudo-calls"
    script = bin_dir / "sudo"
    script.write_text(
        "#!/bin/sh\n"
        f'echo "$@" >> "{calls}"\n'
        'if [ "$2" = "-l" ] && [ -z "$SUDO_ALLOWED" ]; then exit 1; fi\n'
    )
    script.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setattr(agent, "POWER_DELAY_SECONDS", 0)
    return lambda: calls.read_text().splitlines() if calls.exists() else []


def test_power_without_permission(sudo) -> None:
    with pytest.raises(agent.HttpError) as err:
        agent.power("reboot")
    assert err.value.status == 403
    assert not any(call.endswith(" reboot") and "-l" not in call for call in sudo())


def test_power_reboots(sudo, monkeypatch) -> None:
    monkeypatch.setenv("SUDO_ALLOWED", "1")
    agent.power("poweroff")
    wait_for(lambda: len(sudo()) == 2)
    check, run = sudo()
    assert check.startswith("-n -l ") and check.endswith("systemctl poweroff")
    assert run.startswith("-n ") and run.endswith("systemctl poweroff") and "-l" not in run


def test_no_power_off_while_updating(repos, sudo, monkeypatch) -> None:
    server, _ = repos
    write_update_script(server, "sleep 30\n")
    agent.JOBS.start("app")
    with pytest.raises(agent.HttpError) as err:
        agent.power("reboot")
    assert (err.value.status, err.value.detail) == (409, "app is updating; wait for it to end")
    agent.JOBS.get("app").cancel()


def test_http_power(sudo, http) -> None:
    assert request(f"{http}/power/reboot", "POST")[0] == 403
    assert request(f"{http}/power/halt", "POST")[0] == 404
