"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { astroApi, messageText, type AstroMessage, type AstroSession } from "@/components/astro/api";

type ChatEvent = { sessionKey?: string; state?: string; runId?: string; deltaText?: string; replace?: boolean; message?: AstroMessage; errorMessage?: string };

export function AstroChat() {
  const [sessions, setSessions] = useState<AstroSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<AstroMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const pendingSend = useRef<{text:string;key:string}|null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const result = await astroApi<{items: AstroSession[]}>("/sessions");
      setSessions(result.items);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar Astro"); }
  }, []);

  const loadHistory = useCallback(async (id: string) => {
    const request = ++requestRef.current;
    try {
      const result = await astroApi<{messages: AstroMessage[]}>(`/sessions/${id}/history`);
      if (request === requestRef.current && selectedRef.current === id) setMessages(result.messages.filter((message) => message.display !== false && ["user","assistant"].includes(message.role)));
    } catch (err) { if (selectedRef.current === id) setError(err instanceof Error ? err.message : "No se pudo cargar el chat"); }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void refreshSessions(),0); return () => clearTimeout(timer); }, [refreshSessions]);
  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    const initial = setTimeout(() => void loadHistory(selected), 0);
    const source = new EventSource(`/api/astro/sessions/${selected}/events`);
    source.addEventListener("ready", () => { setConnected(true); setError(null); });
    source.addEventListener("chat", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as ChatEvent;
      if (payload.state === "delta") {
        setBusy(true);
        setStream((current) => {
          if (payload.message) return messageText(payload.message);
          if (payload.replace) return payload.deltaText || "";
          return current + (payload.deltaText || "");
        });
      }
      if (["final","error","aborted"].includes(payload.state || "")) {
        setBusy(false); setStream("");
        pendingSend.current = null;
        if (payload.state === "error") setError(payload.errorMessage || "Astro no pudo responder");
        void loadHistory(selected);
        void refreshSessions();
      }
    });
    source.onerror = () => { setConnected(false); void loadHistory(selected); };
    return () => { clearTimeout(initial); source.close(); selectedRef.current = null; };
  }, [selected, loadHistory, refreshSessions]);
  useEffect(() => { bottom.current?.scrollIntoView({behavior:"smooth",block:"end"}); }, [messages,stream]);
  useEffect(() => {
    if (!busy || !selected) return;
    const timer = setInterval(() => void loadHistory(selected),5000);
    return () => clearInterval(timer);
  }, [busy,selected,loadHistory]);

  async function createChat() {
    setError(null);
    try {
      const result = await astroApi<{id:string}>("/sessions",{method:"POST",body:JSON.stringify({idempotencyKey:crypto.randomUUID()})});
      await refreshSessions(); chooseChat(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el chat"); }
  }

  async function send() {
    if (!selected || !draft.trim() || !connected || busy) return;
    const text = draft.trim();
    const isFirst = messages.length === 0;
    const key = pendingSend.current?.text === text ? pendingSend.current.key : crypto.randomUUID();
    pendingSend.current = {text,key};
    setDraft(""); setBusy(true); setStream(""); setError(null);
    setMessages((current) => [...current,{role:"user",content:text,timestamp:Date.now()}]);
    try {
      await astroApi(`/sessions/${selected}/messages`,{method:"POST",body:JSON.stringify({message:text,idempotencyKey:key})});
      if (isFirst) {
        await astroApi(`/sessions/${selected}`,{method:"PATCH",body:JSON.stringify({title:text.slice(0,55)})});
        void refreshSessions();
      }
    } catch (err) {
      setBusy(false); setDraft(text); await loadHistory(selected);
      setError(err instanceof Error ? err.message : "No se pudo enviar");
    }
  }

  function chooseChat(id: string | null) {
    pendingSend.current = null;
    setMessages([]); setStream(""); setConnected(false); setBusy(false); setSelected(id);
  }

  async function rename(session: AstroSession) {
    const title = window.prompt("Nuevo nombre del chat",session.title);
    if (!title?.trim() || title.trim() === session.title) return;
    try { await astroApi(`/sessions/${session.id}`,{method:"PATCH",body:JSON.stringify({title:title.trim()})}); await refreshSessions(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo renombrar"); }
  }

  async function archive(session: AstroSession) {
    try {
      await astroApi(`/sessions/${session.id}`,{method:"PATCH",body:JSON.stringify({archived:!session.archived})});
      if (selected === session.id && !session.archived) chooseChat(null);
      await refreshSessions();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo archivar"); }
  }

  const visible = sessions.filter((session) => showArchived || !session.archived);
  return <section className="glass flex min-h-[620px] flex-1 overflow-hidden rounded-3xl border border-surface-border md:h-[calc(100dvh-11rem)]">
    <aside className="flex w-48 shrink-0 flex-col border-r border-surface-border bg-surface/60 sm:w-64">
      <div className="border-b border-surface-border p-3">
        <button type="button" onClick={() => void createChat()} className="w-full rounded-xl bg-violet-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-600">+ Nuevo chat</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length === 0 && <p className="p-3 text-sm text-muted">No hay conversaciones todavía.</p>}
        {visible.map((session) => <div key={session.id} className={`group mb-1 rounded-xl p-2 text-sm ${selected === session.id ? "bg-violet-500/15 text-foreground" : "text-muted hover:bg-surface-hover"}`}>
          <button type="button" onClick={() => chooseChat(session.id)} className="w-full truncate text-left font-medium" title={session.title}>{session.title}</button>
          <div className="mt-1 flex gap-3 text-xs opacity-70 group-hover:opacity-100">
            <button type="button" onClick={() => void rename(session)} className="hover:text-violet-500">Renombrar</button>
            <button type="button" onClick={() => void archive(session)} className="hover:text-violet-500">{session.archived ? "Restaurar" : "Archivar"}</button>
          </div>
        </div>)}
      </div>
      <label className="flex items-center gap-2 border-t border-surface-border p-3 text-xs text-muted"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Mostrar archivados</label>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-surface-border px-4 py-3 text-sm">
        <div><span className="font-semibold">Astro</span><span className="ml-2 text-muted">{selected ? sessions.find((session) => session.id === selected)?.title : "Selecciona un chat"}</span></div>
        {selected && <span className={`text-xs ${connected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{connected ? "Conectado" : "Reconectando"}</span>}
      </header>
      {error && <p role="alert" className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {!selected && <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center"><div className="mb-3 text-4xl">✦</div><h2 className="text-xl font-semibold">Habla con Astro</h2><p className="mt-2 text-sm text-muted">Pregunta por la energía, la red, las descargas o cualquier sistema de tu servidor.</p><button type="button" onClick={() => void createChat()} className="mt-5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white">Empezar un chat</button></div>}
        {selected && messages.length === 0 && !busy && <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center"><div className="mb-3 text-4xl">✦</div><h2 className="text-xl font-semibold">¿Qué quieres saber?</h2><p className="mt-2 text-sm text-muted">Este chat tiene su propio contexto. Astro comparte sus skills y memoria con Telegram.</p></div>}
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((message,index) => <div key={`${message.timestamp || index}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-violet-500 px-4 py-3 text-sm text-white" : "astro-markdown min-w-0 max-w-full text-sm leading-7 text-foreground"}>
              {message.role === "user" ? <p className="whitespace-pre-wrap">{messageText(message)}</p> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText(message)}</ReactMarkdown>}
            </div>
          </div>)}
          {stream && <div className="astro-markdown text-sm leading-7 text-foreground"><ReactMarkdown remarkPlugins={[remarkGfm]}>{stream}</ReactMarkdown></div>}
          {busy && !stream && <p className="text-sm text-muted">Astro está pensando…</p>}
          <div ref={bottom} />
        </div>
      </div>
      <div className="border-t border-surface-border p-3 sm:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-surface-border bg-surface px-3 py-2 shadow-sm focus-within:border-violet-500/50">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter" && !event.shiftKey) {event.preventDefault();void send();}}} rows={2} disabled={!selected} placeholder={selected ? "Escribe a Astro…" : "Crea un chat para empezar"} className="min-h-12 max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-foreground outline-none placeholder:text-muted" />
          <button type="button" onClick={() => void send()} disabled={!selected || !draft.trim() || busy || !connected} className="mb-1 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Enviar</button>
        </div>
        <p className="mt-2 text-center text-xs text-muted">Enter envía · Shift+Enter agrega una línea</p>
      </div>
    </div>
  </section>;
}
