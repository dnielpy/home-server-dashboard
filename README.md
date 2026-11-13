# Home Server

Dashboard with the stats of every app on the home server, one card each:

| Card | Read from |
|---|---|
| Bluetti charge (green charged, yellow charging, red discharging) | Bluetti `/battery-estimate` |
| Time until the battery is empty or full | Bluetti `/battery-estimate` |
| Hours with and without power in the last 24 h | Bluetti `/power-totals`, `/power-periods` |
| Battery percentage and load over the last 24 h | Bluetti `/battery-status`, `/ac-output-history` |
| Nano download speed right now, with the last speed test | Home Net `/connection/throughput/current`, `/speed-test/latest` |
| Bandwidth used in the last 24 h, per hour | Home Net `/bandwidth` |
| Device that used the most bandwidth in the last 24 h | Home Net `/device-usage` |
| Videos LocalTube is downloading | LocalTube `/api/stats/downloads/active` |
| Hours each LocalTube profile has watched | LocalTube `/api/stats/watch-time` |
| Server CPU, memory, disks and network right now | Agent `/system` |
| Server network speed over the last 7 days | Agent `/system/traffic` |

The **Management** page has a card per project on the server (whether its containers are running and since when)
and an update panel, the web version of `home-server.sh`: it compares each project with GitHub, shows the commits
it is missing and runs its `scripts/update.sh` to update and redeploy it, following the steps and the output live.

The sidebar also has a module per app, with the pages that app's own web app had, in this dashboard's style:

| Module | Pages | Read from |
|---|---|---|
| **Energy** | Live (power flow of the latest reading), Battery (battery level, AC output, runtime estimate), Blackouts (power status and the longest blackouts and periods with power) | Bluetti API |
| **Network** | Live (connection chain and the Nano's download speed every second), Speed test (fast.com), Local speed (from the browser to this server), Stats (connection status, online/offline per day, top devices, bandwidth, outages), Devices (live list with block, limit and rename, and each device's history) | Home Net API |

## Structure

```
apps/
  api/     FastAPI backend: calls the APIs of the other apps and serves what each card needs (no database)
  web/     Next.js frontend
  agent/   Runs on the server itself, outside Docker: git and docker for the Management page (standard library only)
turbo.json   Task runner config (Turborepo)
```

The browser only talks to the web app; the web app calls this API from the server, and the API calls the other apps
and the agent. The module pages are the exception: the web app reads them straight from each app's API
(`BLUETTI_API_URL`, `HOMENET_API_URL`), as that app's own web app did.
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
`LOCALTUBE_SERVICE_TOKEN` to the `SERVICE_TOKEN` configured in LocalTube's API. In `apps/web/.env.local` point
`BLUETTI_API_URL` and `HOMENET_API_URL` at the Bluetti and Home Net APIs too.

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
| `pnpm test` | Run the API and agent tests |

## Production

```bash
cp .env.production.example .env.production   # fill in LOCALTUBE_SERVICE_TOKEN
./scripts/update.sh
```

The API container reaches the other apps through the ports they publish on the host (`host.docker.internal`).
The web app is published on `WEB_PORT` (3020) and the API on `API_PORT` (3021).

### Agent

The Management page and the Server cards need the agent running on the host, as the user that owns the projects and
can use Docker. Once:

```bash
./scripts/install-agent.sh            # installs and starts the home-server-agent user service
sudo loginctl enable-linger "$USER"   # so it starts on boot without logging in
```

It manages every folder with a git repo next to this one (`~/home-server/*`) and listens on port 3022, where the API
container reaches it through `host.docker.internal` (`AGENT_URL`). It has no authentication: keep that port inside the
home network. Updates run in their own process group and keep their state in `~/.local/state/home-server-agent`, so
updating the dashboard itself works: the page reconnects when it is back. `scripts/update.sh` restarts the agent at
the end so it runs the new code; logs with `journalctl --user -u home-server-agent`.

For the Server cards it reads the host's `/proc` and its disks itself, and the cards ask for them every second: CPU
and network speed over the last second, memory, the system disk (`/`) and the external one while it is mounted: the
disk LocalTube keeps its videos on (`MEDIA_PATH` in `local-tube/.env.production`), or `EXTERNAL_DISK_MOUNT` when set. Every 5 minutes it stores the network speed and the bytes carried in `metrics.sqlite3` in its state folder,
for the 7 day chart and totals that keep adding up across reboots.
