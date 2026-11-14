#!/bin/sh
# Run on the server after filling .env.production and installing OpenClaw.
set -eu

cd "$(dirname "$0")/.."
REPO=$(pwd)
ENV_FILE=$REPO/.env.production
UNIT_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
PYTHON=$(command -v python3)

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE" >&2
    exit 1
fi

if ! grep -q '^EVENTS_API_TOKEN=' "$ENV_FILE"; then
    TOKEN=$($PYTHON -c 'import secrets; print(secrets.token_hex(32))')
    printf '\nEVENTS_API_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi
if ! grep -q '^TELEGRAM_CHAT_ID=' "$ENV_FILE"; then
    if [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
        echo "Set TELEGRAM_CHAT_ID when first running this script" >&2
        exit 1
    fi
    printf 'TELEGRAM_CHAT_ID=%s\n' "$TELEGRAM_CHAT_ID" >> "$ENV_FILE"
fi
if ! grep -q '^OPENCLAW_BIN=' "$ENV_FILE"; then
    printf 'OPENCLAW_BIN=%s\n' "${OPENCLAW_BIN:-/mnt/localtube/openclaw/cli/bin/openclaw}" >> "$ENV_FILE"
fi
if ! grep -q '^OPENCLAW_STATE_DIR=' "$ENV_FILE"; then
    printf 'OPENCLAW_STATE_DIR=%s\n' "${OPENCLAW_STATE_DIR:-/mnt/localtube/openclaw/state}" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/home-server-events.service" <<UNIT
[Unit]
Description=Home server Telegram event monitor
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO/apps/events
EnvironmentFile=$ENV_FILE
ExecStart=$PYTHON $REPO/apps/events/events.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now home-server-events.service
systemctl --user restart home-server-events.service
systemctl --user --no-pager status home-server-events.service | head -8

if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo "For startup before login: sudo loginctl enable-linger $(id -un)"
fi
