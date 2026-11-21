# API

FastAPI service that reads the APIs of the other apps on the home server (Bluetti, Home Net, LocalTube) and
serves what each card of the dashboard needs. Sender, Downloads and Telegram persist their own state on disk.

```sh
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 3021
uv run pytest
```

Every `/dashboard/*` endpoint answers 502 with `{"detail", "source"}` when the app it reads from cannot be reached,
so a card fails on its own instead of the whole page. The `/management/*` endpoints pass the requests of the
Settings pages on to the agent on the server (`AGENT_URL`), answering 502 with `source: "agent"` when it is down.

The optional Telegram bot runs in the API lifespan with a single long-polling worker. Configure `TELEGRAM_BOT_TOKEN`
and `TELEGRAM_STATE_DIR` (default `./data/telegram`). The optional `TELEGRAM_OWNER_USER_ID` seeds the initial user once;
the persisted user list controls access afterwards. `GET /telegram/status` returns connection state and metrics without credentials; `GET /telegram/commands`
lists the registry; `PATCH /telegram/commands/{name}` with `{"enabled": false}` persists a switch immediately. These
administrative routes follow the dashboard's existing trusted local network/VPN access model. See the root README
for BotFather setup, persistence and operational details.

`GET /telegram/users` lists authorized users. `GET /telegram/enrollment` reports the current enrollment state;
`POST /telegram/enrollment` opens a five-minute window (repeated calls preserve its expiry), and
`DELETE /telegram/enrollment` cancels it. The first private `/add` captures its sender and closes the listener.
`POST /telegram/users` with `{"user_id": 123, "name": "Familia"}` authorizes only that captured account after validating
the name. `DELETE /telegram/users/{user_id}` revokes access immediately. Enrollment is in memory and cancels on restart;
registered users persist in `state.json`. Stale or incompatible enrollment actions return 409, invalid input 422,
unknown users 404, and storage failures 503.
