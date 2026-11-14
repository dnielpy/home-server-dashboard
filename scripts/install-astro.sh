#!/bin/sh
# Install Astro's private host bridge after OpenClaw is installed.
set -eu

cd "$(dirname "$0")/.."
REPO=$(pwd)
ENV_FILE=$REPO/.env.production
UNIT_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
NODE=${OPENCLAW_NODE:-/mnt/localtube/openclaw/cli/tools/node/bin/node}
NODE_REAL=$(readlink -f "$NODE")
OPENCLAW_DIST_DIR=$(dirname "$NODE_REAL")/../lib/node_modules/openclaw/dist

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE" >&2
    exit 1
fi
if [ ! -x "$NODE" ]; then
    echo "Missing Node at $NODE" >&2
    exit 1
fi
if [ ! -d "$OPENCLAW_DIST_DIR" ]; then
    echo "Missing OpenClaw runtime at $OPENCLAW_DIST_DIR" >&2
    exit 1
fi
if ! grep -q '^ASTRO_API_TOKEN=' "$ENV_FILE"; then
    TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    printf '\nASTRO_API_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi
if ! grep -q '^OPENCLAW_STATE_DIR=' "$ENV_FILE"; then
    printf 'OPENCLAW_STATE_DIR=%s\n' "${OPENCLAW_STATE_DIR:-/mnt/localtube/openclaw/state}" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/home-server-astro.service" <<UNIT
[Unit]
Description=Home server Astro dashboard bridge
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
Environment=OPENCLAW_DIST_DIR=$OPENCLAW_DIST_DIR
ExecStart=$NODE $REPO/apps/astro/bridge.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now home-server-astro.service
systemctl --user restart home-server-astro.service
systemctl --user --no-pager status home-server-astro.service | head -8

if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo "For startup before login: sudo loginctl enable-linger $(id -un)"
fi
