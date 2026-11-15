# Guía de animaciones de Astro (Pet)

La página `/pet` muestra a Astro a pantalla completa en la pantalla del home server, como la Sphere de Las Vegas:
un robot que hace caras y cosas. Cada animación dura **10 segundos** y se elige al azar. Tú escribes su código.

## Cómo es Astro

Robot sentado de estilo **neón**: cuerpo de cristal oscuro con contornos de tubo de neón azul, cabeza grande y
redonda con una franja blanca, un visor negro que es una **pantalla LED** (ahí van los ojos y la boca, en blanco con
brillo azul), auriculares con aros de neón rojo, antena blanca con una bola roja y un anillo azul, una estrella roja
brillante en el pecho, brazos con bandas rojas y pies redondos con arcos rojos. Colores: azul `#27e8ff`, rojo
`#ff2e63` y blanco `#f4fbff`, sobre un fondo casi negro. Por
defecto tiene ojos de estrella y una sonrisa. Siempre está "vivo": flota un poco, parpadea, mira a los lados y la
antena se balancea, aunque la animación no haga nada.

## El formato

Una animación es un **título** (único, 1–60 caracteres, en español, p. ej. "Astro estornuda") y un **código**: el
cuerpo de una función `async` de JavaScript (no escribas `function`, ni `export`, ni `import`; solo las
sentencias). Ya tienes estas variables:

| Nombre | Qué es |
|---|---|
| `astro` | Las piezas del robot (nodos SVG): `root` (todo el robot), `head`, `visor`, `antenna`, `antennaBall`, `earL`, `earR`, `body`, `chestStar`, `armL`, `armR`, `legL`, `legR`, `shadow` (la sombra en el suelo), `sign` (el cartel). Cada una gira desde su articulación (la cabeza desde el cuello, los brazos desde el hombro). `astro.at("head")` → `{x, y}` en píxeles del stage. |
| `animate(pieza, keyframes, opciones)` | Web Animations API. `pieza` es un nodo, un nombre (`"head"`) o un array. `opciones` es la duración en ms o un objeto (`{duration, easing, iterations, direction, delay}`). Por defecto `easing: "ease-in-out"` y `fill: "forwards"` (la pose se queda). Devuelve una promesa: usa `await` para encadenar, o no la esperes para mover varias piezas a la vez. |
| `face` | La pantalla del visor (ver abajo). |
| `fx` | Partículas: `fx.burst(tipo, {x, y, count, speed, angle, spread})` y `fx.rain(tipo, ms, porSegundo)`. Tipos: `confetti`, `hearts`, `stars`, `notes`, `zzz`, `bubbles`, `sparks`. Sin `x/y` salen de la cabeza. |
| `stage` | Canvas a pantalla completa **detrás** de Astro: `stage.ctx`, `stage.width`, `stage.height`, `stage.loop((ctx, t, dt) => { … })` dibuja cada frame (se borra solo entre frames; devuelve `false` para parar). |
| `sign` | El cartel: `await sign.show("texto")`, `await sign.hide()`. |
| `wait(ms)` | Pausa. |
| `rand(a, b)`, `pick(array)` | Azar. |
| `idle(false / true)` | Pausa o reanuda la flotación de fondo. |
| `signal`, `duration` | La señal que se aborta a los 10 s y la duración (10000). |

### Mover piezas

Usa las propiedades individuales `translate`, `rotate`, `scale` y `opacity` (se pueden combinar en paralelo sin
pisarse si van en animaciones distintas):

```js
animate("head", [{ rotate: "0deg" }, { rotate: "-15deg" }], 400);
animate("root", [{ translate: "0 0" }, { translate: "0 -60px" }, { translate: "0 0" }], { duration: 700, easing: "ease-out" });
animate(["armL", "armR"], [{ rotate: "0deg" }, { rotate: "25deg" }], 500);
```

Ángulos útiles: `armL` sube hacia afuera con `rotate` positivo (≈ `90deg` lo pone horizontal), `armR` con negativo.
La cabeza se ve bien entre `-20deg` y `20deg`. Las coordenadas del dibujo van de 0 a 400 de ancho y 0 a 460 de alto.

### La cara (`face`)

- `face.set(expresión)`: `neutral`, `happy`, `love`, `dizzy`, `sleepy`, `surprised`, `angry`, `sad`, `rich`,
  `wink`, `confused`, `dead`, `cool`, `cat`.
- `face.eyes(forma)` o `face.eyes(izquierdo, derecho)`: `star`, `heart`, `happy`, `closed`, `sleepy`, `wide`,
  `dot`, `x`, `spiral`, `angry`, `dollar`, `question`, `sad`.
- `face.mouth(forma)`: `smile`, `grin`, `open`, `wow`, `flat`, `frown`, `tongue`, `wave`, `cat`, `none`.
- `face.look(x, y)` (−1…1) mira hacia un lado; `face.look()` vuelve a mirar solo.
- `face.blink()`, `face.eyeSize(1.4)`, `face.color("#ff2e63")` (por defecto blanco con brillo azul; `face.color(color, brillo)`).
- `face.text("¡HOLA!")` escribe en el visor (corto); `face.text(null)` lo quita.
- `face.draw((ctx, t, w, h) => { … })` dibuja libre en el visor cada frame (200 × 144, fondo negro, trazo y relleno
  ya en el color de la cara con brillo). Esconde los ojos y la boca; `face.draw(fn, {hideFace: false})` dibuja
  encima de ellos; `face.draw(null)` lo quita. Ideal para caras estilo Sphere: ondas, emojis, latidos, lluvia de
  píxeles, un ecualizador…

## Reglas

- Dura como mucho 10 s: a los 10 s se corta y Astro vuelve solo a su pose y su cara normales. Puedes terminar
  antes; el resto del tiempo flota tranquilo. No hace falta dejarlo como estaba.
- Sin red ni almacenamiento (`fetch`, `localStorage`… están bloqueados) y sin tocar `document` ni `window`: usa
  solo lo de arriba.
- Nada de bucles síncronos largos (`while (true)` sin `await` congela la pantalla). Para repetir algo usa
  `iterations` en `animate`, `for` con `await`, o `stage.loop`.
- Si la animación lanza un error tres veces, se desactiva sola.

## Ideas de estilo

- Que tenga una pequeña historia en 10 s: algo pasa, Astro reacciona, remate.
- La cara es lo más expresivo: cambia ojos y boca en el momento justo, como la Sphere.
- Combina cuerpo + cara + partículas. Movimientos suaves; nada de parpadeos agresivos.
- Respeta la paleta neón (azul, rojo, blanco) cuando dibujes en el stage o el visor.
- Que sea distinta de las que ya existen: otra emoción, otra acción, otro truco visual.

## Ejemplos

**Astro estornuda**
```js
face.set("surprised");
await animate("head", [{ rotate: "0deg" }, { rotate: "-10deg", translate: "0 -6px" }], 900);
face.eyes("closed"); face.mouth("open");
await wait(500);
face.text("¡ACHÚ!");
fx.burst("bubbles", { count: 30, speed: 420 });
await animate("head", [{ rotate: "-10deg" }, { rotate: "14deg", translate: "0 8px" }, { rotate: "0deg", translate: "0 0" }], 500);
await wait(1200);
face.set("happy");
await animate("antenna", [{ rotate: "0deg" }, { rotate: "18deg" }, { rotate: "-12deg" }, { rotate: "0deg" }], 900);
```

**Ecualizador en el visor**
```js
face.draw((ctx, t, w, h) => {
  for (let i = 0; i < 12; i++) {
    const bar = (Math.sin(t * 6 + i) * 0.5 + 0.5) * (h - 30) + 10;
    ctx.fillRect(10 + i * 15.5, h - bar - 10, 10, bar);
  }
});
fx.rain("notes", 6000, 6);
for (let i = 0; i < 8; i++) {
  await animate("root", [{ rotate: "0deg" }, { rotate: i % 2 ? "6deg" : "-6deg" }, { rotate: "0deg" }], 600);
}
```
