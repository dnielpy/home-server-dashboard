// title: Siestecita
face.set("sleepy");
idle(false);
await animate("head", [{ rotate: "0deg" }, { rotate: "12deg", translate: "0 10px" }], 1400);
face.eyes("closed");
face.mouth("flat");
for (let i = 0; i < 3; i++) {
  fx.burst("zzz", { ...astro.at("antennaBall"), count: 3, angle: -Math.PI / 3, spread: 0.5, speed: 70 });
  await animate("root", [{ scale: "1" }, { scale: "1.03" }, { scale: "1" }], 1600);
}
face.set("surprised");
await animate("head", [{ rotate: "12deg", translate: "0 10px" }, { rotate: "0deg", translate: "0 0" }], 250);
idle(true);
await wait(700);
face.set("happy");
