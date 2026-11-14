"use client";

import { useCallback, useEffect, useState } from "react";
import { astroApi } from "@/components/astro/api";

type Skill = {name:string;description:string;source:string;eligible:boolean;disabled:boolean;editable:boolean;kind:string;missing?:Record<string,string[]>};
type SkillDetail = Skill & {content:string;hash:string};

export function AstroSkills() {
  const [skills,setSkills] = useState<Skill[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [detail,setDetail] = useState<SkillDetail | null>(null);
  const [content,setContent] = useState("");
  const [creating,setCreating] = useState(false);
  const [name,setName] = useState("");
  const [when,setWhen] = useState("");
  const [instructions,setInstructions] = useState("");
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [notice,setNotice] = useState<string | null>(null);

  const load = useCallback(async()=>{
    try {const result=await astroApi<{items:Skill[]}>("/skills");setSkills(result.items);setError(null);}
    catch(err){setError(err instanceof Error?err.message:"No se pudieron cargar las skills");}
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>{
    if(!selected)return;
    let active=true;
    astroApi<SkillDetail>(`/skills/${encodeURIComponent(selected)}`).then((result)=>{if(active){setDetail(result);setContent(result.content);setError(null);}}).catch((err)=>{if(active)setError(err instanceof Error?err.message:"No se pudo cargar la skill");});
    return()=>{active=false;};
  },[selected]);

  async function create(){
    setBusy(true);setError(null);setNotice(null);
    try{
      await astroApi("/skills",{method:"POST",body:JSON.stringify({name,description:when,instructions})});
      setCreating(false);setName("");setWhen("");setInstructions("");await load();setDetail(null);setSelected(name);
      setNotice("Skill creada. Astro la verá en los próximos turnos; la actualización puede tardar alrededor de un minuto.");
    }catch(err){setError(err instanceof Error?err.message:"No se pudo crear");}
    finally{setBusy(false);}
  }

  async function save(){
    if(!detail)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      await astroApi(`/skills/${encodeURIComponent(detail.name)}`,{method:"PUT",body:JSON.stringify({content,expectedHash:detail.hash})});
      const fresh=await astroApi<SkillDetail>(`/skills/${encodeURIComponent(detail.name)}`);
      setDetail(fresh);setContent(fresh.content);await load();setNotice("Skill guardada.");
    }catch(err){setError(err instanceof Error?err.message:"No se pudo guardar");}
    finally{setBusy(false);}
  }

  async function toggle(){
    if(!detail)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      await astroApi(`/skills/${encodeURIComponent(detail.name)}/toggle`,{method:"POST"});
      await load();setSelected(null);setDetail(null);setNotice(detail.disabled?"Skill activada.":"Skill desactivada.");
    }catch(err){setError(err instanceof Error?err.message:"No se pudo cambiar la skill");}
    finally{setBusy(false);}
  }

  const visible=skills.filter((skill)=>skill.name.toLowerCase().includes(search.toLowerCase())||skill.description?.toLowerCase().includes(search.toLowerCase()));
  return <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
    <section className="glass rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2"><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar skills" className="min-w-0 flex-1 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/50"/><button type="button" onClick={()=>{setCreating(true);setSelected(null);setDetail(null);}} className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white">+ Nueva</button></div>
      <p className="mb-3 text-xs text-muted">{skills.length} skills disponibles para Astro</p>
      <div className="max-h-[65vh] space-y-1 overflow-y-auto">
        {visible.map((skill)=><button key={skill.name} type="button" onClick={()=>{setCreating(false);setSelected(skill.name);}} className={`block w-full rounded-xl p-3 text-left ${selected===skill.name?"bg-violet-500/15":"hover:bg-surface-hover"}`}>
          <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{skill.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${skill.disabled?"bg-amber-500/15 text-amber-600":skill.eligible?"bg-emerald-500/15 text-emerald-600":"bg-surface text-muted"}`}>{skill.disabled?"Inactiva":skill.eligible?"Lista":"No disponible"}</span></span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted">{skill.description||skill.source}</span>
        </button>)}
      </div>
    </section>
    <section className="glass min-h-[440px] rounded-3xl p-5 sm:p-6">
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
      {creating?<div className="max-w-2xl space-y-4"><div><h2 className="text-lg font-semibold">Nueva skill</h2><p className="text-sm text-muted">Enseña a Astro un procedimiento que podrá usar tanto aquí como en Telegram.</p></div>
        <label className="block text-sm font-medium">Nombre<input value={name} onChange={(event)=>setName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} placeholder="revisar-energia" className="mt-1 block w-full rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-violet-500/50"/></label>
        <label className="block text-sm font-medium">Cuándo usarla<textarea value={when} onChange={(event)=>setWhen(event.target.value)} rows={3} placeholder="Cuando te diga 'revisa la energía' o pida un resumen de batería" className="mt-1 block w-full resize-y rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-violet-500/50"/></label>
        <label className="block text-sm font-medium">Instrucciones<textarea value={instructions} onChange={(event)=>setInstructions(event.target.value)} rows={10} placeholder="Consulta el estado actual de Bluetti y responde con carga, entrada AC, salida y autonomía…" className="mt-1 block w-full resize-y rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-violet-500/50"/></label>
        <button type="button" disabled={busy||!name||!when.trim()||!instructions.trim()} onClick={()=>void create()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Crear skill</button>
      </div>:detail?<div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{detail.name}</h2><p className="text-sm text-muted">{detail.description||detail.source}</p><p className="mt-1 text-xs text-muted">Origen: {detail.source}</p></div>{detail.editable&&<button type="button" disabled={busy} onClick={()=>void toggle()} className="rounded-xl border border-surface-border px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-40">{detail.disabled?"Activar":"Desactivar"}</button>}</div>
        <label className="block text-sm font-medium">Instrucciones de la skill<textarea value={content} readOnly={!detail.editable} onChange={(event)=>setContent(event.target.value)} rows={18} spellCheck={false} className="mt-2 block w-full resize-y rounded-xl border border-surface-border bg-surface p-4 font-mono text-xs leading-6 outline-none focus:border-violet-500/50"/></label>
        {detail.editable&&<button type="button" disabled={busy||content===detail.content} onClick={()=>void save()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Guardar cambios</button>}
        {!detail.editable&&<p className="text-xs text-muted">Esta skill instalada se muestra solo para consulta.</p>}
      </div>:<div className="flex min-h-[380px] flex-col items-center justify-center text-center"><span className="text-4xl">✦</span><h2 className="mt-3 text-lg font-semibold">Skills de Astro</h2><p className="mt-2 max-w-sm text-sm text-muted">Elige una skill para ver sus instrucciones o crea una nueva para enseñarle una tarea recurrente.</p></div>}
    </section>
  </div>;
}
