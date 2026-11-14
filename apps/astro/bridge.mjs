import { createServer } from "node:http";
import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const state = process.env.OPENCLAW_STATE_DIR || "/mnt/localtube/openclaw/state";
const workspace = join(state, "workspace");
const skillRoot = join(workspace, "skills");
const disabledRoot = join(workspace, ".dashboard-disabled-skills");
const agentId = "astro";
const prefix = "agent:astro:dash-";
const bridgeToken = process.env.ASTRO_API_TOKEN;
if (!bridgeToken) throw new Error("ASTRO_API_TOKEN is required");
const port = Number(process.env.ASTRO_API_PORT || 3024);
let provenanceApi;

async function memoryProvenance() {
  if (provenanceApi) return provenanceApi;
  const dist = process.env.OPENCLAW_DIST_DIR;
  if (!dist) throw new Error("OPENCLAW_DIST_DIR is required for trusted memory edits");
  const candidates = (await readdir(dist)).filter((name) => /^memory-artifact-provenance-.*\.mjs$/.test(name));
  for (const name of candidates) {
    const module = await import(pathToFileURL(join(dist,name)).href);
    const functions = Object.values(module);
    const record = functions.find((fn) => fn?.name === "recordMemoryArtifactWriteProvenance");
    const read = functions.find((fn) => fn?.name === "readMemoryArtifactProvenance");
    if (record && read) return provenanceApi = {record,read};
  }
  throw new Error("OpenClaw memory provenance interface is unavailable; memory editing is disabled");
}

class Gateway {
  socket = null;
  ready = null;
  pending = new Map();
  listeners = new Map();
  sequence = 0;

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN && this.ready === null) return;
    if (this.ready) return this.ready;
    this.ready = new Promise(async (resolveReady, rejectReady) => {
      let token;
      try {
        const config = JSON.parse(await readFile(join(state, "openclaw.json"), "utf8"));
        token = config.gateway?.auth?.token;
        if (!token) throw new Error("Gateway token missing");
      } catch (error) { this.ready = null; rejectReady(error); return; }
      const socket = new WebSocket("ws://127.0.0.1:18789");
      this.socket = socket;
      const timeout = setTimeout(() => { socket.close(); rejectReady(new Error("Gateway connection timed out")); }, 15000);
      socket.onmessage = (event) => {
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (frame.type === "event" && frame.event === "connect.challenge") {
          socket.send(JSON.stringify({type:"req",id:"connect",method:"connect",params:{
            minProtocol:4,maxProtocol:4,client:{id:"gateway-client",version:"1.0.0",platform:"linux",mode:"backend"},
            role:"operator",scopes:["operator.read","operator.write","operator.admin"],
            caps:["chat-only-assistant-text"],commands:[],permissions:{},auth:{token},locale:"es-ES",
          }}));
          return;
        }
        if (frame.type === "res" && frame.id === "connect") {
          clearTimeout(timeout);
          if (frame.ok) { this.ready = null; resolveReady(); }
          else { this.ready = null; rejectReady(new Error(frame.error?.message || "Gateway refused connection")); }
          return;
        }
        if (frame.type === "res") {
          const pending = this.pending.get(frame.id);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(frame.id);
          frame.ok ? pending.resolve(frame.payload) : pending.reject(new Error(frame.error?.message || "Gateway RPC failed"));
        } else if (frame.type === "event") {
          for (const listener of this.listeners.get(frame.event) || []) listener(frame.payload);
        }
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        this.socket = null;
        this.ready = null;
        for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error("Gateway disconnected")); }
        this.pending.clear();
        for (const listener of this.listeners.get("disconnect") || []) listener({});
      };
      socket.onerror = () => {};
    });
    return this.ready;
  }

  async rpc(method, params = {}, timeoutMs = 30000) {
    await this.connect();
    const id = `astro-${++this.sequence}`;
    return new Promise((resolveRpc, rejectRpc) => {
      const timeout = setTimeout(() => { this.pending.delete(id); rejectRpc(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, {resolve:resolveRpc,reject:rejectRpc,timeout});
      this.socket.send(JSON.stringify({type:"req",id,method,params}));
    });
  }

  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }
}

const gateway = new Gateway();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const dashboardKey = (id) => prefix + id;
const safeId = (id) => /^[0-9a-f-]{36}$/.test(id);
const safeName = (name) => /^[a-z][a-z0-9-]{1,63}$/.test(name);

function json(res, status, data) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(JSON.stringify(data));
}
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 150000) throw Object.assign(new Error("Request too large"), {status:413});
  }
  try { return text ? JSON.parse(text) : {}; } catch { throw Object.assign(new Error("Invalid JSON"), {status:400}); }
}
function invalid(message) { throw Object.assign(new Error(message), {status:400}); }
async function assertSession(id) {
  if (!safeId(id)) invalid("Invalid chat id");
  const row = await gateway.rpc("sessions.describe", {key:dashboardKey(id),agentId});
  const entry = row?.entry || row?.session || row;
  if (entry?.key !== dashboardKey(id)) throw Object.assign(new Error("Chat not found"), {status:404});
  return entry;
}
async function allSessions() {
  const found = [];
  let offset = 0;
  for (let page = 0; page < 30; page++) {
    const result = await gateway.rpc("sessions.list", {agentId,limit:100,offset,rowMode:"compact"});
    found.push(...(result.sessions || []).filter((row) => row.key?.startsWith(prefix)));
    if (!result.hasMore) break;
    offset = result.nextOffset;
  }
  return found.map((row) => ({id:row.key.slice(prefix.length),title:row.label || row.displayName || "Nuevo chat",archived:!!row.archived,sessionId:row.sessionId,updatedAt:row.updatedAt,hasActiveRun:!!row.hasActiveRun}));
}
async function skillInventory() {
  const [status, workshop, activeNames, disabledNames] = await Promise.all([
    gateway.rpc("skills.status", {agentId}),
    gateway.rpc("skills.workshop.list", {agentId}).catch(() => ({skills:[],archived:[]})),
    readdir(skillRoot).catch(() => []),
    readdir(disabledRoot).catch(() => []),
  ]);
  const own = new Set(activeNames);
  const disabledOwn = new Set(disabledNames);
  const skills = (status.skills || []).filter((item) => !disabledOwn.has(item.name)).map((item) => ({
    name:item.name,description:item.description,source:item.source,eligible:item.eligible,
    disabled:item.disabled,missing:item.missing,editable:item.source === "workspace" || own.has(item.name),
    kind:item.source === "workspace" || own.has(item.name) ? "workspace" : "external",
  }));
  for (const skill of skills.filter((item) => own.has(item.name))) {
    const content = await readFile(join(skillRoot,skill.name,"SKILL.md"),"utf8").catch(() => "");
    if (content) skill.description = descriptionFromSkill(content);
  }
  for (const name of activeNames.filter(safeName)) {
    if (skills.some((skill) => skill.name === name)) continue;
    const content = await readFile(join(skillRoot,name,"SKILL.md"),"utf8").catch(() => "");
    if (content) skills.push({name,description:descriptionFromSkill(content),source:"dashboard",eligible:true,disabled:false,editable:true,kind:"workspace"});
  }
  for (const name of disabledNames.filter(safeName)) {
    const file = join(disabledRoot,name,"SKILL.md");
    const content = await readFile(file,"utf8").catch(() => "");
    skills.push({name,description:descriptionFromSkill(content),source:"dashboard",eligible:false,disabled:true,editable:true,kind:"workspace"});
  }
  for (const item of workshop.skills || []) {
    const name = typeof item === "string" ? item : item.name;
    if (!name) continue;
    const existing = skills.find((skill) => skill.name === name);
    if (existing) { existing.editable = true; existing.kind = "workshop"; }
    else skills.push({name,description:item.description || "",source:"workshop",eligible:true,disabled:false,editable:true,kind:"workshop"});
  }
  for (const item of workshop.archived || []) {
    const name = typeof item === "string" ? item : item.name;
    if (name && !skills.some((skill) => skill.name === name)) skills.push({name,description:"",source:"workshop",eligible:false,disabled:true,editable:true,kind:"workshop"});
  }
  return skills.sort((a,b) => a.name.localeCompare(b.name));
}
function descriptionFromSkill(content) {
  return content.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g,"") || "";
}
function yaml(value) { return JSON.stringify(value); }
function skillContent({name,description,instructions}) {
  if (!safeName(name)) invalid("Name must use lowercase letters, numbers and hyphens");
  if (typeof description !== "string" || !description.trim() || description.length > 500) invalid("When to use is required (max 500 characters)");
  if (typeof instructions !== "string" || !instructions.trim() || instructions.length > 30000) invalid("Instructions are required (max 30000 characters)");
  return `---\nname: ${name}\ndescription: ${yaml(description.trim())}\n---\n\n# ${name}\n\n${instructions.trim()}\n`;
}
async function atomicWrite(file, text) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp,text,{mode:0o600});
  await rename(temp,file);
}
async function ownSkill(name) {
  if (!safeName(name)) invalid("Invalid skill name");
  const inventory = await skillInventory();
  const skill = inventory.find((item) => item.name === name);
  if (!skill) throw Object.assign(new Error("Skill not found"), {status:404});
  if (!skill.editable) throw Object.assign(new Error("Installed skill is read only"), {status:403});
  return skill;
}
async function readSkill(name, skill) {
  if (skill.kind === "workshop") {
    const result = await gateway.rpc("skills.workshop.read", {agentId,name,filePath:"SKILL.md"});
    return result.content;
  }
  if (skill.kind === "workspace") return readFile(join(skill.disabled ? disabledRoot : skillRoot,name,"SKILL.md"),"utf8");
  const status = await gateway.rpc("skills.status", {agentId});
  const match = (status.skills || []).find((item) => item.name === name);
  if (!match) throw Object.assign(new Error("Skill not found"), {status:404});
  const result = await gateway.rpc("skills.files.get", {agentId,path:match.filePath});
  return result.content;
}
async function invokeTool(name, args) {
  const result = await gateway.rpc("tools.invoke", {name,args,agentId,idempotencyKey:randomUUID()},60000);
  if (!result.ok) throw new Error(result.error?.message || `${name} failed`);
  return result.output;
}
async function memoryFile(name) {
  if (!["MEMORY.md","USER.md"].includes(name)) invalid("Invalid memory file");
  const path = join(workspace,name);
  const content = await readFile(path,"utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
  const provenance = await (await memoryProvenance()).read({workspaceDir:workspace,relativePath:name});
  return {name,content,hash:hash(content),provenance:provenance ? {originClass:provenance.originClass,hashMatches:provenance.fileHash===hash(content)} : null};
}

const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,"http://localhost");
    if (url.pathname === "/health") return json(res,200,{ok:true});
    if (req.headers["x-astro-token"] !== bridgeToken) return json(res,401,{detail:"Unauthorized"});
    const path = url.pathname.split("/").filter(Boolean);
    if (req.method === "GET" && url.pathname === "/sessions") return json(res,200,{items:await allSessions()});
    if (req.method === "POST" && url.pathname === "/sessions") {
      const input = await body(req);
      const id = typeof input.idempotencyKey === "string" && safeId(input.idempotencyKey) ? input.idempotencyKey : randomUUID();
      const result = await gateway.rpc("sessions.create", {key:dashboardKey(id),agentId,displayName:typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0,100) : "Nuevo chat"});
      return json(res,201,{id:result.sessionKey?.slice(prefix.length) || id,title:"Nuevo chat"});
    }
    if (path[0] === "sessions" && path[1]) {
      const id = path[1]; const entry = await assertSession(id); const key = dashboardKey(id);
      if (path.length === 2 && req.method === "PATCH") {
        const input = await body(req);
        const patch = {key,agentId};
        if (typeof input.title === "string") { if (!input.title.trim() || input.title.length > 100) invalid("Invalid title"); patch.label = input.title.trim(); }
        if (typeof input.archived === "boolean") { patch.archived = input.archived; patch.expectedSessionId = entry.sessionId; }
        const result = await gateway.rpc("sessions.patch",patch);
        return json(res,200,{ok:true,entry:result.entry});
      }
      if (path[2] === "history" && req.method === "GET") {
        const result = await gateway.rpc("chat.history", {sessionKey:key,agentId,limit:100});
        return json(res,200,{messages:result.messages || [],hasMore:result.hasMore,sessionId:result.sessionId});
      }
      if (path[2] === "messages" && req.method === "POST") {
        const input = await body(req);
        if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 30000) invalid("Message required (max 30000 characters)");
        if (typeof input.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/.test(input.idempotencyKey)) invalid("Invalid idempotency key");
        const result = await gateway.rpc("chat.send", {sessionKey:key,agentId,message:input.message.trim(),idempotencyKey:input.idempotencyKey},30000);
        return json(res,202,{status:result.status,runId:result.runId || input.idempotencyKey});
      }
      if (path[2] === "events" && req.method === "GET") {
        const subscriptionId = `dash-${randomUUID()}`;
        await gateway.rpc("sessions.messages.subscribe", {key,agentId,subscriptionId});
        res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-store","Connection":"keep-alive","X-Accel-Buffering":"no"});
        res.write("event: ready\ndata: {}\n\n");
        const off = gateway.on("chat",(payload) => {if (payload.sessionKey === key && !res.destroyed) res.write(`event: chat\ndata: ${JSON.stringify(payload)}\n\n`);});
        const heartbeat = setInterval(() => {if (!res.destroyed) res.write(": keepalive\n\n");},15000);
        const onDisconnect = gateway.on("disconnect",() => {if (!res.destroyed) res.end();});
        req.on("close",() => {off();onDisconnect();clearInterval(heartbeat);gateway.rpc("sessions.messages.unsubscribe",{key,agentId,subscriptionId}).catch(()=>{});});
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/skills") return json(res,200,{items:await skillInventory()});
    if (req.method === "POST" && url.pathname === "/skills") {
      const input = await body(req); const content = skillContent(input);
      if ((await skillInventory()).some((skill) => skill.name === input.name)) invalid("A skill with this name already exists");
      await mkdir(skillRoot,{recursive:true});
      const dir = join(skillRoot,input.name); await mkdir(dir,{recursive:false}); await atomicWrite(join(dir,"SKILL.md"),content);
      return json(res,201,{ok:true,name:input.name});
    }
    if (path[0] === "skills" && path[1]) {
      const name = path[1], skill = await ownSkill(name);
      if (req.method === "GET" && path.length === 2) {
        const content = await readSkill(name,skill);
        return json(res,200,{...skill,content,hash:hash(content)});
      }
      if (req.method === "PUT" && path.length === 2) {
        const input = await body(req);
        const old = await readSkill(name,skill);
        if (hash(old) !== input.expectedHash) return json(res,409,{detail:"Skill changed; reload before saving"});
        if (typeof input.content !== "string" || input.content.length > 40000 || !input.content.startsWith("---\n")) invalid("Invalid SKILL.md");
        if (!new RegExp(`^name:\\s*${name}\\s*$`,"m").test(input.content)) invalid("Skill name cannot change");
        if (skill.kind === "workshop") {
          await invokeTool("skill_workshop",{action:"write_file",name,file_path:"SKILL.md",content:input.content,reason:"Edited from Astro dashboard"});
          if (hash(await readSkill(name,skill)) !== hash(input.content)) throw new Error("Workshop did not save the exact requested content");
        } else await atomicWrite(join(skill.disabled ? disabledRoot : skillRoot,name,"SKILL.md"),input.content);
        return json(res,200,{ok:true,hash:hash(input.content)});
      }
      if (req.method === "POST" && path[2] === "toggle") {
        if (skill.kind === "workshop") await gateway.rpc(skill.disabled ? "skills.workshop.restore" : "skills.workshop.archive",{agentId,name,reason:"Changed from Astro dashboard"});
        else {
          await mkdir(skill.disabled ? skillRoot : disabledRoot,{recursive:true});
          await rename(join(skill.disabled ? disabledRoot : skillRoot,name),join(skill.disabled ? skillRoot : disabledRoot,name));
        }
        return json(res,200,{ok:true,disabled:!skill.disabled});
      }
    }
    if (req.method === "GET" && url.pathname === "/memory") {
      const files = await Promise.all(["MEMORY.md","USER.md"].map(memoryFile));
      const notes = (await readdir(join(workspace,"memory")).catch(()=>[])).filter((name)=>/^\d{4}-\d\d-\d\d\.md$/.test(name)).sort().reverse().slice(0,7);
      return json(res,200,{files,notes:await Promise.all(notes.map(async name=>({name,content:(await readFile(join(workspace,"memory",name),"utf8")).slice(0,30000)})))});
    }
    if (req.method === "PUT" && path[0] === "memory" && path[1]) {
      const before = await memoryFile(path[1]); const input = await body(req);
      if (before.hash !== input.expectedHash) return json(res,409,{detail:"Memory changed; reload before saving"});
      if (before.provenance && (before.provenance.originClass !== "agent" || !before.provenance.hashMatches)) return json(res,409,{detail:"OpenClaw does not trust this memory file; inspect its provenance before editing"});
      if (typeof input.content !== "string" || input.content.length > 30000) invalid("Memory text too long");
      const file = path[1];
      const api = await memoryProvenance();
      const rollback = await api.record({workspaceDir:workspace,relativePath:file,contentBefore:before.content,contentAfter:input.content,originClass:"agent",observedAt:Date.now(),sessionKey:"agent:astro:dashboard-memory-editor"});
      try {
        await gateway.rpc("agents.files.set",{agentId,name:file,content:input.content,expectedHash:before.hash});
      } catch (error) { await rollback(); throw error; }
      const after = await memoryFile(file);
      if (after.content !== input.content || after.provenance?.originClass !== "agent" || !after.provenance.hashMatches) throw new Error("Memory save could not be verified as trusted");
      return json(res,200,{ok:true,hash:hash(input.content)});
    }
    return json(res,404,{detail:"Not found"});
  } catch (error) {
    console.error("Astro bridge:",error.message);
    if (!res.headersSent) json(res,error.status || 502,{detail:error.message});
    else res.end();
  }
});

server.listen(port,"0.0.0.0",()=>console.log(`Astro bridge listening on ${port}`));
