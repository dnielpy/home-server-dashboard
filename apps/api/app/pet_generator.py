"""Asks Astro for a new animation for the Pet every so often. Astro writes it following pet_guide.md and saves it
itself with POST /pet/animations, and sometimes leaves a message for the sign with POST /pet/messages, so the request
only has to be sent; the answer shows up as new rows."""

import asyncio
import logging
from pathlib import Path

import httpx

from app.config import Settings
from app.pet import PetStore

log = logging.getLogger(__name__)

GUIDE = (Path(__file__).parent / "pet_guide.md").read_text()

SAVE_SCRIPT = """python3 - "<título>" /tmp/astro-pet-animation.js <<'PY'
import json, sys, urllib.error, urllib.request
title, path = sys.argv[1], sys.argv[2]
body = json.dumps({{"title": title, "code": open(path).read(), "source": "ai"}}).encode()
request = urllib.request.Request("{url}/pet/animations", body, {{"Content-Type": "application/json"}})
try:
    print(urllib.request.urlopen(request).status)
except urllib.error.HTTPError as error:
    print(error.code, error.read().decode())
PY"""

MESSAGE_SCRIPT = """python3 - "<mensaje>" <<'PY'
import json, sys, urllib.error, urllib.request
body = json.dumps({{"text": sys.argv[1], "source": "ai"}}).encode()
request = urllib.request.Request("{url}/pet/messages", body, {{"Content-Type": "application/json"}})
try:
    print(urllib.request.urlopen(request).status)
except urllib.error.HTTPError as error:
    print(error.code, error.read().decode())
PY"""


class GenerationFailed(Exception):
    pass


def build_prompt(titles: list[str], messages: list[str], save_url: str) -> str:
    existing = "\n".join(f"- {title}" for title in titles) or "- (ninguna todavía)"
    said = "\n".join(f"- {text}" for text in messages) or "- (ninguno todavía)"
    url = save_url.rstrip("/")
    return f"""Tarea automática del módulo Pet (no hace falta responderme, solo hazla).

Eres Astro. En la pantalla del home server hay una página, /pet, donde apareces a pantalla completa haciendo
animaciones de 10 segundos, al estilo de la Sphere de Las Vegas. Inventa UNA animación nueva tuya: con una idea
propia, expresiva y divertida, distinta de las que ya existen. Sigue al pie de la letra esta guía:

{GUIDE}

## Animaciones que ya existen (no repitas la idea ni el título)

{existing}

## Cómo guardarla

1. Escribe el código (solo el cuerpo de la función, sin bloques ```) en /tmp/astro-pet-animation.js.
2. Guárdala con este comando, cambiando <título> por el título:

{SAVE_SCRIPT.format(url=url)}

Si imprime 201, ya está. Si imprime 409, el título ya existe: elige otro y vuelve a ejecutarlo. Si imprime 422,
revisa los límites (título de 1 a 60 caracteres, código de hasta 20000) y corrígelo.

## Opcional: un mensaje para el cartel

Una de cada cinco escenas de /pet es Astro sacando un cartel con un mensaje. Si se te ocurre algo que valga la pena
(un saludo según la hora, una curiosidad, ánimo, una broma sobre el home server, algo que sepas del usuario), puedes
dejar UN mensaje tuyo, de 1 a 140 caracteres, en español y corto (se lee en una pantalla). No lo hagas siempre:
más o menos una de cada tres veces. No repitas ni parafrasees estos, que ya están:

{said}

Para guardarlo, cambia <mensaje> por el texto:

{MESSAGE_SCRIPT.format(url=url)}
"""


async def request_animation(store: PetStore, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
    """Sends Astro the request for a new animation and records it; raises GenerationFailed when it cannot."""
    if not settings.astro_api_token:
        await asyncio.to_thread(store.add_generation, "failed", "Astro is not configured (ASTRO_API_TOKEN)")
        raise GenerationFailed("Astro is not configured")
    titles, messages = await asyncio.gather(asyncio.to_thread(store.titles), asyncio.to_thread(store.message_texts))
    prompt = build_prompt(titles, messages, settings.pet_save_url)
    try:
        async with httpx.AsyncClient(base_url=settings.astro_api_url, timeout=60, transport=transport) as client:
            response = await client.post(
                "/pet/runs", json={"message": prompt}, headers={"X-Astro-Token": settings.astro_api_token}
            )
        response.raise_for_status()
    except httpx.HTTPError as error:
        detail = str(error) or type(error).__name__
        await asyncio.to_thread(store.add_generation, "failed", detail)
        raise GenerationFailed(detail) from error
    await asyncio.to_thread(store.add_generation, "sent", None)


async def run_pet_generator(store: PetStore, settings: Settings) -> None:
    """Asks for a new animation every pet_generate_minutes, starting one period after the API starts."""
    while True:
        await asyncio.sleep(settings.pet_generate_minutes * 60)
        try:
            await request_animation(store, settings)
        except GenerationFailed as error:
            log.warning("Could not ask Astro for a new Pet animation: %s", error)
