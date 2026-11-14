"use client";

import { useCallback, useEffect, useState } from "react";
import { astroApi } from "@/components/astro/api";

type MemoryFile={name:string;content:string;hash:string;provenance:{originClass:string;hashMatches:boolean}|null};
type Note={name:string;content:string};
type Memory={files:MemoryFile[];notes:Note[]};

export function AstroMemory(){
  const [data,setData]=useState<Memory|null>(null);
  const [tab,setTab]=useState("MEMORY.md");
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const load=useCallback(async()=>{
    try{const result=await astroApi<Memory>("/memory");setData(result);setDraft(result.files.find((file)=>file.name===tab)?.content||"");setError(null);}
    catch(err){setError(err instanceof Error?err.message:"No se pudo cargar la memoria");}
  },[tab]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  const selected=data?.files.find((file)=>file.name===tab);
  const trusted=!selected?.provenance||(selected.provenance.originClass==="agent"&&selected.provenance.hashMatches);

  async function save(){
    if(!selected)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      await astroApi(`/memory/${selected.name}`,{method:"PUT",body:JSON.stringify({content:draft,expectedHash:selected.hash})});
      await load();setNotice("Memoria guardada y comprobada. Los chats nuevos y Telegram podrán usarla.");
    }catch(err){setError(err instanceof Error?err.message:"Astro no pudo guardar la memoria");}
    finally{setBusy(false);}
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
    <section className="glass rounded-3xl p-5 sm:p-6"><div className="mb-4"><h2 className="text-lg font-semibold">Memoria duradera</h2><p className="mt-1 text-sm text-muted">Estos archivos contienen los datos y preferencias que Astro puede llevar a conversaciones nuevas. Los recuerdos automáticos se seleccionan con el tiempo.</p></div>
      <div className="mb-4 flex gap-2 border-b border-surface-border pb-3">{["MEMORY.md","USER.md"].map((name)=><button type="button" key={name} onClick={()=>{setTab(name);setDraft(data?.files.find((file)=>file.name===name)?.content||"");}} className={`rounded-xl px-3 py-2 text-sm ${tab===name?"bg-violet-500/15 font-semibold text-violet-600 dark:text-violet-300":"text-muted hover:bg-surface-hover"}`}>{name==="MEMORY.md"?"Conocimientos":"Preferencias"}</button>)}</div>
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
      {selected&&<p className={`mb-3 text-xs ${trusted?"text-emerald-600 dark:text-emerald-400":"text-red-600 dark:text-red-400"}`}>{trusted?"✓ OpenClaw puede cargar este archivo en el contexto":"OpenClaw no confía en este archivo. Revisa su procedencia antes de editarlo."}</p>}
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted">{tab}<textarea value={draft} onChange={(event)=>setDraft(event.target.value)} rows={20} spellCheck={false} placeholder="Astro aún no tiene recuerdos duraderos en este archivo." className="mt-2 block w-full resize-y rounded-xl border border-surface-border bg-surface p-4 font-mono text-xs font-normal leading-6 tracking-normal text-foreground outline-none focus:border-violet-500/50"/></label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-xs text-muted">Al guardar, se comprueban el contenido y su procedencia. Si el archivo cambió mientras editabas, tendrás que recargarlo.</p><button type="button" disabled={busy||!selected||!trusted||draft===selected.content} onClick={()=>void save()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy?"Guardando…":"Guardar memoria"}</button></div>
    </section>
    <section className="glass rounded-3xl p-5 sm:p-6"><h2 className="text-lg font-semibold">Notas recientes</h2><p className="mt-1 text-sm text-muted">Apuntes temporales de Astro. Se consultan cuando hacen falta y no se cargan enteros en cada chat.</p>
      <div className="mt-5 max-h-[70vh] space-y-3 overflow-y-auto">{data?.notes.length===0&&<p className="rounded-xl border border-dashed border-surface-border p-5 text-sm text-muted">Todavía no hay notas diarias.</p>}{data?.notes.map((note)=><details key={note.name} className="rounded-xl border border-surface-border bg-surface p-3"><summary className="cursor-pointer text-sm font-medium">{note.name}</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-surface-border pt-3 font-mono text-xs leading-6 text-muted">{note.content}</pre></details>)}</div>
    </section>
  </div>;
}
