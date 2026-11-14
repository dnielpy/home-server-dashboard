#!/bin/sh
# Installs the agent that lets the dashboard update the projects (apps/agent) as a systemd service of this user,
# and lets it reboot and power off the server.
# Run it on the server, as the user that owns the projects and can use docker: ./scripts/install-agent.sh
set -eu

cd "$(dirname "$0")/.."
REPO="$(pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
PYTHON="$(command -v python3)"

mkdir -p "$UNIT_DIR"
cat >"$UNIT_DIR/home-server-agent.service" <<UNIT
[Unit]
Description=Home server agent (updates the projects for the dashboard)
After=network-online.target

[Service]
ExecStart=$PYTHON $REPO/apps/agent/agent.py
Environment=PATH=$PATH
Restart=always
RestartSec=3
# Only the agent itself: an update.sh it started keeps running while it restarts
KillMode=process

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now home-server-agent
systemctl --user restart home-server-agent
systemctl --user --no-pager status home-server-agent | head -5

# The Server page's restart and power off buttons: only those two commands, as root, without a password
SYSTEMCTL="$(command -v systemctl)"
SUDOERS=/etc/sudoers.d/home-server-agent
RULE="$(id -un) ALL=(root) NOPASSWD: $SYSTEMCTL reboot, $SYSTEMCTL poweroff"
if ! sudo -n -l "$SYSTEMCTL" reboot >/dev/null 2>&1; then
    echo
    echo "Allowing the agent to reboot and power off the server (asks for your password once):"
    TMP="$(mktemp)"
    echo "$RULE" >"$TMP"
    if sudo visudo -cf "$TMP" >/dev/null; then
        sudo install -m 0440 -o root -g root "$TMP" "$SUDOERS"
    else
        echo "Could not write $SUDOERS; add this line to it by hand: $RULE" >&2
    fi
    rm -f "$TMP"
fi

if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo
    echo "To start the agent on boot without logging in, run once: sudo loginctl enable-linger $(id -un)"
fi
