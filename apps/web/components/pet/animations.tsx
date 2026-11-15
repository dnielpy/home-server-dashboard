"use client";

import { useCallback, useEffect, useState } from "react";

import { ANIMATION_MS, type PetAnimation, type PetGeneration, petApi } from "@/components/pet/api";
import { usePetFrame } from "@/components/pet/frame";

const SOURCE_LABEL: Record<PetAnimation["source"], string> = { seed: "Inicial", ai: "Astro", manual: "Manual" };
const GENERATION_LABEL: Record<PetGeneration["status"], string> = {
  sent: "Pedida, esperando a Astro",
  saved: "Guardada",
  failed: "Falló",
};
const NEW_CODE = `face.set("happy");
await animate("head", [{ rotate: "0deg" }, { rotate: "10deg" }, { rotate: "0deg" }], 800);
fx.burst("stars");
`;

const input =
  "mt-1 block w-full rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-violet-500/50";
const primary = "rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-xl border border-surface-border px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-40";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
}

export function PetAnimations() {
  const [animations, setAnimations] = useState<PetAnimation[]>([]);
  const [generations, setGenerations] = useState<PetGeneration[]>([]);
  const [selected, setSelected] = useState<PetAnimation | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const preview = usePetFrame();

  const load = useCallback(async () => {
    try {
      const [fresh, history] = await Promise.all([
        petApi<PetAnimation[]>("/animations"),
        petApi<PetGeneration[]>("/generations"),
      ]);
      setAnimations(fresh);
      setGenerations(history);
      setError(null);
      return fresh;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las animaciones");
      return null;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    // Picks up the animations Astro saves while the page is open
    const refresh = setInterval(() => void load(), 30_000);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [load]);

  function open(animation: PetAnimation | null) {
    setCreating(animation === null);
    setSelected(animation);
    setTitle(animation?.title ?? "");
    setCode(animation?.code ?? NEW_CODE);
    setNotice(null);
    setError(null);
  }

  async function playPreview() {
    setPlaying(true);
    setError(null);
    const result = await preview.play({ type: "play", code, duration: ANIMATION_MS });
    setPlaying(false);
    if (!result.ok) setError(`La animación falló: ${result.message}`);
  }

  async function run(action: () => Promise<PetAnimation | void>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await action();
      const fresh = await load();
      if (saved) {
        setCreating(false);
        setSelected(fresh?.find((a) => a.id === saved.id) ?? saved);
      }
      setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(
      () =>
        creating
          ? petApi<PetAnimation>("/animations", { method: "POST", body: JSON.stringify({ title, code }) })
          : petApi<PetAnimation>(`/animations/${selected!.id}`, {
              method: "PATCH",
              body: JSON.stringify({ title, code }),
            }),
      creating ? "Animación creada. /pet la reproducirá en su próxima vuelta." : "Cambios guardados.",
    );

  const toggle = () =>
    run(
      () =>
        petApi<PetAnimation>(`/animations/${selected!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !selected!.enabled }),
        }),
      selected!.enabled ? "Animación desactivada." : "Animación activada.",
    );

  async function remove() {
    if (!selected || !window.confirm(`¿Borrar "${selected.title}"?`)) return;
    await run(() => petApi<void>(`/animations/${selected.id}`, { method: "DELETE" }), "Animación borrada.");
    setSelected(null);
  }

  const generate = () =>
    run(
      () => petApi<void>("/generate", { method: "POST" }),
      "Le pedí una animación nueva a Astro; aparecerá aquí cuando la guarde (suele tardar unos minutos).",
    );

  const query = search.toLowerCase();
  const visible = animations.filter((a) => a.title.toLowerCase().includes(query));
  const enabledCount = animations.filter((a) => a.enabled).length;
  const changed = creating || (selected !== null && (title !== selected.title || code !== selected.code));
  const editing = creating || selected !== null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
      <section className="glass flex flex-col gap-3 rounded-3xl p-4">
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar animaciones"
            className="min-w-0 flex-1 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/50"
          />
          <button type="button" onClick={() => open(null)} className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white">
            + Nueva
          </button>
        </div>
        <p className="text-xs text-muted">
          {enabledCount} de {animations.length} activas · <a href="/pet" target="_blank" className="underline">Abrir /pet</a>
        </p>
        <div className="max-h-[52vh] space-y-1 overflow-y-auto">
          {visible.map((animation) => (
            <button
              key={animation.id}
              type="button"
              onClick={() => open(animation)}
              className={`block w-full rounded-xl p-3 text-left ${selected?.id === animation.id ? "bg-violet-500/15" : "hover:bg-surface-hover"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm font-semibold ${animation.enabled ? "" : "text-muted line-through"}`}>
                  {animation.title}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${animation.source === "ai" ? "bg-violet-500/15 text-violet-500" : "bg-surface text-muted"}`}
                >
                  {SOURCE_LABEL[animation.source]}
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted">
                {formatDate(animation.created_at)}
                {animation.failures > 0 && <span className="text-amber-600"> · {animation.failures} fallos</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-surface-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Pedidos a Astro</h2>
            <button type="button" disabled={busy} onClick={() => void generate()} className={secondary}>
              Generar ahora
            </button>
          </div>
          {generations.length === 0 && <p className="text-xs text-muted">Astro recibe un pedido cada 10 minutos.</p>}
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {generations.map((generation) => (
              <li key={generation.id} className="flex justify-between gap-2">
                <span className="text-muted">{formatDate(generation.started_at)}</span>
                <span
                  title={generation.detail ?? undefined}
                  className={`truncate ${generation.status === "failed" ? "text-red-600" : generation.status === "saved" ? "text-emerald-600" : ""}`}
                >
                  {GENERATION_LABEL[generation.status]}
                  {generation.status === "saved" && generation.detail ? `: ${generation.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="glass min-h-[440px] rounded-3xl p-5 sm:p-6">
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
        <div className={editing ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}>
          <div className="space-y-3">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#04050d]">{preview.frame}</div>
            {editing ? (
              <button type="button" disabled={!preview.ready || playing || !code.trim()} onClick={() => void playPreview()} className={primary}>
                {playing ? "Reproduciendo…" : "▶ Probar"}
              </button>
            ) : (
              <p className="text-center text-sm text-muted">
                Elige una animación para verla y editarla, o crea una nueva. Astro inventa una cada 10 minutos.
              </p>
            )}
          </div>
          {editing && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{creating ? "Nueva animación" : selected!.title}</h2>
                  {selected && (
                    <p className="text-xs text-muted">
                      {SOURCE_LABEL[selected.source]} · {formatDate(selected.created_at)}
                      {!selected.enabled && " · desactivada"}
                    </p>
                  )}
                </div>
                {selected && (
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void toggle()} className={secondary}>
                      {selected.enabled ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void remove()} className={`${secondary} text-red-600`}>
                      Borrar
                    </button>
                  </div>
                )}
              </div>
              <label className="block text-sm font-medium">
                Título
                <input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} className={input} />
              </label>
              <label className="block text-sm font-medium">
                Código
                <textarea
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  rows={18}
                  spellCheck={false}
                  className="mt-1 block w-full resize-y rounded-xl border border-surface-border bg-surface p-4 font-mono text-xs leading-6 outline-none focus:border-violet-500/50"
                />
              </label>
              <p className="text-xs text-muted">
                El cuerpo de una función async con <code>astro</code>, <code>face</code>, <code>animate</code>, <code>fx</code>,{" "}
                <code>stage</code>, <code>sign</code> y <code>wait</code>. La guía completa está en{" "}
                <a href="/api/pet/guide" target="_blank" className="underline">/api/pet/guide</a>.
              </p>
              <button type="button" disabled={busy || !changed || !title.trim() || !code.trim()} onClick={() => void save()} className={primary}>
                {creating ? "Crear animación" : "Guardar cambios"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
