#!/bin/sh
# SignalHub installer for a single host (VPS, cloud VM, home server).
#
#   ./install.sh                     interactive
#   ./install.sh --yes --domain status.example.com
#   ./install.sh --yes --bundled-db --terminal
#
# Options (each also settable by environment variable):
#   --domain NAME      DOMAIN        serve HTTPS for NAME with automatic certificates
#   --bundled-db       BUNDLED_DB=1  start a PostgreSQL container (for trials)
#   --browser          SETUP=browser finish setup in the browser (default)
#   --terminal         SETUP=terminal finish setup here, in the terminal
#   --build                          build the image locally instead of pulling it
#   --yes                            accept defaults, never prompt
#
# Re-running is safe: existing values in .env are kept.
set -eu

cd "$(dirname "$0")"

IMAGE="ghcr.io/rameshbgm/signalhub:latest"
DOMAIN="${DOMAIN-}"
BUNDLED_DB="${BUNDLED_DB-}"
SETUP="${SETUP-}"
BUILD=0
YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2-}"; shift ;;
    --bundled-db) BUNDLED_DB=1 ;;
    --no-bundled-db) BUNDLED_DB=0 ;;
    --browser) SETUP=browser ;;
    --terminal) SETUP=terminal ;;
    --build) BUILD=1 ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Prompts only when interactive; otherwise keeps the default.
ask() {
  question="$1"; default="$2"
  if [ "$YES" = 1 ] || [ ! -t 0 ]; then printf '%s' "$default"; return; fi
  if [ -n "$default" ]; then printf '%s [%s]: ' "$question" "$default" >&2; else printf '%s: ' "$question" >&2; fi
  read -r answer || answer=""
  printf '%s' "${answer:-$default}"
}

# Sets KEY=VALUE in .env, replacing an existing line. With "keep", an existing
# value wins (used for passwords so a re-run never rotates them).
set_env() {
  key="$1"; value="$2"; mode="${3-replace}"
  touch .env
  if grep -q "^${key}=" .env; then
    [ "$mode" = keep ] && return 0
    tmp=$(mktemp)
    grep -v "^${key}=" .env > "$tmp" && cat "$tmp" > .env && rm -f "$tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >> .env
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 32 | tr -d '/+=\n' | cut -c1-32
  else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}

# --- prerequisites ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. See https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || fail "Docker is installed but not running, or this user cannot use it (try sudo, or add the user to the docker group)."
compose_version=$(docker compose version --short 2>/dev/null) || fail "Docker Compose v2 is required (the 'docker compose' plugin)."
major=$(printf '%s' "$compose_version" | sed 's/^v//' | cut -d. -f1)
minor=$(printf '%s' "$compose_version" | sed 's/^v//' | cut -d. -f2)
if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 24 ]; }; then
  fail "Docker Compose 2.24 or newer is required (found $compose_version)."
fi

say "SignalHub installer"
say ""

# --- questions -------------------------------------------------------------
if [ -z "$DOMAIN" ] && [ "$YES" = 0 ]; then
  DOMAIN=$(ask "Domain for HTTPS (leave empty to listen on localhost only)" "")
fi
if [ -z "$BUNDLED_DB" ]; then
  answer=$(ask "Start a bundled PostgreSQL for trial use? You can enter your own database in setup instead (y/N)" "n")
  case "$answer" in [yY]*) BUNDLED_DB=1 ;; *) BUNDLED_DB=0 ;; esac
fi
if [ -z "$SETUP" ]; then
  answer=$(ask "Finish setup in the browser or here in the terminal? (browser/terminal)" "browser")
  case "$answer" in t*|T*) SETUP=terminal ;; *) SETUP=browser ;; esac
fi

# --- .env ------------------------------------------------------------------
compose_file="docker-compose.yml"
if [ "$BUNDLED_DB" = 1 ]; then
  compose_file="$compose_file:deploy/compose/postgres.yml"
  set_env POSTGRES_PASSWORD "$(random_secret)" keep
fi
if [ -n "$DOMAIN" ]; then
  compose_file="$compose_file:deploy/compose/https.yml"
  set_env DOMAIN "$DOMAIN"
fi
set_env COMPOSE_FILE "$compose_file"

if [ "$BUILD" = 0 ] && docker pull "$IMAGE" >/dev/null 2>&1; then
  set_env STATUS_IMAGE "$IMAGE"
  say "Using the published image $IMAGE."
  up_flags=""
else
  set_env STATUS_IMAGE "signalhub:local"
  say "Building the image locally (this takes a few minutes the first time)…"
  up_flags="--build"
fi
chmod 600 .env

# --- start -----------------------------------------------------------------
# shellcheck disable=SC2086
docker compose up -d $up_flags

say "Waiting for SignalHub to start…"
container=$(docker compose ps -q signalhub)
i=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null)" = healthy ]; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && fail "SignalHub did not become healthy. Check: docker compose logs signalhub"
  sleep 2
done

port=$(grep '^STATUS_PORT=' .env 2>/dev/null | cut -d= -f2)
if [ -n "$DOMAIN" ]; then base="https://$DOMAIN"; else base="http://localhost:${port:-3301}"; fi

token=$(docker compose exec -T signalhub cat /app/data/setup-token 2>/dev/null | tr -d '\r\n' || true)
if [ -z "$token" ]; then
  say ""
  say "SignalHub is already set up. Sign in at $base/login"
  exit 0
fi

if [ "$SETUP" = terminal ]; then
  docker compose exec signalhub node dist-runtime/signalhubctl.mjs setup
  docker compose restart signalhub >/dev/null
  say ""
  say "Done. Sign in at $base/login"
else
  say ""
  say "Almost there. Open the setup wizard to connect your database and create the administrator:"
  say ""
  say "  $base/setup"
  say "  Setup token: $token"
  if [ -z "$DOMAIN" ]; then
    say ""
    say "SignalHub listens on localhost only. From your computer, open a tunnel first:"
    say "  ssh -L ${port:-3301}:127.0.0.1:${port:-3301} <user>@<this-server>"
  fi
fi
say ""
say "Keep a backup of the signalhub_data volume (or the file it holds, /app/data/signalhub.json):"
say "it contains the encryption key for stored credentials."
