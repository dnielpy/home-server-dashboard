#!/usr/bin/env python3
"""Agent that runs on the home server itself, outside Docker, and lets the dashboard manage the projects.

Does what home-server.sh does: lists the folders with a git repo next to the dashboard's, compares them with GitHub
and updates and redeploys them with their own scripts/update.sh. It also tells whether each one's containers are
running and since when, stops, starts and restarts them and reads their logs, reboots or powers off the server, and the server's CPU, memory, disks and network (metrics.py). It also manages the files of the external disk
(files.py). Only uses the standard library,
so it runs with the python3 of the host.

Usage: python3 agent.py   (ROOT, AGENT_PORT, STATE_DIR, SYSTEM_DISK_MOUNT and EXTERNAL_DISK_MOUNT can be set in the
environment)
"""

from __future__ import annotations

import getpass
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import files
import metrics

# The folder the projects live in: the one this repo was cloned into (apps/agent/agent.py -> ../../..)
ROOT = os.path.abspath(os.environ.get("ROOT") or Path(__file__).resolve().parents[3])
PORT = int(os.environ.get("AGENT_PORT", "3022"))
STATE_DIR = Path(os.environ.get("STATE_DIR") or Path.home() / ".local/state/home-server-agent")

# The steps every project's update.sh prints, before it has printed them
EXPECTED_STEPS = ["Pulling latest code", "Building images", "Stopping containers", "Starting containers"]
STEP_PREFIX = "==> "
# Exit code written for an update cancelled from the dashboard, the one of a Ctrl+C
CANCELLED_CODE = 130
# Most log lines sent in one answer; the dashboard asks again for the rest
MAX_LINES = 2000
DOCKER_CACHE_SECONDS = 5

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")
COMPOSE_LABEL = "com.docker.compose.project.working_dir"
# The dashboard's own folder, which can be restarted but not stopped from the dashboard
SELF = Path(__file__).resolve().parents[2].name


class HttpError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


# --- Git ------------------------------------------------------------------------------------------------------------


def run(args: list[str], cwd: str | None = None, timeout: float = 30, env: dict[str, str] | None = None):
    try:
        return subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            env={**os.environ, **(env or {})},
        )
    except (OSError, subprocess.TimeoutExpired) as err:
        return subprocess.CompletedProcess(args, 1, "", str(err))


def git(path: str, *args: str) -> str | None:
    """Stdout of a git command in the project, or None when it failed."""
    result = run(["git", "-C", path, *args])
    return result.stdout.strip() if result.returncode == 0 else None


def has_upstream(path: str) -> bool:
    return git(path, "rev-parse", "-q", "--verify", "@{u}") is not None


def commit(path: str, ref: str) -> dict[str, Any] | None:
    out = git(path, "log", "-1", "--format=%h%x1f%ct%x1f%s", ref)
    if not out:
        return None
    hash_, epoch, subject = out.split("\x1f", 2)
    return {"hash": hash_, "epoch": int(epoch), "subject": subject}


def commits_behind(path: str) -> list[dict[str, Any]]:
    out = git(path, "log", "--format=%h%x1f%ct%x1f%an%x1f%s", "HEAD..@{u}") or ""
    rows = []
    for line in out.splitlines():
        hash_, epoch, author, subject = line.split("\x1f", 3)
        rows.append({"hash": hash_, "epoch": int(epoch), "author": author, "subject": subject})
    return rows


def count(path: str, revs: str) -> int:
    out = git(path, "rev-list", "--count", revs)
    return int(out) if out and out.isdigit() else 0


# --- Fetch ----------------------------------------------------------------------------------------------------------


class Fetches:
    """The last `git fetch` of each project: pending while it runs, then ok or err with the first line of the error."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.states: dict[str, dict[str, Any]] = {}

    def start(self, name: str) -> None:
        with self.lock:
            if self.states.get(name, {}).get("state") == "pending":
                return
            self.states[name] = {"state": "pending", "error": None}
        threading.Thread(target=self._fetch, args=(name,), daemon=True).start()

    def _fetch(self, name: str) -> None:
        result = run(
            ["git", "-C", project_path(name), "-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=20",
             "fetch", "--quiet"],
            timeout=120,
            env={"GIT_TERMINAL_PROMPT": "0"},
        )
        error = None
        if result.returncode != 0:
            first = next((line for line in result.stderr.splitlines() if line.strip()), "")
            error = first.removeprefix("fatal: ") or f"git fetch exited with code {result.returncode}"
        with self.lock:
            self.states[name] = {"state": "err" if error else "ok", "error": error}

    def get(self, name: str) -> dict[str, Any]:
        with self.lock:
            # Never fetched since the agent started: what the last fetch left in the repo
            return dict(self.states.get(name, {"state": "ok", "error": None}))


FETCHES = Fetches()


# --- Docker ---------------------------------------------------------------------------------------------------------

_docker_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_docker_lock = threading.Lock()


def _docker_time(value: str | None) -> str | None:
    # 2026-11-13T10:00:00.123456789Z -> 2026-11-13T10:00:00Z; Docker uses year 1 for "never"
    if not value or value.startswith("0001-"):
        return None
    return value[:19] + "Z"


def service_status(path: str, fresh: bool = False) -> dict[str, Any]:
    """Whether the project's containers are running, and since when. `deployed` is false when it has none."""
    now = time.monotonic()
    with _docker_lock:
        cached = _docker_cache.get(path)
        if cached and not fresh and now - cached[0] < DOCKER_CACHE_SECONDS:
            return cached[1]

    status = _read_service_status(path)
    with _docker_lock:
        _docker_cache[path] = (now, status)
    return status


def _read_service_status(path: str) -> dict[str, Any]:
    ids = run(["docker", "ps", "-aq", "--filter", f"label={COMPOSE_LABEL}={path}"], timeout=10)
    if ids.returncode != 0:
        detail = (ids.stderr.strip().splitlines() or ["docker ps failed"])[0]
        return {"deployed": None, "up": False, "since": None, "detail": detail, "containers": [], "ports": []}
    if not ids.stdout.split():
        return {"deployed": False, "up": False, "since": None, "detail": None, "containers": [], "ports": []}

    inspect = run(["docker", "inspect", *ids.stdout.split()], timeout=10)
    try:
        items = json.loads(inspect.stdout)
    except ValueError:
        return {"deployed": True, "up": False, "since": None, "detail": "docker inspect failed", "containers": [], "ports": []}

    containers = []
    for item in items:
        state = item.get("State", {})
        health = (state.get("Health") or {}).get("Status")
        containers.append({
            "name": item.get("Config", {}).get("Labels", {}).get("com.docker.compose.service")
            or item.get("Name", "").lstrip("/"),
            "status": state.get("Status", "unknown"),
            "health": health,
            "exit_code": state.get("ExitCode"),
            "started_at": _docker_time(state.get("StartedAt")),
            "finished_at": _docker_time(state.get("FinishedAt")),
            "ports": host_ports(item),
        })
    return summarize_containers(containers)


def host_ports(item: dict[str, Any]) -> list[int]:
    """The TCP ports of the host the container publishes, from `docker inspect`. Empty while it is stopped."""
    bindings = (item.get("NetworkSettings") or {}).get("Ports") or {}
    ports = {
        int(binding["HostPort"])
        for spec, targets in bindings.items()
        if spec.endswith("/tcp")
        for binding in targets or []
        if binding.get("HostPort", "").isdigit()
    }
    return sorted(ports)


def summarize_containers(containers: list[dict[str, Any]]) -> dict[str, Any]:
    problems = []
    for c in containers:
        if c["status"] != "running":
            problems.append(f"{c['name']} {c['status']}" + (f" ({c['exit_code']})" if c["status"] == "exited" else ""))
        elif c["health"] not in (None, "healthy"):
            problems.append(f"{c['name']} {c['health']}")
    up = not problems
    if up:
        # When the last of them came up
        since = max((c["started_at"] for c in containers if c["started_at"]), default=None)
    else:
        stopped = [c["finished_at"] for c in containers if c["status"] != "running" and c["finished_at"]]
        since = max(stopped, default=None) or max((c["started_at"] for c in containers if c["started_at"]), default=None)
    return {
        "deployed": True,
        "up": up,
        "since": since,
        "detail": ", ".join(problems) or None,
        "containers": containers,
        # Where to open each service, by its compose name
        "ports": sorted(
            ({"service": c["name"], "port": port} for c in containers for port in c.get("ports", [])),
            key=lambda item: item["port"],
        ),
    }


# --- Containers -----------------------------------------------------------------------------------------------------


def container_ids(path: str, service: str | None = None) -> list[str]:
    filters = ["--filter", f"label={COMPOSE_LABEL}={path}"]
    if service is not None:
        filters += ["--filter", f"label=com.docker.compose.service={service}"]
    result = run(["docker", "ps", "-aq", *filters], timeout=10)
    if result.returncode != 0:
        raise HttpError(502, (result.stderr.strip().splitlines() or ["docker ps failed"])[0])
    return result.stdout.split()


class Actions:
    """The last stop, start or restart of each project's containers. They run in the background: restarting the
    dashboard itself takes down the API that asked for it before docker answers."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.states: dict[str, dict[str, Any]] = {}

    def start(self, name: str, action: str) -> None:
        if action == "stop" and name == SELF:
            raise HttpError(409, "Stopping the dashboard would leave no way to start it again from here")
        job = JOBS.get(name)
        if job is not None and job.running():
            raise HttpError(409, f"{name} is updating")
        ids = container_ids(project_path(name))
        if not ids:
            raise HttpError(409, f"{name} has no containers")
        with self.lock:
            if self.states.get(name, {}).get("state") == "pending":
                raise HttpError(409, f"{name} is already {CONTAINER_ACTIONS[self.states[name]['name']]}")
            self.states[name] = {"name": action, "state": "pending", "error": None}
        threading.Thread(target=self._run, args=(name, action, ids), daemon=True).start()

    def _run(self, name: str, action: str, ids: list[str]) -> None:
        result = run(["docker", action, *ids], timeout=180)
        error = None
        if result.returncode != 0:
            error = (result.stderr.strip().splitlines() or [f"docker {action} exited with code {result.returncode}"])[0]
        service_status(project_path(name), fresh=True)
        with self.lock:
            self.states[name] = {"name": action, "state": "err" if error else "ok", "error": error}

    def get(self, name: str) -> dict[str, Any] | None:
        with self.lock:
            state = self.states.get(name)
            return dict(state) if state else None


ACTIONS = Actions()
# Each action, as the 409 for a second one says it
CONTAINER_ACTIONS = {"stop": "stopping", "start": "starting", "restart": "restarting"}
DEFAULT_LOG_LINES = 300


def container_logs(name: str, service: str | None, tail: int) -> dict[str, Any]:
    """The last `tail` lines of one of the project's containers, the first one when none is asked for."""
    path = project_path(name)
    services = [c["name"] for c in service_status(path)["containers"]]
    service = service or (services[0] if services else None)
    if service is None:
        return {"containers": services, "container": None, "lines": []}
    ids = container_ids(path, service)
    if not ids:
        raise HttpError(404, f"{name} has no container called {service}")
    try:
        result = subprocess.run(
            ["docker", "logs", "--timestamps", "--tail", str(tail), ids[0]],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as err:
        raise HttpError(502, f"docker logs failed: {err}") from err
    lines = []
    for raw in result.stdout.decode("utf-8", errors="replace").splitlines():
        stamp, _, text = raw.partition(" ")
        line = clean_line(text)
        if line is not None:
            lines.append({"time": _docker_time(stamp), "text": line})
    return {"containers": services, "container": service, "lines": lines}


# --- Power ----------------------------------------------------------------------------------------------------------

# Seconds between answering and rebooting or powering off, so the answer gets back to the dashboard
POWER_DELAY_SECONDS = 3


def power(action: str) -> None:
    """Reboots or powers off the whole server, with `sudo -n systemctl`: install-agent.sh allows only those two."""
    updating = [name for name in project_names() if (job := JOBS.get(name)) is not None and job.running()]
    if updating:
        raise HttpError(409, f"{', '.join(updating)} is updating; wait for it to end")
    systemctl = shutil.which("systemctl") or "/usr/bin/systemctl"
    allowed = run(["sudo", "-n", "-l", systemctl, action], timeout=10)
    if allowed.returncode != 0:
        raise HttpError(
            403, f"The agent is not allowed to run systemctl {action}; run ./scripts/install-agent.sh again on the server"
        )
    subprocess.Popen(
        ["sh", "-c", f'sleep {POWER_DELAY_SECONDS}; exec sudo -n "$0" "$1"', systemctl, action],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


# --- Projects -------------------------------------------------------------------------------------------------------


def project_names() -> list[str]:
    try:
        entries = sorted(os.listdir(ROOT))
    except OSError:
        return []
    return [name for name in entries if os.path.isdir(os.path.join(ROOT, name, ".git"))]


def project_path(name: str) -> str:
    return os.path.join(ROOT, name)


def require_project(name: str) -> str:
    if name not in project_names():
        raise HttpError(404, f"There is no project called {name}")
    return name


def summary(name: str) -> dict[str, Any]:
    path = project_path(name)
    fetch = FETCHES.get(name)
    upstream = has_upstream(path)
    if fetch["state"] == "ok" and not upstream:
        fetch["state"] = "noup"
    head = commit(path, "HEAD")
    remote = commit(path, "@{u}") if upstream else None
    job = JOBS.get(name)
    return {
        "name": name,
        "path": path,
        "branch": git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        "fetch": fetch["state"],
        "fetch_error": fetch["error"],
        "behind": count(path, "HEAD..@{u}") if upstream else 0,
        "local_epoch": head["epoch"] if head else None,
        "remote_epoch": remote["epoch"] if remote else None,
        "service": service_status(path),
        "updating": bool(job and job.running()),
        "action": ACTIONS.get(name),
        "dashboard": name == SELF,
    }


def detail(name: str) -> dict[str, Any]:
    path = project_path(name)
    upstream = has_upstream(path)
    return {
        **summary(name),
        "has_upstream": upstream,
        "head": commit(path, "HEAD"),
        "remote": commit(path, "@{u}") if upstream else None,
        "ahead": count(path, "@{u}..HEAD") if upstream else 0,
        "commits": commits_behind(path) if upstream else [],
        "dirty": bool(git(path, "status", "--porcelain", "--untracked-files=no")),
    }


# --- Updates --------------------------------------------------------------------------------------------------------


def clean_line(raw: str) -> str | None:
    """A line of update.sh's output as the panel shows it: what is left after the last \\r, without colors or tabs."""
    line = ANSI_RE.sub("", raw.rsplit("\r", 1)[-1]).replace("\t", "    ")
    return line if line.strip() else None


class Job:
    """An update.sh run. Everything lives in files under STATE_DIR/<project>, so it survives a restart of the agent
    and the dashboard can pick it up again after reconnecting."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.dir = STATE_DIR / name
        self.log = self.dir / "update.log"
        self.code_file = self.dir / "update.code"
        self.meta_file = self.dir / "update.json"
        self.lock = threading.Lock()
        self.meta: dict[str, Any] = json.loads(self.meta_file.read_text())
        self._offset = 0
        self._partial = ""
        self.lines: list[str] = []

    @classmethod
    def start(cls, name: str) -> "Job":
        path = project_path(name)
        if not os.path.isfile(os.path.join(path, "scripts", "update.sh")):
            raise HttpError(409, f"{name} has no scripts/update.sh")
        folder = STATE_DIR / name
        folder.mkdir(parents=True, exist_ok=True)
        log = folder / "update.log"
        code = folder / "update.code"
        code.unlink(missing_ok=True)
        # Writes the exit code itself, so it is there even when the agent was restarted in between
        script = 'sh ./scripts/update.sh </dev/null; c=$?; echo "$c" > "$1.tmp" && mv "$1.tmp" "$1"'
        with open(log, "wb") as out:
            process = subprocess.Popen(
                ["sh", "-c", script, "sh", str(code)],
                cwd=path,
                stdout=out,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                # Its own process group: stopping or restarting the agent does not stop the update
                start_new_session=True,
                env={
                    **os.environ,
                    "GIT_TERMINAL_PROMPT": "0",
                    "COMPOSE_ANSI": "never",
                    "COMPOSE_PROGRESS": "plain",
                    "BUILDKIT_PROGRESS": "plain",
                    "NO_COLOR": "1",
                },
            )
        meta = {
            "pid": process.pid,
            "started_at": time.time(),
            "finished_at": None,
            "code": None,
            "cancelled": False,
            "first_deploy": service_status(path, fresh=True)["deployed"] is False,
            "hash": None,
            "steps": [],
        }
        (folder / "update.json").write_text(json.dumps(meta))
        job = cls(name)
        threading.Thread(target=job._watch, args=(process,), daemon=True).start()
        return job

    def _save(self) -> None:
        tmp = self.meta_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.meta))
        tmp.replace(self.meta_file)

    def _watch(self, process: subprocess.Popen | None) -> None:
        """Keeps the step times while the update runs, even with no one looking. Reaps the process when it is ours."""
        while self.running():
            self.refresh()
            time.sleep(1)
        if process is not None:
            process.wait()
        self.refresh()

    def _alive(self) -> bool:
        try:
            os.kill(self.meta["pid"], 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        return True

    def running(self) -> bool:
        with self.lock:
            return self.meta["finished_at"] is None and not self.code_file.exists() and self._alive()

    def refresh(self) -> None:
        """Reads what update.sh wrote since the last time, and closes the job once it ended."""
        with self.lock:
            try:
                with open(self.log, "rb") as f:
                    f.seek(self._offset)
                    chunk = f.read()
            except OSError:
                chunk = b""
            self._offset += len(chunk)
            text = self._partial + chunk.decode("utf-8", errors="replace")
            *complete, self._partial = text.split("\n")

            now = time.time()
            changed = False
            for raw in complete:
                line = clean_line(raw)
                if line is None:
                    continue
                if line.startswith(STEP_PREFIX):
                    step = sum(1 for known in self.lines if known.startswith(STEP_PREFIX))
                    if step >= len(self.meta["steps"]):
                        self.meta["steps"].append({"label": line[len(STEP_PREFIX):], "started_at": now})
                        changed = True
                self.lines.append(line)

            if self.meta["finished_at"] is None:
                ended = self.code_file.exists() or not self._alive()
                if ended:
                    if self._partial:
                        line = clean_line(self._partial)
                        if line is not None:
                            self.lines.append(line)
                        self._partial = ""
                    code = None
                    try:
                        code = int(self.code_file.read_text().strip())
                        finished = self.code_file.stat().st_mtime
                    except (OSError, ValueError):
                        finished = now
                    self.meta["code"] = code
                    self.meta["finished_at"] = finished
                    self.meta["hash"] = git(project_path(self.name), "rev-parse", "--short", "HEAD")
                    changed = True
            if changed:
                self._save()

    def cancel(self) -> None:
        if not self.running():
            raise HttpError(409, "The update already ended")
        try:
            os.killpg(self.meta["pid"], signal.SIGTERM)
        except ProcessLookupError:
            pass
        with self.lock:
            self.meta["cancelled"] = True
            self.meta["code"] = CANCELLED_CODE
            self.meta["finished_at"] = time.time()
            self.meta["hash"] = git(project_path(self.name), "rev-parse", "--short", "HEAD")
            self._save()

    def state(self, offset: int = 0) -> dict[str, Any]:
        self.refresh()
        with self.lock:
            meta = dict(self.meta)
            lines = self.lines[offset:offset + MAX_LINES]
            total = len(self.lines)
        steps = []
        for i, step in enumerate(meta["steps"]):
            nxt = meta["steps"][i + 1]["started_at"] if i + 1 < len(meta["steps"]) else meta["finished_at"]
            steps.append({"label": step["label"], "started_at": step["started_at"], "finished_at": nxt})
        return {
            "project": self.name,
            "running": meta["finished_at"] is None,
            "code": meta["code"],
            "cancelled": meta["cancelled"],
            "first_deploy": meta["first_deploy"],
            "started_at": meta["started_at"],
            "finished_at": meta["finished_at"],
            "hash": meta["hash"],
            "steps": steps,
            "expected_steps": EXPECTED_STEPS,
            "lines": lines,
            "offset": offset + len(lines),
            "total_lines": total,
            "now": time.time(),
        }


class Jobs:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.jobs: dict[str, Job] = {}

    def get(self, name: str) -> Job | None:
        with self.lock:
            job = self.jobs.get(name)
            if job is None and (STATE_DIR / name / "update.json").exists():
                # The last update of a previous run of the agent
                try:
                    job = self.jobs[name] = Job(name)
                except (OSError, ValueError):
                    return None
                if job.running():
                    threading.Thread(target=job._watch, args=(None,), daemon=True).start()
            return job

    def start(self, name: str) -> Job:
        current = self.get(name)
        if current is not None and current.running():
            raise HttpError(409, f"{name} is already updating")
        with self.lock:
            job = self.jobs[name] = Job.start(name)
        return job


JOBS = Jobs()


# --- HTTP -----------------------------------------------------------------------------------------------------------


def read_disks() -> list[dict[str, Any]]:
    # Looked up on every read, so the external disk shows up as soon as it is plugged in
    external = metrics.EXTERNAL_DISK_MOUNT or metrics.media_disk_mount(ROOT)
    return metrics.read_disks(external_mount=external)


def info() -> dict[str, Any]:
    home = str(Path.home())
    root = "~" + ROOT[len(home):] if ROOT.startswith(home) else ROOT
    return {"user": getpass.getuser(), "host": socket.gethostname().split(".")[0], "root": root}


ROUTES: list[tuple[str, re.Pattern[str], Any]] = []


def route(method: str, pattern: str):
    def register(handler):
        ROUTES.append((method, re.compile(f"^{pattern}$"), handler))
        return handler

    return register


@route("GET", "/health")
def _health(query):
    return {"status": "ok"}


# Started by main(), so importing the agent in the tests does not sample the machine running them
MONITOR: metrics.Monitor | None = None


def require_monitor() -> metrics.Monitor:
    if MONITOR is None:
        raise HttpError(503, "The agent is not sampling the server")
    return MONITOR


@route("GET", "/system")
def _system(query):
    return require_monitor().current()


@route("GET", "/system/traffic")
def _system_traffic(query):
    return require_monitor().traffic()


@route("GET", "/info")
def _info(query):
    return info()


@route("GET", "/projects")
def _projects(query):
    return [summary(name) for name in project_names()]


@route("POST", "/projects/fetch")
def _fetch_all(query):
    for name in project_names():
        FETCHES.start(name)
    return {"status": "started"}


@route("GET", "/projects/(?P<name>[^/]+)")
def _project(query, name):
    return detail(require_project(name))


@route("POST", "/projects/(?P<name>[^/]+)/fetch")
def _fetch(query, name):
    FETCHES.start(require_project(name))
    return {"status": "started"}


@route("POST", "/projects/(?P<name>[^/]+)/update")
def _start_update(query, name):
    return JOBS.start(require_project(name)).state()


@route("GET", "/projects/(?P<name>[^/]+)/update")
def _update(query, name):
    job = JOBS.get(require_project(name))
    if job is None:
        raise HttpError(404, f"{name} has not been updated from the dashboard yet")
    offset = query.get("offset", ["0"])[0]
    return job.state(int(offset) if offset.isdigit() else 0)


@route("POST", "/projects/(?P<name>[^/]+)/update/cancel")
def _cancel_update(query, name):
    job = JOBS.get(require_project(name))
    if job is None:
        raise HttpError(409, f"{name} is not updating")
    job.cancel()
    return job.state()


@route("POST", "/projects/(?P<name>[^/]+)/(?P<action>stop|start|restart)")
def _container_action(query, name, action):
    ACTIONS.start(require_project(name), action)
    return {"status": "started"}


@route("POST", "/power/(?P<action>reboot|poweroff)")
def _power(query, action):
    power(action)
    return {"status": "started"}


def external_disk() -> files.Disk:
    return files.Disk(metrics.EXTERNAL_DISK_MOUNT or metrics.media_disk_mount(ROOT))


def on_disk(action):
    """Runs a files.Disk action and answers its errors as the agent's."""
    try:
        return action(external_disk())
    except files.FilesError as err:
        raise HttpError(err.status, err.detail) from err


def param(query, name: str) -> str:
    return query.get(name, [""])[0]


@route("GET", "/files")
def _files(query):
    return on_disk(lambda disk: disk.listing(param(query, "path")))


@route("GET", "/files/download")
def _files_download(query):
    # Several ?path= go in one zip
    return on_disk(lambda disk: disk.download_many(query.get("path", [""])))


@route("POST", "/files/rename")
def _files_rename(query):
    return on_disk(lambda disk: disk.rename(param(query, "path"), param(query, "name")))


@route("POST", "/files/delete")
def _files_delete(query):
    return on_disk(lambda disk: disk.delete(param(query, "path")))


@route("POST", "/files/mkdir")
def _files_mkdir(query):
    return on_disk(lambda disk: disk.mkdir(param(query, "path"), param(query, "name")))


@route("POST", "/files/move")
def _files_move(query):
    return on_disk(lambda disk: disk.move(param(query, "path"), param(query, "to")))


# The copies started from the dashboard, which run in the background
TRANSFERS = files.Transfers()


@route("POST", "/files/copy")
def _files_copy(query):
    return on_disk(lambda disk: TRANSFERS.start(disk, param(query, "path"), param(query, "to")))


@route("GET", "/files/transfers")
def _files_transfers(query):
    return TRANSFERS.list()


@route("POST", "/files/transfers/(?P<job_id>[0-9a-f]{32})/cancel")
def _files_transfer_cancel(query, job_id):
    return on_disk(lambda disk: TRANSFERS.cancel(job_id))


@route("GET", "/projects/(?P<name>[^/]+)/logs")
def _logs(query, name):
    tail = query.get("tail", [""])[0]
    lines = min(int(tail), MAX_LINES) if tail.isdigit() else DEFAULT_LOG_LINES
    return container_logs(require_project(name), query.get("container", [None])[0], lines)


class Handler(BaseHTTPRequestHandler):
    server_version = "home-server-agent"

    def _handle(self, method: str) -> None:
        url = urlparse(self.path)
        status, body = 404, {"detail": "Not Found"}
        for route_method, pattern, handler in ROUTES:
            match = pattern.match(url.path)
            if match and route_method == method:
                try:
                    status, body = 200, handler(parse_qs(url.query), **match.groupdict())
                except HttpError as err:
                    status, body = err.status, {"detail": err.detail}
                except Exception as err:  # noqa: BLE001 - the dashboard shows it instead of a dropped connection
                    status, body = 500, {"detail": f"{type(err).__name__}: {err}"}
                break
        if isinstance(body, files.Download):
            self._stream(body)
            return
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _stream(self, download: files.Download) -> None:
        self.send_response(200)
        for name, value in download.headers().items():
            self.send_header(name, value)
        # A zip has no length up front: the end of the connection ends it
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            download.write(self.wfile)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The download was cancelled
        self.close_connection = True

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Only failures: the panel polls every second
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            sys.stderr.write(f"{self.address_string()} {format % args}\n")


def main() -> None:
    global MONITOR
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    MONITOR = metrics.Monitor(STATE_DIR / "metrics.sqlite3", disks=read_disks)
    MONITOR.start()
    for name in project_names():
        FETCHES.start(name)
        JOBS.get(name)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    print(f"home-server-agent on :{PORT}, projects in {ROOT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
