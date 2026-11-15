// title: Hola, humano
face.set("happy");
await animate("armL", [{ rotate: "0deg" }, { rotate: "120deg" }], { duration: 500, easing: "ease-out" });
await animate("armL", [{ rotate: "120deg" }, { rotate: "95deg" }, { rotate: "120deg" }], { duration: 450, iterations: 4 });
face.text("¡HOLA!");
fx.burst("stars", { count: 18, speed: 260 });
await wait(1600);
face.set("wink");
await animate("armL", [{ rotate: "120deg" }, { rotate: "0deg" }], 600);
await animate("head", [{ rotate: "0deg" }, { rotate: "8deg" }, { rotate: "0deg" }], 900);
