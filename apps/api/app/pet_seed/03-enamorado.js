// title: Ojos de corazón
face.set("love");
face.eyeSize(1);
for (let i = 0; i < 4; i++) {
  face.eyeSize(1.35);
  await wait(180);
  face.eyeSize(1);
  await wait(320);
}
fx.burst("hearts", { count: 26, speed: 300 });
await animate("chestStar", [{ scale: "1" }, { scale: "1.6" }, { scale: "1" }], { duration: 500, iterations: 3 });
await animate("root", [{ rotate: "0deg" }, { rotate: "-5deg" }, { rotate: "5deg" }, { rotate: "0deg" }], 1600);
face.mouth("tongue");
fx.burst("hearts", { count: 14, speed: 200 });
