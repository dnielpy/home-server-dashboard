"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/dashboard/card";
import { UsersIcon } from "@/components/icons/users-icon";
import { Panel, PanelEmpty, PanelSkeleton } from "@/components/ui/panel";
import {
  callTelegram, type TelegramCandidate, type TelegramEnrollment, type TelegramStatus, type TelegramUser,
} from "@/lib/telegram-api";

type Snapshot = { status: TelegramStatus; users: TelegramUser[]; enrollment: TelegramEnrollment };
const BUTTON = "rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45";
const PRIMARY = `${BUTTON} bg-sky-500 text-white hover:bg-sky-600`;
const SECONDARY = `${BUTTON} glass text-foreground hover:bg-surface-hover`;
const DANGER = `${BUTTON} bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400`;

async function readSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const [status, users, enrollment] = await Promise.all([
    callTelegram<TelegramStatus>("status", { signal }),
    callTelegram<TelegramUser[]>("users", { signal }),
    callTelegram<TelegramEnrollment>("enrollment", { signal }),
  ]);
  return { status, users, enrollment };
}

function CandidateForm({ candidate, busy, onSave }: {
  candidate: TelegramCandidate;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && !busy) onSave(name.trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="font-semibold text-foreground">Usuario detectado</p>
        <p className="mt-1 break-words text-sm text-muted">
          {candidate.telegram_name ?? "Usuario de Telegram"}
          {candidate.username ? ` · @${candidate.username}` : ""}
          <span className="mt-1 block font-mono text-xs">ID: {candidate.user_id}</span>
        </p>
      </div>
      <p className="text-sm text-muted">La ventana se ha cerrado. Escribe un nombre para completar el registro y permitir que el bot le responda.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-foreground">
          Nombre
          <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} placeholder="Ej. Mamá" className="w-full rounded-xl border border-surface-border bg-background/50 px-3 py-2.5 font-normal outline-none focus:border-sky-500 disabled:opacity-50" />
        </label>
        <button type="submit" className={`${PRIMARY} sm:mb-0.5`} disabled={busy || !name.trim()}>{busy ? "Guardando…" : "Guardar usuario"}</button>
      </div>
    </form>
  );
}

export function TelegramUsers() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [deleting, setDeleting] = useState<number | null>(null);
  const active = useRef(false);
  const operating = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    async function poll() {
      const current = revision.current;
      let delay = 5000;
      try {
        const next = await readSnapshot(controller.signal);
        if (controller.signal.aborted) return;
        if (next.enrollment.state !== "closed") delay = 1000;
        if (current === revision.current && !operating.current) {
          setData(next);
          setNow(Date.now());
          setError(null);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (current === revision.current && !operating.current) setError("No se pudieron cargar los usuarios. Se reintentará automáticamente.");
      }
      timer = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      active.current = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, []);

  async function perform(action: () => Promise<unknown>) {
    if (operating.current) return;
    operating.current = true;
    revision.current += 1;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      const next = await readSnapshot();
      if (!active.current) return;
      setData(next);
      setNow(Date.now());
      setDeleting(null);
      setError(null);
    } catch (err) {
      if (active.current) setActionError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      revision.current += 1;
      operating.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (!data) {
    return <div className="flex flex-col gap-4">{error && <p role="alert" className="text-sm text-red-500">{error}</p>}<PanelSkeleton height={260} /></div>;
  }

  const { status, users, enrollment } = data;
  const candidate = enrollment.candidate;
  const remaining = enrollment.expires_at ? Math.max(0, Math.ceil((Date.parse(enrollment.expires_at) - now) / 1000)) : 0;
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const disabled = busy || error !== null;
  const canOpen = status.state === "connected" && enrollment.state === "closed";

  return (
    <div className="flex flex-col gap-5">
      {(error || actionError) && <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">{actionError ?? error}</p>}
      {status.state !== "connected" && <p role="status" className="rounded-2xl border border-surface-border px-4 py-3 text-sm text-muted">El bot debe estar conectado para agregar usuarios. {status.error ?? (status.missing_settings.length ? "Configura TELEGRAM_BOT_TOKEN en el servidor y reinicia la API." : "Esperando la conexión con Telegram.")}</p>}
      <Panel id="telegram-users" title="Usuarios permitidos" subtitle="El bot responde únicamente en los chats privados de estos usuarios." Icon={UsersIcon} accent="sky" actions={
        <button type="button" className={PRIMARY} disabled={disabled || !canOpen} onClick={() => void perform(() => callTelegram("enrollment", { method: "POST" }))}>Agregar usuario</button>
      }>
        {enrollment.state !== "closed" && (
          <div className="mb-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:p-5">
            {enrollment.state === "waiting" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">Esperando /add</p>
                  <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 font-mono text-lg text-sky-600 tabular-nums dark:text-sky-300" aria-label="Tiempo restante">{countdown}</span>
                </div>
                <p className="text-sm text-muted">Desde la cuenta que quieres agregar, abre {status.bot_username ? <a className="break-all text-sky-600 underline dark:text-sky-300" href={`https://t.me/${encodeURIComponent(status.bot_username)}`} target="_blank" rel="noreferrer">@{status.bot_username}</a> : "el bot"} y envía <strong className="font-mono text-foreground">/add</strong> por privado.</p>
                <p className="text-xs text-muted">La ventana se cierra al detectar el primer /add o al cumplirse cinco minutos. Después tendrás que asignarle un nombre.</p>
              </div>
            ) : candidate && (
              <CandidateForm key={candidate.user_id} candidate={candidate} busy={disabled} onSave={(name) => void perform(() => callTelegram("users", { method: "POST", body: { user_id: candidate.user_id, name } }))} />
            )}
            <button type="button" disabled={disabled} className={`${SECONDARY} mt-4`} onClick={() => void perform(() => callTelegram("enrollment", { method: "DELETE" }))}>Cancelar registro</button>
          </div>
        )}
        {enrollment.notice && <p role="status" className="mb-4 text-sm text-muted">{enrollment.notice}</p>}
        {users.length === 0 ? <PanelEmpty height={140}>Todavía no hay usuarios permitidos.</PanelEmpty> : (
          <ul className="divide-y divide-surface-border">
            {users.map((user) => (
              <li key={user.user_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-foreground">{user.name}</h3><Badge tone="green">Permitido</Badge></div>
                  <p className="mt-1 break-words text-sm text-muted">{user.telegram_name}{user.username ? ` · @${user.username}` : ""}</p>
                  <p className="mt-1 font-mono text-xs text-muted">ID: {user.user_id}</p>
                </div>
                {deleting === user.user_id ? (
                  <div className="flex flex-wrap items-center gap-2"><p className="w-full text-xs text-muted">¿Quitar su acceso?</p><button type="button" disabled={disabled} className={DANGER} onClick={() => void perform(() => callTelegram(`users/${user.user_id}`, { method: "DELETE" }))}>Confirmar eliminación</button><button type="button" disabled={disabled} className={SECONDARY} onClick={() => setDeleting(null)}>Cancelar</button></div>
                ) : <button type="button" disabled={disabled} className={`${DANGER} self-start sm:self-auto`} aria-label={`Eliminar a ${user.name}`} onClick={() => setDeleting(user.user_id)}>Eliminar</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="px-1 text-xs text-muted">Los usuarios se conservan tras reiniciar. Eliminar a alguien retira su acceso de inmediato. Reiniciar la API cancela cualquier registro pendiente.</p>
    </div>
  );
}
