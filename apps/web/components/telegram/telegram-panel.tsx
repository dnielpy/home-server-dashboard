"use client";

import { useEffect, useRef, useState } from "react";

import { Badge, Card, CardSkeleton } from "@/components/dashboard/card";
import { ClockIcon } from "@/components/icons/clock-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { TelegramIcon } from "@/components/icons/telegram-icon";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { Panel } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";
import { formatCommitDate, formatElapsed } from "@/lib/format";
import { callTelegram, type TelegramCommand, type TelegramStatus } from "@/lib/telegram-api";

const STATES = {
  unconfigured: { label: "Sin configurar", tone: "zinc" },
  connecting: { label: "Conectando", tone: "sky" },
  connected: { label: "Conectado", tone: "green" },
  reconnecting: { label: "Reconectando", tone: "amber" },
  error: { label: "Error", tone: "red" },
  stopped: { label: "Detenido", tone: "zinc" },
} as const;

function elapsed(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  return formatElapsed(seconds * 1000);
}

function Callout({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div role={error ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300" : "border-sky-500/20 bg-sky-500/5 text-sky-800 dark:text-sky-200"}`}>
      {children}
    </div>
  );
}

export function TelegramPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [commands, setCommands] = useState<TelegramCommand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [age, setAge] = useState(0);
  const receivedAt = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const clock = setInterval(() => setAge(Math.max(0, (Date.now() - receivedAt.current) / 1000)), 1000);
    async function poll() {
      const currentRevision = revision.current;
      try {
        const [nextStatus, nextCommands] = await Promise.all([
          callTelegram<TelegramStatus>("status", { signal: controller.signal }),
          callTelegram<TelegramCommand[]>("commands", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setStatus(nextStatus);
        // An older poll cannot undo the result of a newer toggle.
        if (revision.current === currentRevision) setCommands(nextCommands);
        receivedAt.current = Date.now();
        setAge(0);
        setError(null);
      } catch {
        if (controller.signal.aborted) return;
        setError("No se pudo conectar con la API. Se reintentará automáticamente.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      mounted.current = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, []);

  async function toggle(command: TelegramCommand) {
    if (saving) return;
    revision.current += 1;
    setSaving(command.name);
    setSaveError(null);
    try {
      const updated = await callTelegram<TelegramCommand>(`commands/${command.name}`, { body: { enabled: !command.enabled } });
      if (!mounted.current) return;
      setCommands((current) => current?.map((item) => item.name === updated.name ? updated : item) ?? [updated]);
      setStatus((current) => current ? { ...current, menu_synced: false } : current);
    } catch (err) {
      if (mounted.current) setSaveError(err instanceof Error ? err.message : "No se pudo guardar el comando.");
    } finally {
      revision.current += 1;
      if (mounted.current) setSaving(null);
    }
  }

  if (!status || !commands) {
    return (
      <div className="flex flex-col gap-5" aria-busy={!error}>
        {error && <Callout error>{error}</Callout>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <CardSkeleton key={key} />)}</div>
        <div className="glass shimmer h-56 rounded-3xl" />
      </div>
    );
  }

  const state = STATES[status.state];
  const uptime = status.uptime_seconds + (status.started_at && status.state !== "stopped" && !error ? age : 0);

  return (
    <div className="flex flex-col gap-5">
      {error && <Callout error>{error} Mostrando los últimos datos recibidos.</Callout>}
      {status.missing_settings.length > 0 && (
        <Callout>
          Configuración pendiente. Añade <span className="break-all font-mono">{status.missing_settings.join(" y ")}</span> en el servidor y reinicia la API. Después, abre el bot en Telegram y envía /stats.
        </Callout>
      )}
      {status.error && <Callout error>{status.error}</Callout>}
      <Reveal index={1}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card title="Bot" Icon={TelegramIcon} accent="sky" badge={<Badge tone={state.tone} live={status.state === "connected" && !error}>{state.label}</Badge>}>
            <p className="mt-auto truncate text-xl font-semibold text-foreground">{status.bot_name ?? "Telegram"}</p>
            {status.bot_username ? (
              <a href={`https://t.me/${encodeURIComponent(status.bot_username)}`} target="_blank" rel="noreferrer" className="mt-1 truncate text-sm text-sky-600 hover:underline dark:text-sky-400">@{status.bot_username} ↗</a>
            ) : <p className="mt-1 text-sm text-muted">Usuarios autorizados · chats privados</p>}
          </Card>
          <Card title="Tiempo activo" Icon={ClockIcon} accent="emerald" footer="Desde el último inicio del bot">
            <p className="mt-auto text-3xl font-semibold tracking-tight text-foreground tabular-nums">{status.started_at ? elapsed(uptime) : "—"}</p>
          </Card>
          <Card title="Último inicio" Icon={RefreshIcon} accent="violet" footer="Hora local del dashboard">
            <p className="mt-auto text-lg font-semibold text-foreground tabular-nums">{status.started_at ? formatCommitDate(Date.parse(status.started_at) / 1000) : "—"}</p>
          </Card>
          <Card title="Peticiones totales" Icon={TrafficIcon} accent="amber" footer="Histórico conservado tras reinicios">
            <p className="mt-auto text-3xl font-semibold tracking-tight text-foreground tabular-nums">{status.total_requests.toLocaleString("es")}</p>
          </Card>
        </div>
      </Reveal>
      <Reveal index={2}>
        <Panel id="telegram-commands" title="Comandos" subtitle="Activa o desactiva las funciones disponibles en Telegram." Icon={TelegramIcon} accent="sky">
          {saveError && <div className="mb-4"><Callout error>{saveError}</Callout></div>}
          <div className="divide-y divide-surface-border">
            {commands.map((command) => (
              <div key={command.name} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="font-mono text-base font-semibold text-foreground">/{command.name}</h3>
                    <Badge tone={command.enabled ? "green" : "zinc"}>{command.enabled ? "Habilitado" : "Deshabilitado"}</Badge>
                  </div>
                  <p className="max-w-2xl text-sm text-muted">{command.description}</p>
                </div>
                <button type="button" role="switch" aria-checked={command.enabled} aria-label={`${command.enabled ? "Desactivar" : "Activar"} /${command.name}`} disabled={saving !== null || error !== null} onClick={() => void toggle(command)} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500 disabled:cursor-wait disabled:opacity-50 ${command.enabled ? "bg-sky-500" : "bg-track ring-1 ring-inset ring-surface-border"}`}>
                  <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${command.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-surface-border pt-4 text-xs text-muted" role="status">
            {saving ? "Guardando cambio…" : status.missing_settings.length > 0 ? "Los comandos se guardan aunque el bot todavía no esté configurado." : !status.menu_synced ? "Los cambios ya se aplican aquí; el menú de Telegram se sincronizará al conectar." : "Menú de Telegram sincronizado. Los comandos deshabilitados tampoco se ejecutan al escribirlos manualmente."}
          </p>
        </Panel>
      </Reveal>
      <p className="px-1 text-xs text-muted">El bot necesita internet en casa para recibir y responder mensajes. Al recuperar la conexión atenderá las consultas pendientes.</p>
    </div>
  );
}
