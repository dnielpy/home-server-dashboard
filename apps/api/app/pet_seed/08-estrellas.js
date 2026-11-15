// title: Contando estrellas
face.set("neutral");
face.look(0, -1);
await animate("head", [{ rotate: "0deg" }, { rotate: "-6deg", translate: "0 -6px" }], 800);
const stars = Array.from({ length: 40 }, () => ({ x: rand(stage.width), y: rand(stage.height * 0.45), s: rand(1, 3), p: rand(6) }));
stage.loop((ctx, t) => {
  ctx.fillStyle = "#fff3c4";
  for (const star of stars) {
    ctx.globalAlpha = Math.min(1, t) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + star.p)));
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
    ctx.fill();
  }
});
for (let n = 1; n <= 3; n++) {
  face.text(String(n));
  await animate("chestStar", [{ scale: "1" }, { scale: "1.4" }, { scale: "1" }], 500);
  await wait(500);
}
face.text("∞");
await wait(1000);
face.set("love");
fx.burst("stars", { count: 20, speed: 200 });
