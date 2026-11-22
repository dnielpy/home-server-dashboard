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
| **Tools** | Sender: drop files to upload them and send them as a package with a name and a 4 digit PIN; another device on the network opens it with the PIN and downloads its files one by one, and once every file is downloaded the package is deleted from the server. Downloads are done by JDownloader in its own project (`downloader`). Files: a file manager for the external disk: open its folders, download a file or a whole folder as a zip, rename, delete and create folders, and move or copy files and folders to another folder of the disk (copies run in the background with their progress, and can be cancelled). Several files and folders can be checked to download them in one zip, copy, move or delete them together; the actions of each are in its ⋯ menu. Docker's data and `lost+found` are not shown, and the folders the apps write to (`videos`, `sender`, `downloads`, `gallery`, `openclaw`) cannot be renamed, moved or deleted, only what is in them | This API, on the external disk (`SENDER_DIR`); Files: the agent, as the server's user (`apps/agent/files.py`) |
| **Telegram** | Bot connection, uptime, latest start, historical command count and persistent command switches. Users: register a private Telegram account through a five-minute `/add` window, give it a name and manage its access. `/stats` is a quick summary; `/battery`, `/internet`, `/server` and `/downloads` give the detail of each; `/help` lists them. A link sent in the chat is offered for the video downloader | Dashboard API background bot, Bluetti, Home Net, agent and video downloader APIs |

**Astro** has Chat, Skills and Memoria pages. Its host bridge connects to the local OpenClaw Gateway with a private
token. Dashboard chats have their own context, separate from Telegram, and share Astro's skills and memory.

## Structure

```
apps/
  api/     FastAPI backend: calls the other apps, serves the dashboard and runs its private Telegram bot
  web/     Next.js frontend
  agent/   Runs on the server itself, outside Docker: git and docker for the Settings pages (standard library only)
  astro/   Runs on the host: narrow OpenClaw Gateway bridge for Chat, Skills and Memoria
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
cp .env.production.example .env.production   # fill in LOCALTUBE_SERVICE_TOKEN and SENDER_HOST_DIR
./scripts/update.sh
```

The API container reaches the other apps through the ports they publish on the host (`host.docker.internal`).
The web app is published on `WEB_PORT` (3020) and the API on `API_PORT` (3021).
Sender's packages go to `SENDER_HOST_DIR`, a folder on the external disk that the API container's user (uid 10001) can
write to: `sudo mkdir -p <folder> && sudo chown 10001 <folder>`.

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

### Astro

After installing OpenClaw and its Gateway, run `./scripts/install-astro.sh` on the server. This creates a private
`ASTRO_API_TOKEN` in `.env.production` and starts the `home-server-astro` user service on port 3024. The dashboard API
uses the same token. Rebuild the API and web containers so they receive the new setting. Check the service with
`systemctl --user status home-server-astro` and `journalctl --user -u home-server-astro -f`.

The browser never receives the OpenClaw Gateway token. Keep the dashboard and its API on a trusted local network or
VPN. The bridge reads and changes only dashboard chats and Astro's skills and curated memory.
Memory saves use Gateway compare-and-set plus OpenClaw's memory provenance store, then verify both the saved bytes and
trusted provenance. The provenance function is an internal OpenClaw interface; after upgrading OpenClaw, reinstall the
bridge and verify memory editing. If the interface is unavailable, the bridge refuses edits instead of overwriting a
memory file without its trust record.

### Telegram

Create a **new, dedicated bot** with `/newbot` in [@BotFather](https://t.me/BotFather), separate from Astro/OpenClaw.
Save its token as `TELEGRAM_BOT_TOKEN` in `apps/api/.env` for development or `.env.production` on the server.
Without a token the rest of the dashboard works and Telegram shows the missing configuration. Keep the token in the
server environment; the web app never receives it. `TELEGRAM_OWNER_USER_ID` is now optional: it seeds the initial user
as “Propietario” when creating or migrating a state file that has no user registry yet. Existing installations retain
that user's access, their counter and command switches. Afterwards the saved user list is authoritative, so deleting
the initial user also removes its access and restarting does not re-add it.

Restart the API after changing these settings (in production, use `./scripts/update.sh`). Open the new bot in Telegram,
press **Start**, register the account as described below if needed, then send `/stats`. Only registered users' private
chats can run commands; groups and other users are ignored except for `/add` during an open enrollment window.
Every command is enabled initially. The Telegram page can disable or reenable each one
immediately, and the bot also synchronizes Telegram's command menu. Other slash commands receive “Comando no disponible”.

| Command | Reply |
| --- | --- |
| `/help` (also `/start`) | The enabled commands with their descriptions |
| `/stats` | Quick summary: grid power, Bluetti charge and runtime, internet |
| `/battery` | Bluetti charge, state, load, time to reserve or to full, grid power now and since when, hours with and without power and outages (of a minute or more) in 24 h |
| `/internet` | Online or not (and the failing hop), latency, current speed, last speed test, 24 h usage and the top device |
| `/server` | CPU, RAM and each disk with bars, network now and in total, uptime and how the last shutdown went |
| `/downloads` | The video downloader's current speed, its active, waiting and paused downloads with progress and ETA |

Any other text from a registered user is checked for an `http(s)` link. The bot asks whether to add it, with
**Sí, a Descargas**, **Sí, a Galería** and **No** buttons; a yes queues it in the video downloader (`VIDEO_DOWNLOADER_URL`,
its web app's `/api/downloads`). The question expires after 15 minutes or an API restart, a pressed button never queues
the link twice, and a refused link keeps the buttons to try again. Links follow the `/downloads` switch.

#### Alerts

Every 30 seconds the bot also checks, on its own, and messages every registered user when:

| Alert | When |
| --- | --- |
| 🚨 Se fue la luz | A fresh Bluetti reading shows no AC input for at least a minute, with the battery and runtime |
| ✅ Vino la luz | AC input is back for at least a minute, with how long the outage lasted |
| 🌐 Volvió internet | Home Net (`/connection-status`) closes an outage of a minute or more: when it went, when it came back, how long and which hop failed. It can only be sent once internet is back |
| ✅ Descarga terminada | A video downloader download becomes complete (several at once go in one message) |

Changes shorter than a minute (the Bluetti's AC input flickers for a few seconds now and then) are not told. What the
bot last saw is kept in `state.json`, so a restart neither repeats an alert nor misses a change made meanwhile, and the
first look at each source after enabling only records it. Alerts that Telegram cannot take yet wait in an outbox
in the same file and go out on a later check. Set `TELEGRAM_ALERTS=false` to turn them off.

Under **Telegram → Usuarios**, press **Agregar usuario** while the bot is connected. From the account to add, send
`/add` to the bot in a private chat. The window closes automatically after **five minutes**, or immediately after the
first eligible `/add`, whichever comes first. Repeated clicks do not extend it, old queued messages cannot claim it,
and only one account is captured. An already registered account closes the window without creating a duplicate.
The page shows the detected Telegram name, username and ID; enter a display name and press **Guardar usuario** to
grant access. Detection alone does not authorize the account. You can cancel an open window or a captured registration.
Once an ID is captured the bot stops listening for more registrations, even while you are entering the name.

The list supports deleting any registered account, which revokes access immediately, including replies still being
prepared. Registered users survive API restarts. Enrollment windows and captured-but-unsaved registrations are kept
only in memory and are canceled on restart; they never reopen automatically. `/add` does not register anyone outside
an explicitly opened window. Enrollment acknowledgements from unregistered accounts do not increase the command count.

The bot uses outbound HTTPS long polling, so no public endpoint or incoming port is needed. Run **one API worker and
one polling instance per bot token**; don't share it with OpenClaw or a webhook. The page shows connection problems,
invalid tokens and polling conflicts. Network failures retry automatically, respecting Telegram's rate limits. If the
home server has no internet, Telegram must wait for connectivity to return. Telegram retains pending updates for up to
24 hours; it cannot answer while the home server is offline.

`/stats` uses the latest stored readings from Bluetti and Home Net, with dates in the same UTC−4 zone as the dashboard.
Readings older than three minutes are explicitly marked as the last reading. A failed source doesn't hide the other
values. Runtime is **to Bluetti's configured reserve percentage**, not to an empty battery; while charging, the estimate
is to full charge. Missing estimates remain unavailable rather than being invented.

Uptime and latest start belong to the bot process and reset on an API restart, not on reconnection. The historical
counter includes authorized slash commands (including unknown or disabled ones), messages and button presses, but excludes
unauthorized users and dashboard requests. The counter, switches, users and update cursor live in an atomically replaced
`state.json` under `TELEGRAM_STATE_DIR` (`apps/api/data/telegram` by default in development). Docker mounts the persistent
`telegram-state` volume there, owned by the API user. Normal updates preserve it; include this volume in backups and
don't use `docker compose down -v` if you want to keep its history. A different bot token for the same bot preserves
the cursor; a different bot identity resets the cursor while preserving the historical count and switches.

Processed updates are not counted again after reconnecting or restarting. As with any Telegram `sendMessage` call,
an interrupted connection or a crash immediately after sending can cause a duplicate reply when retried; the count
still advances only once. A corrupt or unwritable state file stops the bot and shows an error without stopping the
dashboard or silently resetting its history.
