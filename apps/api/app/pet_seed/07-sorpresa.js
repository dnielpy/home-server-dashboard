// title: ¡Algo se movió!
face.look(1, 0);
await wait(900);
face.set("surprised");
face.look(1, 0);
await animate("root", [{ translate: "0 0" }, { translate: "0 -50px" }, { translate: "0 0" }], { duration: 500, easing: "ease-out" });
face.text("!");
await animate(["earL", "earR"], [{ scale: "1" }, { scale: "1.2" }, { scale: "1" }], 400);
await wait(900);
face.set("confused");
face.look(-1, 0);
await wait(1200);
face.look(0, 0);
face.set("happy");
await animate("head", [{ rotate: "0deg" }, { rotate: "-8deg" }, { rotate: "0deg" }], 800);
