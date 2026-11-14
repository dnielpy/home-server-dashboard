import json
import subprocess
import tempfile
import threading
import unittest
from datetime import UTC, datetime, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import events


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = events.Store(Path(self.tmp.name) / "events.sqlite3")
        self.config = {
            "BLUETTI_API_URL": "http://bluetti", "DASHBOARD_API_URL": "http://dashboard",
            "LOCALTUBE_API_URL": "http://localtube", "LOCALTUBE_SERVICE_TOKEN": "secret",
            "AGENT_URL": "http://agent", "OPENCLAW_BIN": "openclaw",
            "OPENCLAW_STATE_DIR": "/state", "TELEGRAM_CHAT_ID": "123", "EVENTS_API_TOKEN": "token",
        }
        self.monitor = events.Monitor(self.store, self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def power(self, minute, ac, soc=80, age=0):
        now = datetime(2026, 11, 14, 12, 0, tzinfo=UTC) + timedelta(minutes=minute)
        date = now - timedelta(seconds=age)
        item = {"id": minute + 1, "date": events.iso(date), "ac": ac, "battery_percent": soc}
        with patch.object(events, "utcnow", return_value=now), patch.object(self.monitor, "get_json", return_value={"items": [item]}):
            self.monitor.poll_power()

    def event_rules(self):
        return [item["rule"] for item in self.store.list_events(100, 0)["items"]]

    def test_power_needs_five_fresh_minutes_and_boot_is_silent(self):
        self.power(0, False)
        self.assertEqual([], self.event_rules())
        for minute in range(1, 7):
            self.power(minute, True)
        self.power(7, False)
        self.power(12, False, age=180)
        for minute in range(13, 18):
            self.power(minute, False)
        self.assertEqual([], self.event_rules())
        self.power(18, False)
        self.assertEqual(["power_out"], self.event_rules())
        for minute in range(19, 25):
            self.power(minute, True)
        self.assertEqual(["power_restored", "power_out"], self.event_rules())

    def test_power_flaps_grouped_and_battery_once_per_cycle(self):
        self.power(0, True, 99)
        for minute in range(1, 6):
            self.power(minute, False, 99)
        self.power(6, False, 100)
        self.assertEqual({"power_out", "battery_full"}, set(self.event_rules()))
        for minute in range(7, 13):
            self.power(minute, True, 100)
        for minute in range(13, 19):
            self.power(minute, False, 100)
        self.assertEqual(1, self.event_rules().count("power_out"))
        for minute in range(19, 25):
            self.power(minute, True, 100)
        self.assertEqual(1, self.event_rules().count("power_restored"))
        self.power(25, True, 98)
        self.power(26, True, 99)
        self.assertEqual(1, self.event_rules().count("battery_full"))
        self.power(27, True, 100)
        self.assertEqual(2, self.event_rules().count("battery_full"))

    def test_downloads_seed_then_notify_terminal_states(self):
        one = {"id": "a", "name": "File", "state": "done", "finished_at": "2026-11-14T11:00:00Z"}
        with patch.object(self.monitor, "get_json", return_value=[one]):
            self.monitor.poll_dashboard_downloads()
        self.assertEqual([], self.event_rules())
        two = {"id": "b", "name": "Other", "state": "failed", "error": "bad", "finished_at": "2026-11-14T12:00:00Z"}
        with patch.object(self.monitor, "get_json", return_value=[one, two]):
            self.monitor.poll_dashboard_downloads()
            self.monitor.poll_dashboard_downloads()
        self.assertEqual(["download_failed"], self.event_rules())

    def test_failed_telegram_delivery_retries(self):
        self.store.event("battery_full", "Bluetti", "Batería", "full", "key")
        result = type("Result", (), {"returncode": 1, "stdout": json.dumps({"ok": False, "error": "offline"}), "stderr": ""})()
        with patch.object(events.subprocess, "run", return_value=result):
            self.monitor.send_due()
        item = self.store.list_events(1, 0)["items"][0]
        self.assertEqual("retry", item["delivery_status"])
        self.assertEqual("offline", item["last_error"])
        with self.store.connect() as db:
            db.execute("UPDATE events SET next_retry_at=0")
        success = type("Result", (), {"returncode": 0, "stdout": json.dumps({"ok": True, "id": 42}), "stderr": ""})()
        with patch.object(events.subprocess, "run", return_value=success):
            self.monitor.send_due()
        self.assertEqual("sent", self.store.list_events(1, 0)["items"][0]["delivery_status"])

    def test_timeout_never_retries_automatically(self):
        self.store.event("battery_full", "Bluetti", "Batería", "full", "key")
        with patch.object(events.subprocess, "run", side_effect=subprocess.TimeoutExpired("openclaw", 120)) as run:
            self.monitor.send_due()
            self.monitor.send_due()
        self.assertEqual(1, run.call_count)
        item = self.store.list_events(1, 0)["items"][0]
        self.assertEqual("uncertain", item["delivery_status"])
        self.assertEqual(1, item["attempts"])

    def test_restart_during_send_pauses_delivery(self):
        self.store.event("battery_full", "Bluetti", "Batería", "full", "key")
        self.assertIsNotNone(self.store.claim_due())
        self.store = events.Store(self.store.path)
        self.assertIsNone(self.store.claim_due())
        self.assertEqual("uncertain", self.store.list_events(1, 0)["items"][0]["delivery_status"])

    def test_container_down_recovers_and_planned_stop_is_silent(self):
        def sample(at, status, action=None):
            project = {"name": "localtube", "updating": False, "action": action,
                       "service": {"containers": [{"name": "api", "status": status, "health": "healthy" if status == "running" else None}]}}
            with patch.object(events.time, "time", return_value=at), patch.object(self.monitor, "get_json", return_value=[project]):
                self.monitor.poll_containers()

        sample(1000, "running")
        sample(1010, "exited", {"name": "stop", "state": "pending"})
        sample(1100, "exited", {"name": "stop", "state": "ok"})
        self.assertEqual([], self.event_rules())
        sample(1300, "exited")
        sample(1361, "exited")
        self.assertEqual(["container_down"], self.event_rules())
        sample(1400, "running")
        sample(1461, "running")
        self.assertEqual(["container_restored", "container_down"], self.event_rules())

    def test_private_http_api_lists_and_toggles_fixed_rules(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), events.make_handler(self.monitor))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with self.assertRaises(HTTPError) as denied:
                urlopen(base + "/rules")
            self.assertEqual(403, denied.exception.code)
            headers = {"X-Events-Token": "token"}
            with urlopen(Request(base + "/rules", headers=headers)) as response:
                self.assertEqual(7, len(json.load(response)))
            with urlopen(Request(base + "/rules/power_out/disable", headers=headers, method="POST")):
                pass
            self.assertFalse(self.store.rule_enabled("power_out"))
            with self.assertRaises(HTTPError) as invalid:
                urlopen(Request(base + "/rules/unknown/enable", headers=headers, method="POST"))
            self.assertEqual(404, invalid.exception.code)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
