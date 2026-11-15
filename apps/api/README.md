# API

FastAPI service that reads the APIs of the other apps on the home server (Bluetti, Home Net, LocalTube) and
serves what each card of the dashboard needs. Its only state of its own is the Pet's SQLite database
(`PET_DB_PATH`): Astro's animations and messages for `/pet`.

```sh
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 3021
uv run pytest
```

Every `/dashboard/*` endpoint answers 502 with `{"detail", "source"}` when the app it reads from cannot be reached,
so a card fails on its own instead of the whole page. The `/management/*` endpoints pass the requests of the
Settings pages on to the agent on the server (`AGENT_URL`), answering 502 with `source: "agent"` when it is down.
