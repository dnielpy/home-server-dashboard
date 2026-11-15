// title: Escaneando la zona
face.draw((ctx, t, w, h) => {
  const x = (Math.sin(t * 2.2) * 0.5 + 0.5) * w;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, h / 2 - 1, w, 2);
  ctx.globalAlpha = 1;
  ctx.fillRect(x - 3, 10, 6, h - 20);
});
const ping = stage.loop((ctx, t) => {
  const { x, y } = astro.at("antennaBall");
  for (let i = 0; i < 3; i++) {
    const r = ((t * 120 + i * 80) % 240);
    ctx.strokeStyle = `rgba(39, 232, 255, ${1 - r / 240})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
});
await animate("head", [{ rotate: "0deg" }, { rotate: "-14deg" }, { rotate: "14deg" }, { rotate: "0deg" }], 4200);
ping();
face.draw(null);
face.text("OK ✓");
await animate("antennaBall", [{ scale: "1" }, { scale: "1.5" }, { scale: "1" }], 500);
await wait(1500);
face.set("happy");
