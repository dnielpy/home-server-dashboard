"use client";

import { useCallback, useEffect, useState } from "react";

import { type PetMessage, petApi } from "@/components/pet/api";
import { usePetFrame } from "@/components/pet/frame";

const MAX_LENGTH = 140;
const secondary = "rounded-xl border border-surface-border px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40";

export function PetMessages() {
  const [messages, setMessages] = useState<PetMessage[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = usePetFrame();

  const load = useCallback(async () => {
    try {
      setMessages(await petApi<PetMessage[]>("/messages"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los mensajes");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (await run(() => petApi("/messages", { method: "POST", body: JSON.stringify({ text }) }))) setText("");
  }

  async function saveEdit(id: number) {
    if (await run(() => petApi(`/messages/${id}`, { method: "PATCH", body: JSON.stringify({ text: editText }) }))) {
      setEditingId(null);
    }
  }

  const show = (message: string) => void preview.play({ type: "message", text: message });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,480px)]">
      <section className="glass space-y-4 rounded-3xl p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Mensajes del cartel</h2>
          <p className="text-sm text-muted">
            Una de cada cinco escenas de /pet es Astro sacando un cartel con uno de estos mensajes, al azar. Astro
            también deja los suyos de vez en cuando.
          </p>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            value={text}
            maxLength={MAX_LENGTH}
            rows={2}
            onChange={(event) => setText(event.target.value)}
            placeholder="¡Buenos días! Hoy toca regar las plantas 🌱"
            className="min-w-0 flex-1 resize-none rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/50"
          />
          <div className="flex gap-2 sm:flex-col">
            <button type="button" disabled={busy || !text.trim()} onClick={() => void add()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Añadir
            </button>
            <button type="button" disabled={!preview.ready || !text.trim()} onClick={() => show(text)} className={secondary}>
              Vista previa
            </button>
          </div>
        </div>
        <p className="text-right text-xs text-muted">{text.length}/{MAX_LENGTH}</p>
        {messages.length === 0 && <p className="text-sm text-muted">Todavía no hay mensajes.</p>}
        <ul className="space-y-2">
          {messages.map((message) => (
            <li key={message.id} className="rounded-2xl border border-surface-border p-3">
              {editingId === message.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    maxLength={MAX_LENGTH}
                    rows={2}
                    onChange={(event) => setEditText(event.target.value)}
                    className="block w-full resize-none rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/50"
                  />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !editText.trim()} onClick={() => void saveEdit(message.id)} className={secondary}>
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className={secondary}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className={`min-w-0 flex-1 text-sm ${message.enabled ? "" : "text-muted line-through"}`}>
                    {message.source === "ai" && (
                      <span className="mr-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-500">Astro</span>
                    )}
                    {message.text}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={!preview.ready} onClick={() => show(message.text)} className={secondary}>
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(message.id);
                        setEditText(message.text);
                      }}
                      className={secondary}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          petApi(`/messages/${message.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ enabled: !message.enabled }),
                          }),
                        )
                      }
                      className={secondary}
                    >
                      {message.enabled ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("¿Borrar este mensaje?")) {
                          void run(() => petApi(`/messages/${message.id}`, { method: "DELETE" }));
                        }
                      }}
                      className={`${secondary} text-red-600`}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="glass h-fit space-y-3 rounded-3xl p-4">
        <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#04050d]">{preview.frame}</div>
        <p className="text-center text-xs text-muted">Pulsa «Ver» para probar cómo se ve un mensaje en el cartel.</p>
      </section>
    </div>
  );
}
