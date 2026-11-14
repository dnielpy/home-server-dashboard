#!/usr/bin/env python3
"""Host-side event monitor and private HTTP API. Uses only Python's standard library."""

from __future__ import annotations

import hmac
import json
import os
import sqlite3
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

RULES = {
    "download_done": "Descarga terminada",
    "download_failed": "Descarga fallida",
    "power_out": "Corte de corriente",
    "power_restored": "Corriente restablecida",
    "battery_full": "Batería al 100 %",
    "container_down": "Contenedor caído",
    "container_restored": "Contenedor recuperado",
}
POLL_SECONDS = 30
CONFIRM_POWER_SECONDS = 300
POWER_GROUP_SECONDS = 1800
MAX_SAMPLE_AGE_SECONDS = 120
CONFIRM_CONTAINER_SECONDS = 60
MAINTENANCE_GRACE_SECONDS = 120


def utcnow() -> datetime:
    return datetime.now(UTC)


def timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value)


def iso(value: datetime | None = None) -> str:
    return (value or utcnow()).isoformat().replace("+00:00", "Z")


def epoch(value: str | None) -> float:
    return timestamp(value).timestamp() if value else 0.0


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule TEXT NOT NULL,
                    source TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    message TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    delivery_status TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry_at REAL NOT NULL DEFAULT 0,
                    last_error TEXT,
                    telegram_message_id TEXT,
                    dedupe_key TEXT NOT NULL UNIQUE
                );
                CREATE INDEX IF NOT EXISTS events_retry ON events(delivery_status, next_retry_at);
            """)
            db.executemany("INSERT OR IGNORE INTO rules(id, enabled) VALUES (?, 1)", [(x,) for x in RULES])
            # A process can die after Telegram accepts a message but before we save its ID.
            # Such deliveries need review; retrying them could send the alert twice.
            db.execute("""UPDATE events SET delivery_status='uncertain',
                          last_error='El monitor se reinició durante el envío; comprueba Telegram antes de reenviar.'
                          WHERE delivery_status='sending'""")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=10000")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def get(self, key: str, default=None):
        with self.connect() as db:
            row = db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value):
        with self.connect() as db:
            db.execute("INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))

    def rule_enabled(self, rule: str) -> bool:
        with self.connect() as db:
            row = db.execute("SELECT enabled FROM rules WHERE id=?", (rule,)).fetchone()
        return bool(row and row[0])

    def rules(self):
        with self.connect() as db:
            rows = db.execute("SELECT id,enabled FROM rules ORDER BY id").fetchall()
        return [{"id": row[0], "label": RULES[row[0]], "enabled": bool(row[1])} for row in rows]

    def set_rule(self, rule: str, enabled: bool):
        if rule not in RULES:
            raise ValueError("Unknown rule")
        with self.connect() as db:
            db.execute("UPDATE rules SET enabled=? WHERE id=?", (int(enabled), rule))

    def event(self, rule: str, source: str, subject: str, message: str, key: str, force: bool = False) -> None:
        if not force and not self.rule_enabled(rule):
            return
        with self.connect() as db:
            db.execute("""INSERT OR IGNORE INTO events(rule,source,subject,message,occurred_at,dedupe_key)
                          VALUES (?,?,?,?,?,?)""", (rule, source, subject, message, iso(), key))

    def list_events(self, limit: int, offset: int):
        with self.connect() as db:
            rows = db.execute("""SELECT id,rule,source,subject,message,occurred_at,delivery_status,
                                  attempts,last_error,telegram_message_id FROM events
                                  ORDER BY id DESC LIMIT ? OFFSET ?""", (limit, offset)).fetchall()
            total = db.execute("SELECT count(*) FROM events").fetchone()[0]
        return {"items": [dict(row) for row in rows], "total": total}

    def claim_due(self):
        with self.connect() as db:
            row = db.execute("""SELECT id,message FROM events WHERE delivery_status IN ('pending','retry')
                                AND next_retry_at<=? ORDER BY id LIMIT 1""", (time.time(),)).fetchone()
            if row:
                db.execute("UPDATE events SET delivery_status='sending' WHERE id=?", (row["id"],))
        return dict(row) if row else None

    def delivered(self, event_id: int, message_id: str | None):
        with self.connect() as db:
            db.execute("""UPDATE events SET delivery_status='sent',attempts=attempts+1,
                          last_error=NULL,telegram_message_id=? WHERE id=?""", (message_id, event_id))

    def failed(self, event_id: int, error: str):
        with self.connect() as db:
            row = db.execute("SELECT attempts FROM events WHERE id=?", (event_id,)).fetchone()
            attempts = row[0] + 1
            delay = min(3600, 30 * 2 ** min(attempts - 1, 7))
            db.execute("""UPDATE events SET delivery_status='retry',attempts=?,next_retry_at=?,
                          last_error=? WHERE id=?""", (attempts, time.time() + delay, error[:500], event_id))

    def uncertain(self, event_id: int, error: str):
        with self.connect() as db:
            db.execute("""UPDATE events SET delivery_status='uncertain',attempts=attempts+1,
                          last_error=? WHERE id=?""", (error[:500], event_id))


class Monitor:
    def __init__(self, store: Store, config: dict[str, str]):
        self.store = store
        self.config = config

    def get_json(self, url: str, headers: dict[str, str] | None = None):
        request = Request(url, headers=headers or {})
        with urlopen(request, timeout=12) as response:
            return json.load(response)

    def tick(self):
        for label, poll in (
            ("power", self.poll_power),
            ("dashboard downloads", self.poll_dashboard_downloads),
            ("LocalTube downloads", self.poll_localtube_downloads),
            ("containers", self.poll_containers),
        ):
            try:
                poll()
            except Exception as error:  # noqa: BLE001 - one unavailable source must not stop other jobs
                print(f"{label}: {error}", file=sys.stderr, flush=True)
        try:
            self.send_due()
        except Exception as error:  # noqa: BLE001 - keep the loop alive for the next attempt
            print(f"Telegram: {error}", file=sys.stderr, flush=True)

    def poll_power(self):
        body = self.get_json(self.config["BLUETTI_API_URL"] + "/data-summary?page_size=1")
        item = body["items"][0]
        now = utcnow()
        date = timestamp(item["date"])
        state = self.store.get("power", {})
        if (now - date).total_seconds() > MAX_SAMPLE_AGE_SECONDS or date > now + timedelta(seconds=30):
            state["candidate"] = None
            state["candidate_at"] = None
            self.store.set("power", state)
            return
        if state.get("last_sample") == item["id"]:
            self._deferred_outage(state, now)
            return
        previous_at = epoch(state.get("last_sample_at"))
        state["last_sample"] = item["id"]
        state["last_sample_at"] = item["date"]
        observed = bool(item["ac"])
        if "confirmed" not in state:
            state.update(confirmed=observed, candidate=None, candidate_at=None,
                         outage_confirmed=False, battery_armed=item["battery_percent"] < 100)
        elif observed == state["confirmed"]:
            state["candidate"] = None
            state["candidate_at"] = None
        else:
            if state.get("candidate") != observed or date.timestamp() - previous_at > MAX_SAMPLE_AGE_SECONDS:
                state["candidate"] = observed
                state["candidate_at"] = item["date"]
            elif date.timestamp() - epoch(state.get("candidate_at")) >= CONFIRM_POWER_SECONDS:
                state["confirmed"] = observed
                state["candidate"] = None
                state["candidate_at"] = None
                if observed:
                    if state.get("outage_confirmed") and state.get("outage_alerted"):
                        self.store.event("power_restored", "Bluetti", "Corriente", "✅ Volvió la corriente. Entrada AC estable durante 5 minutos.", f"power-restored:{item['id']}")
                        state["quiet_until"] = now.timestamp() + POWER_GROUP_SECONDS
                    state["outage_confirmed"] = False
                    state["outage_alerted"] = False
                else:
                    state["outage_confirmed"] = True
                    if now.timestamp() >= state.get("quiet_until", 0):
                        self._outage_alert(state, item["id"])
        soc = int(item["battery_percent"])
        if soc <= 98:
            state["battery_armed"] = True
        elif soc == 100 and state.get("battery_armed"):
            self.store.event("battery_full", "Bluetti", "Batería", "🔋 La batería llegó al 100 %.", f"battery-full:{item['id']}")
            state["battery_armed"] = False
        self._deferred_outage(state, now)
        self.store.set("power", state)

    def _outage_alert(self, state: dict, sample_id: int):
        self.store.event("power_out", "Bluetti", "Corriente", "⚡ Se fue la corriente. La entrada AC lleva 5 minutos sin señal.", f"power-out:{sample_id}")
        state["outage_alerted"] = True

    def _deferred_outage(self, state: dict, now: datetime):
        if state.get("outage_confirmed") and state.get("confirmed") is False and not state.get("outage_alerted") and now.timestamp() >= state.get("quiet_until", 0):
            self._outage_alert(state, state.get("last_sample", 0))
            self.store.set("power", state)

    def poll_dashboard_downloads(self):
        jobs = self.get_json(self.config["DASHBOARD_API_URL"] + "/downloads")
        seeded = self.store.get("dashboard_downloads_seeded", False)
        for job in jobs:
            if job["state"] not in ("done", "failed") or not job.get("finished_at"):
                continue
            rule = "download_done" if job["state"] == "done" else "download_failed"
            key = f"dashboard:{job['id']}:{job['state']}:{job['finished_at']}"
            if not seeded:
                self.store.set("seen:" + key, True)
            elif not self.store.get("seen:" + key):
                verb = "terminó" if job["state"] == "done" else "falló"
                detail = f"\nMotivo: {job['error'][:200]}" if job["state"] == "failed" and job.get("error") else ""
                self.store.event(rule, "Tools Downloads", job["name"], f"📥 La descarga {verb}: {job['name']}{detail}", key)
                self.store.set("seen:" + key, True)
        if not seeded:
            self.store.set("dashboard_downloads_seeded", True)

    def poll_localtube_downloads(self):
        cursor = self.store.get("localtube_cursor")
        now = utcnow()
        if cursor is None:
            self.store.set("localtube_cursor", iso(now))
            return
        since = iso(timestamp(cursor) - timedelta(seconds=2))
        offset = 0
        while True:
            query = f"?since={quote(since)}&offset={offset}&limit=100"
            jobs = self.get_json(self.config["LOCALTUBE_API_URL"] + "/api/stats/downloads/terminal" + query,
                                 {"X-Service-Token": self.config["LOCALTUBE_SERVICE_TOKEN"]})
            for job in jobs:
                status = job["status"]
                rule = "download_done" if status == "completed" else "download_failed"
                key = f"localtube:{job['id']}:{status}:{job['updated_at']}"
                if not self.store.get("seen:" + key):
                    title = job.get("title") or job.get("youtube_id") or "Video"
                    verb = "terminó" if status == "completed" else "falló"
                    detail = f"\nMotivo: {job['error'][:200]}" if status == "failed" and job.get("error") else ""
                    self.store.event(rule, "LocalTube", title, f"🎬 La descarga {verb}: {title}{detail}", key)
                    self.store.set("seen:" + key, True)
            offset += len(jobs)
            if len(jobs) < 100:
                break
        self.store.set("localtube_cursor", iso(now))

    def poll_containers(self):
        projects = self.get_json(self.config["AGENT_URL"] + "/projects")
        now = time.time()
        known = self.store.get("containers", {})
        seen = set()
        skipped = set()
        for project in projects:
            name = project["name"]
            action = project.get("action") or {}
            # A stop requested in the dashboard is an alertable outage too. Only
            # starts, restarts and deployments get a maintenance grace period.
            manual_stop = action.get("name") == "stop"
            maintenance = bool(project.get("updating")) or (action.get("state") == "pending" and not manual_stop)
            if maintenance:
                self.store.set(f"maintenance:{name}", now + MAINTENANCE_GRACE_SECONDS)
            if maintenance or (not manual_stop and now < self.store.get(f"maintenance:{name}", 0)):
                skipped.add(name)
                continue
            for container in project["service"].get("containers", []):
                key = name + "/" + container["name"]
                seen.add(key)
                healthy = container["status"] == "running" and container.get("health") in (None, "healthy")
                self._container_transition(known, key, healthy, now, container)
        for key in list(known):
            name = key.split("/", 1)[0]
            if key not in seen and name not in skipped and now >= self.store.get(f"maintenance:{name}", 0):
                self._container_transition(known, key, False, now, {"status": "missing", "health": None})
        self.store.set("containers", known)

    def _container_transition(self, known: dict, key: str, healthy: bool, now: float, detail: dict):
        state = known.get(key)
        if state is None:
            known[key] = {"healthy": healthy, "candidate": None, "since": now, "alerted": False}
            return
        if state["healthy"] == healthy:
            state["candidate"] = None
            return
        if state.get("candidate") != healthy:
            state["candidate"] = healthy
            state["since"] = now
            return
        if now - state["since"] < CONFIRM_CONTAINER_SECONDS:
            return
        state["healthy"] = healthy
        state["candidate"] = None
        if not healthy:
            state["alerted"] = True
            self.store.event("container_down", "Docker", key,
                             f"🔴 Contenedor caído: {key} ({detail['status']}, {detail.get('health') or 'sin healthcheck'}).",
                             f"container-down:{key}:{int(now)}")
        elif state.get("alerted"):
            state["alerted"] = False
            self.store.event("container_restored", "Docker", key,
                             f"🟢 Contenedor recuperado: {key}.", f"container-restored:{key}:{int(now)}")

    def send_due(self):
        row = self.store.claim_due()
        if not row:
            return
        command = [self.config["OPENCLAW_BIN"], "message", "send", "--channel", "telegram", "--target",
                   self.config["TELEGRAM_CHAT_ID"], "--message", row["message"], "--json"]
        try:
            result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=120,
                                    env={**os.environ, "OPENCLAW_STATE_DIR": self.config["OPENCLAW_STATE_DIR"]})
            try:
                output = json.loads(result.stdout) if result.stdout.strip().startswith("{") else {}
            except ValueError:
                output = {}
            if output.get("ok") is False:
                raise RuntimeError(output.get("error") or result.stderr.strip() or "OpenClaw rechazó el envío")
            if result.returncode != 0:
                self.store.uncertain(row["id"], result.stderr.strip() or "OpenClaw terminó con error; Telegram podría haber recibido el aviso.")
                return
            message_id = output.get("messageId") or output.get("message_id") or output.get("id")
            if not message_id and output.get("ok") is not True:
                self.store.uncertain(row["id"], "OpenClaw terminó sin confirmar el envío; comprueba Telegram.")
                return
            self.store.delivered(row["id"], str(message_id) if message_id else None)
        except subprocess.TimeoutExpired:
            self.store.uncertain(row["id"], "OpenClaw agotó el tiempo de espera; Telegram podría haber recibido el aviso.")
        except (OSError, RuntimeError) as error:
            self.store.failed(row["id"], str(error))


def config_from_env():
    required = ("EVENTS_API_TOKEN", "LOCALTUBE_SERVICE_TOKEN", "TELEGRAM_CHAT_ID")
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError("Missing event service configuration: " + ", ".join(missing))
    return {
        "EVENTS_API_TOKEN": os.environ["EVENTS_API_TOKEN"],
        "LOCALTUBE_SERVICE_TOKEN": os.environ["LOCALTUBE_SERVICE_TOKEN"],
        "TELEGRAM_CHAT_ID": os.environ["TELEGRAM_CHAT_ID"],
        "BLUETTI_API_URL": os.environ.get("EVENTS_BLUETTI_API_URL", "http://127.0.0.1:3001").rstrip("/"),
        "DASHBOARD_API_URL": os.environ.get("EVENTS_DASHBOARD_API_URL", "http://127.0.0.1:3021").rstrip("/"),
        "LOCALTUBE_API_URL": os.environ.get("EVENTS_LOCALTUBE_API_URL", "http://127.0.0.1:3005").rstrip("/"),
        "AGENT_URL": os.environ.get("EVENTS_AGENT_URL", "http://127.0.0.1:3022").rstrip("/"),
        "OPENCLAW_BIN": os.environ.get("OPENCLAW_BIN", "openclaw"),
        "OPENCLAW_STATE_DIR": os.environ.get("OPENCLAW_STATE_DIR", str(Path.home() / ".openclaw")),
    }


def make_handler(monitor: Monitor):
    class Handler(BaseHTTPRequestHandler):
        def handle_request(self, method: str):
            if not hmac.compare_digest(self.headers.get("X-Events-Token", ""), monitor.config["EVENTS_API_TOKEN"]):
                return self.respond(403, {"detail": "Forbidden"})
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)
            if method == "GET" and path == "/events":
                try:
                    limit = max(1, min(100, int(query.get("limit", ["30"])[0])))
                    offset = max(0, int(query.get("offset", ["0"])[0]))
                except ValueError:
                    return self.respond(400, {"detail": "Invalid pagination"})
                return self.respond(200, monitor.store.list_events(limit, offset))
            if method == "GET" and path == "/rules":
                return self.respond(200, monitor.store.rules())
            parts = path.strip("/").split("/")
            if method == "POST" and len(parts) == 3 and parts[0] == "rules" and parts[2] in ("enable", "disable"):
                if parts[1] not in RULES:
                    return self.respond(404, {"detail": "Unknown rule"})
                monitor.store.set_rule(parts[1], parts[2] == "enable")
                return self.respond(200, {"id": parts[1], "enabled": parts[2] == "enable"})
            if method == "POST" and path == "/test":
                monitor.store.event("test", "Sistema", "Prueba", "🔔 Prueba de alertas del home server.", f"test:{time.time_ns()}", force=True)
                return self.respond(202, {"status": "queued"})
            return self.respond(404, {"detail": "Not Found"})

        def respond(self, status: int, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.handle_request("GET")

        def do_POST(self):
            self.handle_request("POST")

        def log_message(self, fmt, *args):
            if args and str(args[1]).startswith(("4", "5")):
                print(fmt % args, file=sys.stderr)

    return Handler


def main():
    config = config_from_env()
    state_dir = Path(os.environ.get("EVENTS_STATE_DIR", str(Path.home() / ".local/state/home-server-events")))
    monitor = Monitor(Store(state_dir / "events.sqlite3"), config)
    def run():
        while True:
            started = time.monotonic()
            monitor.tick()
            time.sleep(max(1, POLL_SECONDS - (time.monotonic() - started)))
    threading.Thread(target=run, daemon=True).start()
    server = ThreadingHTTPServer((os.environ.get("EVENTS_BIND", "0.0.0.0"), int(os.environ.get("EVENTS_PORT", "3023"))), make_handler(monitor))
    print(f"home-server-events on :{server.server_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
