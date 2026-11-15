// title: Hora de bailar
face.set("cool");
face.draw((ctx, t, w, h) => {
  for (let i = 0; i < 12; i++) {
    const bar = (Math.sin(t * 7 + i * 0.8) * 0.5 + 0.5) * (h - 40) + 8;
    ctx.fillRect(10 + i * 15.5, h - bar - 14, 10, bar);
  }
});
fx.rain("notes", 7000, 5);
await wait(800);
face.draw(null);
face.set("happy");
for (let i = 0; i < 6; i++) {
  const side = i % 2 ? 1 : -1;
  animate("armL", [{ rotate: "0deg" }, { rotate: `${side > 0 ? 70 : 20}deg` }, { rotate: "0deg" }], 600);
  animate("armR", [{ rotate: "0deg" }, { rotate: `${side > 0 ? -20 : -70}deg` }, { rotate: "0deg" }], 600);
  animate("head", [{ rotate: "0deg" }, { rotate: `${side * 10}deg` }, { rotate: "0deg" }], 600);
  await animate("root", [{ translate: "0 0" }, { translate: `${side * 18}px -14px` }, { translate: "0 0" }], 600);
}
fx.burst("confetti", { count: 40 });
face.set("wink");
