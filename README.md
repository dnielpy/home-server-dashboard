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

**Settings** has three pages. **Server** has the server's CPU, memory, disks and network, and buttons to restart or
power off the whole server, each asking first. **General** has a card per project on the server (whether its containers are running and
since when) to stop, start or restart its containers and read their logs; the dashboard itself can be restarted but
not stopped. **CI/CD** is the update panel, the web version of `home-server.sh`: it compares each project with GitHub,
shows the commits it is missing and runs its `scripts/update.sh` to update and redeploy it, following the steps and
the output live.

The sidebar also has a module per app, with the pages that app's own web app had, in this dashboard's style:

| Module | Pages | Read from |
|---|---|---|
| **Energy** | Live (power flow of the latest reading), Battery (battery level, AC output, runtime estimate), Blackouts (power status and the longest blackouts and periods with power) | Bluetti API |
| **Network** | Live (connection chain and the Nano's download speed every second), Speed test (fast.com), Local speed (from the browser to this server), Stats (connection status, online/offline per day, top devices, bandwidth, outages), Devices (live list with block, limit and rename, and each device's history) | Home Net API |
| **Tools** | Sender: drop files to upload them and send them as a package with a name and a 4 digit PIN; another device on the network opens it with the PIN and downloads its files one by one, and once every file is downloaded the package is deleted from the server. Downloads: paste a link and the server downloads it by itself, retrying every cut and resuming from the bytes it has (also after a restart or a blackout); a finished file has a Download button for the device, which can resume too | This API, on the external disk (`SENDER_DIR`, `DOWNLOADS_DIR`) |

**Events** is a separate host service. It watches both download queues, Bluetti readings and Docker containers,
stores events in `~/.local/state/home-server-events/events.sqlite3`, and sends Telegram notifications through
OpenClaw without invoking a model. The Events page controls each alert and shows delivery status.

## Structure

```
apps/
  api/     FastAPI backend: calls the APIs of the other apps and serves what each card needs (no database)
  web/     Next.js frontend
  agent/   Runs on the server itself, outside Docker: git and docker for the Settings pages (standard library only)
  events/  Runs on the host: event polling, SQLite history and Telegram delivery (standard library only)
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
cp .env.production.example .env.production   # fill in LOCALTUBE_SERVICE_TOKEN, SENDER_HOST_DIR and DOWNLOADS_HOST_DIR
./scripts/update.sh
```

The API container reaches the other apps through the ports they publish on the host (`host.docker.internal`).
The web app is published on `WEB_PORT` (3020) and the API on `API_PORT` (3021).
Sender's packages go to `SENDER_HOST_DIR` and the Downloader's files to `DOWNLOADS_HOST_DIR`, folders on the external
disk that the API container's user (uid 10001) can write to: `sudo mkdir -p <folder> && sudo chown 10001 <folder>`.

### Agent

The Settings pages and the Server cards need the agent running on the host, as the user that owns the projects and
can use Docker. Once:

```bash
./scripts/install-agent.sh            # installs and starts the home-server-agent user service
sudo loginctl enable-linger "$USER"   # so it starts on boot without logging in
```

`install-agent.sh` also asks for your password once to write `/etc/sudoers.d/home-server-agent`, which lets the
agent run `systemctl reboot` and `systemctl poweroff` as root, and nothing else.

It manages every folder with a git repo next to this one (`~/home-server/*`) and listens on port 3022, where the API
container reaches it through `host.docker.internal` (`AGENT_URL`). It has no authentication: keep that port inside the
home network. Updates run in their own process group and keep their state in `~/.local/state/home-server-agent`, so
updating the dashboard itself works: the page reconnects when it is back. `scripts/update.sh` restarts the agent at
the end so it runs the new code; logs with `journalctl --user -u home-server-agent`.

For the Server cards it reads the host's `/proc` and its disks itself, and the cards ask for them every second: CPU
and network speed over the last second, memory, the system disk (`/`) and the external one while it is mounted: the
disk LocalTube keeps its videos on (`MEDIA_PATH` in `local-tube/.env.production`), or `EXTERNAL_DISK_MOUNT` when set.
Every 5 minutes it stores the network speed and the bytes carried in `metrics.sqlite3` in its state folder, for the
7 day chart and totals that keep adding up across reboots.

### Telegram events

Update LocalTube first so `/api/stats/downloads/terminal` is available, then on the server run:

```bash
TELEGRAM_CHAT_ID=<your-telegram-id> ./scripts/install-events.sh
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
```

The installer generates a private `EVENTS_API_TOKEN` in `.env.production`, configures the existing OpenClaw CLI and
state directory, and enables the user service. The dashboard API receives the same token. Keep port 3023 inside the
home network. Check the monitor with `systemctl --user status home-server-events` and
`journalctl --user -u home-server-events -f`. The Events page can queue a Telegram test message.
Explicit delivery failures retry automatically. If OpenClaw times out or the monitor restarts during a send, the
event shows **Delivery unconfirmed** and pauses retries: Telegram may already have received it, so inspect the chat
before sending another test.
