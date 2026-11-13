# Home Server

Dashboard with the stats of every app on the home server, one card each:

| Card | Read from |
|---|---|
| Bluetti charge (green charged, yellow charging, red discharging) | Bluetti `/battery-estimate` |
| Time until the battery is empty or full | Bluetti `/battery-estimate` |
| Hours with and without power in the last 24 h | Bluetti `/power-totals`, `/power-periods` |
| Nano download speed right now | Home Net `/connection/throughput/current` |
| Bandwidth used in the last 24 h | Home Net `/bandwidth` |
| Device that used the most bandwidth in the last 24 h | Home Net `/device-usage` |
| Videos LocalTube is downloading | LocalTube `/api/stats/downloads/active` |
| Hours each LocalTube profile has watched | LocalTube `/api/stats/watch-time` |

## Structure

```
apps/
  api/   FastAPI backend: calls the APIs of the other apps and serves what each card needs (no database)
  web/   Next.js frontend
turbo.json   Task runner config (Turborepo)
```

The browser only talks to the web app; the web app calls this API from the server, and the API calls the other apps.
When one of them is down only its cards show an error.

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python 3.12)
- Node.js 24 and [pnpm](https://pnpm.io/) 11
- The Bluetti, Home Net and LocalTube APIs running somewhere this API can reach

## Setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm install
cd apps/api && uv sync && cd ../..
```

In `apps/api/.env` point `BLUETTI_API_URL`, `HOMENET_API_URL` and `LOCALTUBE_API_URL` at the other apps, and set
`LOCALTUBE_SERVICE_TOKEN` to the `SERVICE_TOKEN` configured in LocalTube's API.

## Development

```bash
pnpm dev
```

- API: http://localhost:3021 (Swagger at http://localhost:3021/docs)
- Web: http://localhost:3020

| Command | Description |
|---|---|
| `pnpm dev` | Run the API and the web app with auto reload |
| `pnpm dev:api` / `pnpm dev:web` | Run only one of them |
| `pnpm build` | Build the web app |
| `pnpm lint` | Lint the web app |
| `pnpm test` | Run the API tests |

## Production

```bash
cp .env.production.example .env.production   # fill in LOCALTUBE_SERVICE_TOKEN
./scripts/update.sh
```

The API container reaches the other apps through the ports they publish on the host (`host.docker.internal`).
The web app is published on `WEB_PORT` (3020) and the API on `API_PORT` (3021).
