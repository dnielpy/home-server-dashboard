// Astro's rig and the runner of the Pet animations. Loaded by player.html inside a sandboxed iframe: the page sends
// {type: "play", id, code, duration} or {type: "message", id, text, duration} and gets {type: "done" | "error", id}.
// The contract the animations are written against is documented in apps/api/app/pet_guide.md; keep both in sync.
(() => {
  "use strict";

  // Neon: a dark glass body outlined in blue tubes, with white and red lights
  const BLUE = "#27e8ff";
  const RED = "#ff2e63";
  const WHITE = "#f4fbff";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PARTS = [
    "root", "body", "chestStar", "head", "visor", "antenna", "antennaBall",
    "earL", "earR", "armL", "armR", "legL", "legR", "sign", "shadow",
  ];
  // Where each part turns from, in the drawing's coordinates (viewBox 0 0 400 460)
  const ORIGINS = {
    root: "200px 440px", body: "200px 330px", chestStar: "200px 318px", head: "200px 250px",
    visor: "205px 165px", antenna: "128px 72px", antennaBall: "110px 16px", earL: "70px 168px",
    earR: "330px 168px", armL: "142px 288px", armR: "258px 288px", legL: "165px 360px", legR: "235px 360px",
    sign: "200px 390px", shadow: "200px 448px",
  };
  // A glowing tube: an outline in one of the neon colors
  const tube = (color, width = 3) => `fill="none" stroke="${color}" stroke-width="${width}" filter="url(#neon)"`;

  const ASTRO_SVG = `
<svg xmlns="${SVG_NS}" viewBox="0 0 400 460" id="astro" overflow="visible">
  <defs>
    <radialGradient id="shell" cx="38%" cy="28%" r="85%">
      <stop offset="0" stop-color="#1b2a5e"/><stop offset=".5" stop-color="#0d1536"/><stop offset="1" stop-color="#060a1c"/>
    </radialGradient>
    <radialGradient id="shellDark" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#16204a"/><stop offset="1" stop-color="#05081a"/>
    </radialGradient>
    <radialGradient id="ball" cx="35%" cy="30%" r="70%">
      <stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${RED}"/><stop offset="1" stop-color="#8a0024"/>
    </radialGradient>
    <filter id="neon" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="near"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="far"/>
      <feMerge><feMergeNode in="far"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="visorClip"><ellipse cx="205" cy="165" rx="100" ry="72"/></clipPath>
  </defs>
  <ellipse data-part="shadow" cx="200" cy="448" rx="150" ry="11" fill="${BLUE}" opacity=".12"/>
  <g data-part="root">
    <g data-part="legL">
      <rect x="125" y="336" width="58" height="62" rx="26" fill="url(#shellDark)" stroke="${BLUE}" stroke-opacity=".5" stroke-width="2"/>
      <ellipse cx="110" cy="400" rx="62" ry="50" fill="url(#shell)"/>
      <ellipse cx="110" cy="400" rx="62" ry="50" ${tube(BLUE)}/>
      <ellipse cx="100" cy="406" rx="42" ry="38" fill="#050816"/>
      <path d="M 70 382 A 44 40 0 0 0 82 442" ${tube(RED, 5)} stroke-linecap="round"/>
    </g>
    <g data-part="legR">
      <rect x="217" y="336" width="58" height="62" rx="26" fill="url(#shellDark)" stroke="${BLUE}" stroke-opacity=".5" stroke-width="2"/>
      <ellipse cx="290" cy="400" rx="62" ry="50" fill="url(#shell)"/>
      <ellipse cx="290" cy="400" rx="62" ry="50" ${tube(BLUE)}/>
      <ellipse cx="300" cy="406" rx="42" ry="38" fill="#050816"/>
      <path d="M 330 382 A 44 40 0 0 1 318 442" ${tube(RED, 5)} stroke-linecap="round"/>
    </g>
    <g data-part="body">
      <rect x="182" y="244" width="36" height="26" rx="8" fill="#050816"/>
      <rect x="128" y="258" width="144" height="124" rx="46" fill="url(#shell)"/>
      <rect x="128" y="258" width="144" height="124" rx="46" ${tube(BLUE)}/>
      <ellipse cx="170" cy="282" rx="18" ry="7" fill="${WHITE}" opacity=".18"/>
      <g data-part="chestStar">
        <path data-idle="chest" d="M200 296 Q203 315 222 318 Q203 321 200 340 Q197 321 178 318 Q197 315 200 296 Z"
          fill="${RED}" stroke="#fff" stroke-width="1.5" filter="url(#neon)"/>
      </g>
    </g>
    <g data-part="armL">
      <g transform="rotate(-16 144 290)">
        <rect x="124" y="288" width="40" height="110" rx="20" fill="url(#shell)"/>
        <rect x="124" y="288" width="40" height="110" rx="20" ${tube(BLUE, 2.5)}/>
        <path d="M 126 357 H 162" ${tube(RED, 5)} stroke-linecap="round"/>
        <rect x="126" y="365" width="36" height="34" rx="15" fill="#0b1230" stroke="${WHITE}" stroke-width="2" stroke-opacity=".8"/>
      </g>
      <circle cx="142" cy="288" r="24" fill="url(#shellDark)"/>
      <circle cx="142" cy="288" r="24" ${tube(WHITE, 2.5)}/>
    </g>
    <g data-part="armR">
      <g transform="rotate(16 256 290)">
        <rect x="236" y="288" width="40" height="110" rx="20" fill="url(#shell)"/>
        <rect x="236" y="288" width="40" height="110" rx="20" ${tube(BLUE, 2.5)}/>
        <path d="M 238 357 H 274" ${tube(RED, 5)} stroke-linecap="round"/>
        <rect x="238" y="365" width="36" height="34" rx="15" fill="#0b1230" stroke="${WHITE}" stroke-width="2" stroke-opacity=".8"/>
      </g>
      <circle cx="258" cy="288" r="24" fill="url(#shellDark)"/>
      <circle cx="258" cy="288" r="24" ${tube(WHITE, 2.5)}/>
    </g>
    <g data-part="sign" opacity="0">
      <rect x="62" y="236" width="276" height="150" rx="22" fill="#070b1f" fill-opacity=".94"/>
      <rect x="62" y="236" width="276" height="150" rx="22" ${tube(RED, 5)}/>
      <rect x="72" y="246" width="256" height="130" rx="15" fill="none" stroke="${BLUE}" stroke-width="1.5" stroke-opacity=".6"/>
      <foreignObject x="80" y="250" width="240" height="122">
        <div xmlns="http://www.w3.org/1999/xhtml" class="sign-text"></div>
      </foreignObject>
      <circle cx="186" cy="388" r="14" fill="#0b1230" stroke="${WHITE}" stroke-width="2"/>
      <circle cx="214" cy="388" r="14" fill="#0b1230" stroke="${WHITE}" stroke-width="2"/>
    </g>
    <g data-part="head">
      <g data-part="antenna">
        <g data-idle="antenna">
          <path d="M128 72 L112 24" stroke="${WHITE}" stroke-width="5" stroke-linecap="round" filter="url(#neon)"/>
          <g data-part="antennaBall">
            <circle cx="110" cy="16" r="13" fill="url(#ball)" filter="url(#neon)"/>
            <ellipse cx="110" cy="17" rx="23" ry="6" ${tube(BLUE, 2.5)} transform="rotate(-15 110 17)"/>
          </g>
        </g>
        <ellipse cx="130" cy="74" rx="18" ry="10" fill="#050816" stroke="${BLUE}" stroke-width="2"/>
      </g>
      <g data-part="earL">
        <ellipse cx="74" cy="168" rx="40" ry="54" fill="url(#shellDark)" stroke="${BLUE}" stroke-opacity=".6" stroke-width="2"/>
        <ellipse cx="66" cy="168" rx="30" ry="43" fill="#050816"/>
        <ellipse cx="66" cy="168" rx="30" ry="43" ${tube(RED, 5)}/>
        <ellipse cx="64" cy="168" rx="15" ry="25" ${tube(WHITE, 2)}/>
      </g>
      <g data-part="earR">
        <ellipse cx="326" cy="168" rx="40" ry="54" fill="url(#shellDark)" stroke="${BLUE}" stroke-opacity=".6" stroke-width="2"/>
        <ellipse cx="334" cy="168" rx="30" ry="43" fill="#050816"/>
        <ellipse cx="334" cy="168" rx="30" ry="43" ${tube(RED, 5)}/>
        <ellipse cx="336" cy="168" rx="15" ry="25" ${tube(WHITE, 2)}/>
      </g>
      <ellipse cx="200" cy="150" rx="135" ry="112" fill="url(#shell)"/>
      <ellipse cx="200" cy="150" rx="135" ry="112" ${tube(BLUE, 3.5)}/>
      <path d="M 228 40 C 246 42 258 46 266 52 L 242 110 C 234 109 226 108 218 108 Z" fill="${WHITE}" filter="url(#neon)"/>
      <ellipse cx="205" cy="165" rx="113" ry="84" fill="#03050f"/>
      <ellipse cx="205" cy="165" rx="113" ry="84" ${tube(BLUE, 2)} stroke-opacity=".7"/>
      <g data-part="visor">
        <ellipse cx="205" cy="165" rx="100" ry="72" fill="#010208"/>
        <foreignObject x="105" y="93" width="200" height="144" clip-path="url(#visorClip)">
          <canvas xmlns="http://www.w3.org/1999/xhtml" class="face" width="600" height="432"></canvas>
        </foreignObject>
        <path d="M 250 104 Q 290 112 298 146" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".14"/>
        <circle cx="250" cy="122" r="4" fill="#fff" opacity=".3"/>
      </g>
    </g>
  </g>
</svg>`;

  // ---------- Small helpers ----------

  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const abortError = () => new DOMException("Animation stopped", "AbortError");

  // ---------- The stage: a canvas behind Astro, plus the built-in particle effects ----------

  const stageCanvas = document.getElementById("stage");
  const stageCtx = stageCanvas.getContext("2d");
  // The particles fly in front of Astro, the stage stays behind it
  const fxCanvas = document.getElementById("fx");
  const fxCtx = fxCanvas.getContext("2d");
  const loops = new Set();
  let particles = [];
  let onLoopError = null;

  function resizeStage() {
    const ratio = window.devicePixelRatio || 1;
    for (const [canvas, ctx] of [[stageCanvas, stageCtx], [fxCanvas, fxCtx]]) {
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }
  window.addEventListener("resize", resizeStage);
  resizeStage();

  const PARTICLE_KINDS = {
    confetti: () => ({ color: pick([BLUE, RED, WHITE, "#3d7bff"]), size: rand(9, 16), gravity: 260 }),
    hearts: () => ({ color: pick([RED, "#ff6b93", WHITE]), size: rand(20, 34), gravity: -40 }),
    stars: () => ({ color: pick([WHITE, BLUE, "#9ff4ff"]), size: rand(16, 30), gravity: 30 }),
    notes: () => ({ color: pick([BLUE, RED, WHITE]), size: rand(26, 40), gravity: -50 }),
    zzz: () => ({ color: "#9ff4ff", size: rand(26, 42), gravity: -30 }),
    bubbles: () => ({ color: BLUE, size: rand(14, 30), gravity: -60 }),
    sparks: () => ({ color: pick([BLUE, WHITE, RED]), size: rand(3, 5), gravity: 120 }),
  };

  function drawParticle(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.6));
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    const s = p.size;
    switch (p.kind) {
      case "confetti": ctx.fillRect(-s / 2, -s / 4, s, s / 2); break;
      case "hearts": heartPath(ctx, s / 2); ctx.fill(); break;
      case "stars": sparklePath(ctx, s / 2); ctx.fill(); break;
      case "notes": ctx.font = `${s}px sans-serif`; ctx.fillText(p.glyph, -s / 3, s / 3); break;
      case "zzz": ctx.font = `bold ${s}px sans-serif`; ctx.fillText("z", -s / 3, s / 3); break;
      case "bubbles": ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const fx = {
    burst(kind = "stars", options = {}) {
      if (!PARTICLE_KINDS[kind]) throw new Error(`Unknown effect "${kind}"`);
      const from = options.x === undefined ? astro.at("head") : { x: options.x, y: options.y };
      const count = options.count ?? 24;
      const speed = options.speed ?? 320;
      for (let i = 0; i < count; i++) {
        const angle = options.angle ?? rand(Math.PI * 2);
        const spread = options.spread ?? Math.PI * 2;
        const a = options.angle === undefined ? angle : angle + rand(-spread / 2, spread / 2);
        const v = rand(speed * 0.4, speed);
        particles.push({
          kind, x: from.x, y: from.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          angle: rand(Math.PI * 2), spin: rand(-4, 4), life: rand(1.4, 2.6), glyph: pick(["♪", "♫", "♬"]),
          ...PARTICLE_KINDS[kind](),
        });
      }
    },
    rain(kind = "confetti", ms = 3000, perSecond = 30) {
      if (!PARTICLE_KINDS[kind]) throw new Error(`Unknown effect "${kind}"`);
      const until = performance.now() + ms;
      let carry = 0;
      return stage.loop((ctx, t, dt) => {
        if (performance.now() > until) return false;
        carry += dt * perSecond;
        for (; carry >= 1; carry--) {
          particles.push({
            kind, x: rand(window.innerWidth), y: -20, vx: rand(-30, 30), vy: rand(60, 160),
            angle: rand(Math.PI * 2), spin: rand(-3, 3), life: rand(3, 5), glyph: pick(["♪", "♫", "♬"]),
            ...PARTICLE_KINDS[kind](), gravity: 80,
          });
        }
      });
    },
  };

  const stage = {
    canvas: stageCanvas,
    ctx: stageCtx,
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight; },
    /** Calls fn(ctx, t, dt) every frame until it returns false or the animation ends; returns a function that stops it. */
    loop(fn) {
      const entry = { fn, start: performance.now() };
      loops.add(entry);
      return () => loops.delete(entry);
    },
  };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stageCtx.clearRect(0, 0, stage.width, stage.height);
    fxCtx.clearRect(0, 0, stage.width, stage.height);
    for (const entry of [...loops]) {
      try {
        if (entry.fn(stageCtx, (now - entry.start) / 1000, dt) === false) loops.delete(entry);
      } catch (error) {
        loops.delete(entry);
        onLoopError?.(error);
      }
    }
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
      p.angle += p.spin * dt;
      drawParticle(fxCtx, p);
    }
    face.render(now / 1000);
    requestAnimationFrame(frame);
  }

  // ---------- Shapes shared by the face and the particles ----------

  function sparklePath(ctx, s) {
    const k = s * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(k, -k, s, 0);
    ctx.quadraticCurveTo(k, k, 0, s);
    ctx.quadraticCurveTo(-k, k, -s, 0);
    ctx.quadraticCurveTo(-k, -k, 0, -s);
    ctx.closePath();
  }

  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.1, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.9);
    ctx.closePath();
  }

  // ---------- The face on the visor: an LED screen like the Sphere's ----------

  const EYES = {
    star: (c, s) => { sparklePath(c, s); c.fill(); },
    heart: (c, s) => { heartPath(c, s * 0.85); c.fill(); },
    happy: (c, s) => { c.beginPath(); c.arc(0, s * 0.45, s * 0.7, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); },
    closed: (c, s) => { c.beginPath(); c.moveTo(-s * 0.7, 0); c.lineTo(s * 0.7, 0); c.stroke(); },
    sleepy: (c, s) => { c.beginPath(); c.arc(0, -s * 0.25, s * 0.65, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); },
    wide: (c, s) => { c.beginPath(); c.arc(0, 0, s * 0.68, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.25, 0, Math.PI * 2); c.fill(); },
    dot: (c, s) => { c.beginPath(); c.arc(0, 0, s * 0.38, 0, Math.PI * 2); c.fill(); },
    x: (c, s) => { const k = s * 0.55; c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, k); c.moveTo(k, -k); c.lineTo(-k, k); c.stroke(); },
    spiral: (c, s, t) => {
      c.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) {
        const r = (a / (Math.PI * 5)) * s * 0.8;
        const x = Math.cos(a + t * 6) * r, y = Math.sin(a + t * 6) * r;
        if (a === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    },
    angry: (c, s, t, side) => {
      c.beginPath();
      c.moveTo(-s * 0.75, -s * 0.35 * side); c.lineTo(s * 0.75, s * 0.35 * side);
      c.lineTo(s * 0.6, s * 0.6); c.lineTo(-s * 0.6, s * 0.6); c.closePath(); c.fill();
    },
    dollar: (c, s) => { c.font = `bold ${s * 1.8}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", 0, 2); },
    question: (c, s) => { c.font = `bold ${s * 1.8}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("?", 0, 2); },
    sad: (c, s) => { c.beginPath(); c.arc(0, -s * 0.1, s * 0.6, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); c.beginPath(); c.moveTo(-s * 0.7, -s * 0.7); c.lineTo(s * 0.5, -s * 0.95); c.stroke(); },
  };

  const MOUTHS = {
    smile: (c) => { c.beginPath(); c.arc(0, -14, 22, Math.PI * 0.22, Math.PI * 0.78); c.stroke(); },
    grin: (c) => { c.beginPath(); c.moveTo(-24, -4); c.quadraticCurveTo(0, 2, 24, -4); c.quadraticCurveTo(20, 22, 0, 22); c.quadraticCurveTo(-20, 22, -24, -4); c.fill(); },
    open: (c) => { c.beginPath(); c.ellipse(0, 4, 12, 15, 0, 0, Math.PI * 2); c.stroke(); },
    wow: (c) => { c.beginPath(); c.arc(0, 4, 8, 0, Math.PI * 2); c.fill(); },
    flat: (c) => { c.beginPath(); c.moveTo(-16, 4); c.lineTo(16, 4); c.stroke(); },
    frown: (c) => { c.beginPath(); c.arc(0, 22, 20, Math.PI * 1.25, Math.PI * 1.75); c.stroke(); },
    tongue: (c) => { MOUTHS.smile(c); c.beginPath(); c.arc(6, 10, 7, 0, Math.PI); c.fill(); },
    wave: (c) => { c.beginPath(); for (let i = 0; i <= 6; i++) c.lineTo(-24 + i * 8, i % 2 ? 8 : 0); c.stroke(); },
    cat: (c) => { c.beginPath(); c.arc(-9, 0, 9, 0, Math.PI); c.arc(9, 0, 9, 0, Math.PI); c.stroke(); },
    none: () => {},
  };

  const EXPRESSIONS = {
    neutral: ["star", "star", "smile"], happy: ["happy", "happy", "grin"], love: ["heart", "heart", "smile"],
    dizzy: ["spiral", "spiral", "wave"], sleepy: ["sleepy", "sleepy", "flat"], surprised: ["wide", "wide", "wow"],
    angry: ["angry", "angry", "frown"], sad: ["sad", "sad", "frown"], rich: ["dollar", "dollar", "grin"],
    wink: ["star", "happy", "tongue"], confused: ["dot", "question", "wave"], dead: ["x", "x", "flat"],
    cool: ["closed", "closed", "smile"], cat: ["happy", "happy", "cat"],
  };

  const face = (() => {
    let canvas = null, ctx = null;
    let state;
    const reset = () => {
      state = {
        eyes: ["star", "star"], mouth: "smile", color: WHITE, glow: BLUE, text: null, draw: null, hideFace: false,
        look: { x: 0, y: 0 }, target: { x: 0, y: 0 }, autoLook: true, nextLook: 0, blinkUntil: 0, nextBlink: 2,
        eyeScale: 1,
      };
    };
    reset();
    const W = 200, H = 144;

    function eye(shape, x, y, s, t, side, blink) {
      const draw = EYES[shape] || EYES.star;
      ctx.save();
      ctx.translate(x, y);
      if (side < 0 && shape === "angry") ctx.scale(-1, 1);
      ctx.scale(state.eyeScale, state.eyeScale * blink);
      draw(ctx, s, t, side < 0 ? -1 : 1);
      ctx.restore();
    }

    return {
      attach(newCanvas) {
        canvas = newCanvas;
        ctx = canvas.getContext("2d");
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      },
      render(t) {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = state.color;
        ctx.strokeStyle = state.color;
        ctx.shadowColor = state.glow;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (state.autoLook && t > state.nextLook) {
          state.target = Math.random() < 0.4 ? { x: 0, y: 0 } : { x: rand(-0.8, 0.8), y: rand(-0.5, 0.5) };
          state.nextLook = t + rand(1.5, 4);
        }
        state.look.x += (state.target.x - state.look.x) * 0.12;
        state.look.y += (state.target.y - state.look.y) * 0.12;
        if (t > state.nextBlink) { state.blinkUntil = t + 0.14; state.nextBlink = t + rand(2.5, 6); }
        const blink = t < state.blinkUntil ? 0.12 : 1;

        if (state.text) {
          const fit = Math.min(64, 330 / Math.max(1, state.text.length));
          ctx.font = `800 ${fit}px ui-rounded, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(state.text, W / 2, H / 2 + 2);
        } else if (!state.hideFace) {
          const lx = state.look.x * 14, ly = state.look.y * 10;
          eye(state.eyes[0], 60 + lx, 64 + ly, 24, t, -1, blink);
          eye(state.eyes[1], 140 + lx, 64 + ly, 24, t, 1, blink);
          ctx.save();
          ctx.translate(100 + lx * 0.6, 100 + ly * 0.6);
          (MOUTHS[state.mouth] || MOUTHS.smile)(ctx, t);
          ctx.restore();
        }
        if (state.draw) {
          ctx.save();
          try {
            state.draw(ctx, t, W, H);
          } catch (error) {
            state.draw = null;
            state.hideFace = false;
            onLoopError?.(error);
          }
          ctx.restore();
        }
      },
      api: {
        width: W,
        height: H,
        /** eyes("heart") or eyes("star", "happy") for the left and right eye. */
        eyes(left, right = left) {
          for (const shape of [left, right]) if (!EYES[shape]) throw new Error(`Unknown eye "${shape}"`);
          state.eyes = [left, right];
          state.text = null;
          state.hideFace = false;
        },
        mouth(shape) {
          if (!MOUTHS[shape]) throw new Error(`Unknown mouth "${shape}"`);
          state.mouth = shape;
          state.text = null;
          state.hideFace = false;
        },
        set(name) {
          const preset = EXPRESSIONS[name];
          if (!preset) throw new Error(`Unknown expression "${name}"`);
          this.eyes(preset[0], preset[1]);
          this.mouth(preset[2]);
        },
        look(x, y = 0) {
          if (x === undefined) { state.autoLook = true; return; }
          state.autoLook = false;
          state.target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
        },
        blink() { state.blinkUntil = performance.now() / 1000 + 0.14; },
        color(color, glow = color) { state.color = color; state.glow = glow; },
        eyeSize(scale) { state.eyeScale = scale; },
        text(text) { state.text = text ? String(text) : null; },
        draw(fn, { hideFace = true } = {}) { state.draw = fn || null; state.hideFace = !!fn && hideFace; },
        reset() { reset(); },
      },
    };
  })();

  // ---------- Astro: the SVG, its parts and the idle motion ----------

  const container = document.getElementById("astro-box");
  const idleAnimations = new Set();
  const astro = {};

  function startIdle(element, keyframes, options) {
    const animation = element.animate(keyframes, { iterations: Infinity, direction: "alternate", easing: "ease-in-out", ...options });
    // Every idle motion counts from the same start, so a rebuilt Astro picks up where the old one was
    animation.startTime = 0;
    idleAnimations.add(animation);
  }

  function build() {
    for (const animation of idleAnimations) animation.cancel();
    idleAnimations.clear();
    container.innerHTML = ASTRO_SVG;
    const svg = container.querySelector("svg");
    for (const name of PARTS) {
      const element = svg.querySelector(`[data-part="${name}"]`);
      element.style.transformBox = "view-box";
      element.style.transformOrigin = ORIGINS[name];
      astro[name] = element;
    }
    astro.svg = svg;
    face.attach(svg.querySelector("canvas.face"));
    startIdle(container, [{ translate: "0 0" }, { translate: "0 -8px" }], { duration: 1600 });
    const antenna = svg.querySelector('[data-idle="antenna"]');
    antenna.style.transformBox = "view-box";
    antenna.style.transformOrigin = ORIGINS.antenna;
    startIdle(antenna, [{ rotate: "-4deg" }, { rotate: "4deg" }], { duration: 1300 });
    startIdle(svg.querySelector('[data-idle="chest"]'), [{ opacity: 0.65 }, { opacity: 1 }], { duration: 1100 });
  }

  /** Where a part is on the stage: the center of its box, in stage pixels. */
  Object.defineProperty(astro, "at", {
    enumerable: false,
    value(name) {
      const element = typeof name === "string" ? astro[name] : name;
      if (!element) throw new Error(`Unknown part "${name}"`);
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    },
  });

  // ---------- The sign Astro holds up ----------

  const sign = {
    async show(text, ms = 700) {
      const element = astro.sign;
      const label = element.querySelector(".sign-text");
      label.textContent = String(text);
      const length = label.textContent.length;
      label.style.fontSize = `${length > 90 ? 17 : length > 50 ? 21 : length > 24 ? 27 : 34}px`;
      await element.animate(
        [{ opacity: 0, translate: "0 120px", rotate: "-6deg" }, { opacity: 1, translate: "0 0", rotate: "0deg" }],
        { duration: ms, easing: "cubic-bezier(.2,1.4,.4,1)", fill: "forwards" },
      ).finished;
    },
    async hide(ms = 500) {
      await astro.sign.animate([{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 120px" }],
        { duration: ms, easing: "ease-in", fill: "forwards" }).finished;
    },
  };

  // ---------- Running an animation ----------

  async function settle() {
    loops.clear();
    const moving = document.getAnimations().filter((a) => !idleAnimations.has(a));
    const parts = PARTS.map((name) => astro[name]);
    const from = parts.map((element) => {
      const style = getComputedStyle(element);
      return { transform: style.transform, translate: style.translate, rotate: style.rotate, scale: style.scale, opacity: style.opacity };
    });
    for (const animation of moving) animation.cancel();
    face.api.reset();
    face.api.blink();
    const neutral = { transform: "none", translate: "0 0", rotate: "0deg", scale: "1", opacity: 1 };
    await Promise.all(parts.map((element, i) => {
      const to = element === astro.sign ? { ...neutral, opacity: 0 } : neutral;
      return element.animate([from[i], to], { duration: 450, easing: "ease-in-out" }).finished.catch(() => {});
    }));
    // Rebuilt so whatever an animation changed by hand (colors, attributes) is gone too
    build();
  }

  function makeApi(signal, duration) {
    const guard = () => { if (signal.aborted) throw abortError(); };
    const resolve = (target) => {
      const element = typeof target === "string" ? astro[target] : target;
      if (!element) throw new Error(`Unknown part "${target}"`);
      return element;
    };
    return {
      astro, face: face.api, stage, fx, sign, rand, pick, signal, duration,
      /** Web Animations with friendly defaults; resolves when it finishes. A number as options is the duration. */
      animate(target, keyframes, options = 600) {
        guard();
        const timing = typeof options === "number" ? { duration: options } : options;
        const targets = Array.isArray(target) ? target.map(resolve) : [resolve(target)];
        const animations = targets.map((element) =>
          element.animate(keyframes, { easing: "ease-in-out", fill: "forwards", ...timing }));
        return Promise.all(animations.map((a) => a.finished)).then(() => guard(), () => guard());
      },
      wait(ms) {
        guard();
        return new Promise((done, fail) => {
          const timer = setTimeout(done, ms);
          signal.addEventListener("abort", () => { clearTimeout(timer); fail(abortError()); }, { once: true });
        });
      },
      idle(on) {
        for (const animation of idleAnimations) {
          if (on) animation.play();
          else animation.pause();
        }
      },
    };
  }

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const NAMES = ["astro", "face", "stage", "fx", "sign", "animate", "wait", "rand", "pick", "signal", "duration", "idle"];
  let busy = Promise.resolve();

  async function run(id, body, duration) {
    const controller = new AbortController();
    const api = makeApi(controller.signal, duration);
    let failure = null;
    const fail = (error) => {
      if (!failure && !(error && error.name === "AbortError")) failure = error;
      controller.abort();
    };
    onLoopError = fail;
    const onError = (event) => fail(event.error || new Error(event.message));
    const onRejection = (event) => fail(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    try {
      const timer = new Promise((done) => setTimeout(done, duration));
      const stopped = new Promise((done) => controller.signal.addEventListener("abort", done, { once: true }));
      // Runs for the whole duration even if the code ends sooner (Astro idles); an error ends it right away
      Promise.resolve().then(() => body(api)).catch(fail);
      await Promise.race([timer, stopped]);
    } finally {
      controller.abort();
      onLoopError = null;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      await settle();
    }
    if (failure) {
      console.error("Pet animation failed:", failure);
      parent.postMessage({ type: "error", id, message: String(failure && failure.message || failure) }, "*");
    } else parent.postMessage({ type: "done", id }, "*");
  }

  function compile(code) {
    return new AsyncFunction("api", `"use strict";\nconst { ${NAMES.join(", ")} } = api;\n${code}`);
  }

  // The animation of the messages: Astro looks at the viewer, holds up the sign and reads it
  async function messageBody({ text }, { face, sign, animate, wait, fx }) {
    face.set("happy");
    await animate("antenna", [{ rotate: "0deg" }, { rotate: "-14deg" }, { rotate: "10deg" }, { rotate: "0deg" }], 700);
    await sign.show(text);
    fx.burst("stars", { count: 14, speed: 220 });
    face.set("neutral");
    face.look(0, 0.8);
    await wait(1800);
    face.look(0, 0);
    await animate("head", [{ rotate: "0deg" }, { rotate: "6deg" }, { rotate: "-4deg" }, { rotate: "0deg" }], 2400);
    face.set("happy");
    await wait(Math.max(0, messageDuration(text) - 7200));
    await sign.hide();
  }
  const messageDuration = (text) => Math.max(10000, 6000 + String(text).length * 60);

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    // The page may start listening after this loaded, so it asks
    if (data.type === "ping") parent.postMessage({ type: "ready" }, "*");
    if (data.type !== "play" && data.type !== "message") return;
    busy = busy.then(async () => {
      if (data.type === "message") {
        const ms = data.duration || messageDuration(data.text);
        return run(data.id, (api) => messageBody(data, api), ms);
      }
      let body;
      try {
        body = compile(String(data.code));
      } catch (error) {
        parent.postMessage({ type: "error", id: data.id, message: `Syntax: ${error.message}` }, "*");
        return;
      }
      return run(data.id, body, data.duration || 10000);
    });
  });

  build();
  requestAnimationFrame(frame);
  parent.postMessage({ type: "ready" }, "*");
})();
