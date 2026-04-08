#!/usr/bin/env bash
# setup-https-dev.sh — full HTTPS dev cert setup for cms-admin
#
# What this script does, end to end:
#   1. Installs mkcert + nss via brew if missing
#   2. Runs `mkcert -install` so the local CA is trusted by Chrome / Safari /
#      every other browser on this Mac (one-time sudo prompt for Keychain)
#   3. (Re)generates the cert for cms-admin covering localhost, 127.0.0.1,
#      ::1, and every non-internal IPv4 LAN address found on this machine
#   4. Reloads PM2 cms-admin so dev:https picks up the new cert
#   5. Spins up a tiny HTTP server on a random port serving the mkcert
#      rootCA.pem AND prints a QR code pointing at it — scan with the iPhone
#      camera, Safari downloads the profile, and you install it via
#      Settings → General → VPN & Device Management → Trust
#
# Re-run this script any time:
#   - You move to a new WiFi network and the LAN IP changes
#   - The cert is about to expire
#   - You wipe and reinstall macOS
#
# Requires: macOS, brew, pm2 (already installed for the dev pool)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$REPO_ROOT/packages/cms-admin/.certs"
CERT_FILE="$CERT_DIR/localhost.pem"
KEY_FILE="$CERT_DIR/localhost-key.pem"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }

cyan "▶ Step 1/5  Verify mkcert is installed"
if ! command -v mkcert >/dev/null 2>&1; then
  yellow "  mkcert not found — installing via brew"
  brew install mkcert nss
else
  green "  mkcert already present ($(mkcert -version))"
fi

cyan "▶ Step 2/5  Install mkcert root CA into the system trust store"
yellow "  This is the step that makes Chrome / Safari stop showing 'Not Secure'."
yellow "  macOS will prompt for your password to add the CA to System Keychain."
mkcert -install

ROOT_CA="$(mkcert -CAROOT)/rootCA.pem"
if [[ ! -f "$ROOT_CA" ]]; then
  red "  rootCA.pem not found at $ROOT_CA — something went wrong"
  exit 1
fi
green "  rootCA installed at: $ROOT_CA"

cyan "▶ Step 3/5  Generate cms-admin cert covering localhost + LAN IPs"
mkdir -p "$CERT_DIR"

# Collect every non-internal IPv4 + IPv6 address — phone may be on either
LAN_IPS=()
while IFS= read -r ip; do
  [[ -n "$ip" ]] && LAN_IPS+=("$ip")
done < <(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2}')

SAN_LIST=("localhost" "127.0.0.1" "::1")
SAN_LIST+=("${LAN_IPS[@]}")

green "  SANs: ${SAN_LIST[*]}"
mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "${SAN_LIST[@]}"

cyan "▶ Step 4/5  Reload PM2 cms-admin so dev:https picks up the new cert"
if pm2 list 2>/dev/null | grep -q cms-admin; then
  (cd "$REPO_ROOT" && pm2 reload ecosystem.config.js --only cms-admin)
  green "  cms-admin reloaded"
else
  yellow "  cms-admin is not currently in PM2 — start it with:"
  yellow "    cd $REPO_ROOT && pm2 start ecosystem.config.js --only cms-admin"
fi

cyan "▶ Step 5/5  Serve rootCA.pem to your phone"

# Pick a random free port
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("",0));print(s.getsockname()[1]);s.close()')

# Pick the first LAN IP (the phone needs to reach this Mac on this address)
PRIMARY_IP="${LAN_IPS[0]:-}"
if [[ -z "$PRIMARY_IP" ]]; then
  red "  No LAN IP found — connect to WiFi and re-run"
  exit 1
fi

URL="http://${PRIMARY_IP}:${PORT}/rootCA.pem"

# Stage the file in a temp dir with the right mime type
SERVE_DIR="$(mktemp -d)"
cp "$ROOT_CA" "$SERVE_DIR/rootCA.pem"

# Background HTTP server that exits after one successful download
(
  cd "$SERVE_DIR"
  # Python's http.server sends application/x-x509-ca-cert for .pem? No, it
  # defaults to text/plain. We override via a tiny inline server so iOS
  # Safari recognises the file as a configuration profile.
  python3 - <<PYEOF &
import http.server, socketserver, sys, os
PORT = $PORT
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(".pem"):
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="webhouse-dev-CA.pem"')
        super().end_headers()
    def log_message(self, *a, **k): pass

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.timeout = 600
    httpd.handle_request()  # one shot, then exit
PYEOF
  SERVER_PID=$!
  # Auto-shutdown after 10 minutes if nothing connects
  ( sleep 600; kill $SERVER_PID 2>/dev/null || true ) &
  wait $SERVER_PID 2>/dev/null || true
  rm -rf "$SERVE_DIR"
) &

sleep 0.5

green "  Serving rootCA at: $URL"
echo
echo "  Scan this QR with your iPhone Camera app (or visit the URL above):"
echo

# Render QR in the terminal — prefer qrencode if installed, otherwise an
# online fallback URL the user can copy.
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$URL"
else
  yellow "  (install 'qrencode' via brew for inline QR — for now copy the URL above)"
fi

echo
green "  iPhone install steps:"
echo "    1. Tap the QR (or paste URL) → Safari downloads webhouse-dev-CA.pem"
echo "    2. Settings → General → VPN & Device Management → Profile Downloaded"
echo "    3. Install (requires your iPhone passcode)"
echo "    4. Settings → General → About → Certificate Trust Settings"
echo "    5. Toggle ON for 'mkcert development CA'"
echo "    6. Visit https://${PRIMARY_IP}:3010/admin/login — green lock 🔒"
echo
yellow "  The HTTP server will shut down after the first download, or after 10 min."
echo

cyan "✓ Done. Refresh Chrome/Safari on your Mac — the warning should be gone."
