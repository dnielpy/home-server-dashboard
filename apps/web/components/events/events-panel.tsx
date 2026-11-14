"use client";

import { useCallback, useEffect, useState } from "react";

import { BellIcon } from "@/components/icons/bell-icon";
import { Panel, PanelEmpty } from "@/components/ui/panel";

type Rule = { id: string; label: string; enabled: boolean };
type Event = {
  id: number;
  rule: string;
  source: string;
  subject: string;
  message: string;
  occurred_at: string;
  delivery_status: "pending" | "retry" | "sent";
  attempts: number;
  last_error: string | null;
};
type EventPage = { items: Event[]; total: number };

async function api<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const response = await fetch(`/api/events${path}`, { method, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Events API answered ${response.status}`);
  return body as T;
}

export function EventsPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<EventPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextRules, nextEvents] = await Promise.all([
        api<Rule[]>("/rules"), api<EventPage>(`?limit=30&offset=${offset}`),
      ]);
      setRules(nextRules);
      setEvents(nextEvents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events");
    }
  }, [offset]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  async function toggle(rule: Rule) {
    setBusy(rule.id);
    setNotice(null);
    try {
      await api(`/rules/${rule.id}/${rule.enabled ? "disable" : "enable"}`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update alert");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setNotice(null);
    try {
      await api("/test", "POST");
      setNotice("Test alert queued. Delivery will appear in the history shortly.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue test alert");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel id="event-rules" title="Telegram alerts" subtitle="Choose which changes send a message" Icon={BellIcon} accent="sky"
        actions={<button type="button" onClick={test} disabled={busy !== null} className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-sky-500/30 disabled:opacity-50 dark:text-sky-300">Send test</button>}>
        {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
        {notice && <p role="status" className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rules.map((rule) => (
            <label key={rule.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3 text-sm">
              <span>{rule.label}</span>
              <input type="checkbox" checked={rule.enabled} disabled={busy !== null} onChange={() => void toggle(rule)} className="h-4 w-4 accent-sky-500" />
            </label>
          ))}
        </div>
      </Panel>
      <Panel id="event-history" title="History" subtitle={events ? `${events.total} events` : "Loading…"} Icon={BellIcon} accent="violet">
        {events?.items.length === 0 && <PanelEmpty height={120}>No alerts yet.</PanelEmpty>}
        <ol className="flex flex-col gap-2">
          {events?.items.map((event) => (
            <li key={event.id} className="rounded-xl border border-surface-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{event.subject} <span className="font-normal text-muted">· {event.source}</span></div>
                <span className="text-xs text-muted">{new Date(event.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{event.message}</p>
              <p className={`mt-2 text-xs font-medium ${event.delivery_status === "sent" ? "text-emerald-600 dark:text-emerald-400" : event.delivery_status === "retry" ? "text-amber-600 dark:text-amber-400" : "text-muted"}`}>
                {event.delivery_status === "sent" ? "Sent to Telegram" : event.delivery_status === "retry" ? `Retrying (${event.attempts} attempts)` : "Pending delivery"}
                {event.last_error && ` · ${event.last_error}`}
              </p>
            </li>
          ))}
        </ol>
        {events && (offset > 0 || offset + events.items.length < events.total) && (
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={offset === 0} className="rounded-lg px-3 py-1.5 text-sm text-sky-600 ring-1 ring-surface-border disabled:opacity-40 dark:text-sky-400" onClick={() => setOffset((value) => Math.max(0, value - 30))}>Newer</button>
            <button type="button" disabled={offset + events.items.length >= events.total} className="rounded-lg px-3 py-1.5 text-sm text-sky-600 ring-1 ring-surface-border disabled:opacity-40 dark:text-sky-400" onClick={() => setOffset((value) => value + 30)}>Older</button>
          </div>
        )}
      </Panel>
    </div>
  );
}
