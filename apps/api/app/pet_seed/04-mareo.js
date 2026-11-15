// title: Qué mareo
face.set("neutral");
await animate("head", [{ rotate: "0deg" }, { rotate: "25deg" }, { rotate: "-25deg" }, { rotate: "25deg" }, { rotate: "0deg" }], 1200);
face.set("dizzy");
const spin = animate("antennaBall", [{ rotate: "0deg" }, { rotate: "720deg" }], 2400);
await animate("root", [{ rotate: "0deg" }, { rotate: "8deg" }, { rotate: "-8deg" }, { rotate: "6deg" }, { rotate: "-4deg" }, { rotate: "0deg" }], 2600);
await spin;
fx.burst("stars", { ...astro.at("head"), count: 10, speed: 120 });
await wait(800);
face.blink();
face.set("happy");
