# Node.js without Docker

Run SignalHub straight from a checkout, on any Linux, macOS or Windows (WSL) machine with Node.js and access to a PostgreSQL database. The same setup wizard as the container version asks for the database and creates the administrator.

## Requirements

- **Node.js 22.9 or newer** (`node --version`) and npm.
- **PostgreSQL 14+** reachable from this machine (local, another server, or managed). See the [database rules](README.md#database-rules-that-apply-everywhere).
- Optional: `ping` for ICMP monitors.

## Install and run

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
npm ci
npm run build          # web app, worker and CLI (a few minutes)
npm run start:all      # migrations + web + worker, supervised
```

On the first start no database is configured, so SignalHub prints a setup link and a one-time token:

```
  SignalHub needs a database. Finish setup in your browser:
    http://localhost:3301/setup
  SETUP TOKEN:
    h3RSJMqEzFRBmxGjgF26P23ncuatFooD
```

Open the link, paste the token, enter your database and create the administrator. Saving reloads the server in place; you do not need to restart anything.

What `start:all` does:

| Setting | Default | Change with |
|---|---|---|
| Listen address | `127.0.0.1:3301` | `SIGNALHUB_HOST=0.0.0.0`, `PORT=8080` |
| Data directory (setup file, generated secrets, setup token) | `./data` | `SIGNALHUB_DATA_DIR=/var/lib/signalhub` |
| Settings file | `.env` in the checkout, if present | any variable from the [configuration reference](../configuration.md) |

Environment variables (or `.env`) always win over what the wizard saved, so you can also skip the wizard: set `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL` and `STATUS_BOOTSTRAP_PASSWORD` in `.env`.

> Keep SignalHub on `127.0.0.1` and put a reverse proxy with TLS in front ([Caddy or nginx](../OPEN_SOURCE_SETUP_GUIDE.md#6-reverse-proxy-and-tls)). The app sends `upgrade-insecure-requests`, so plain `http://` from another machine is not supported.

## Run as a service (systemd)

```ini
# /etc/systemd/system/signalhub.service
[Unit]
Description=SignalHub
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=signalhub
WorkingDirectory=/opt/signalhub
Environment=NODE_ENV=production
Environment=SIGNALHUB_DATA_DIR=/var/lib/signalhub
ExecStart=/usr/bin/node --env-file-if-exists=/opt/signalhub/.env dist-runtime/start.mjs
Restart=on-failure
KillSignal=SIGTERM
TimeoutStopSec=30
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/signalhub
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /opt/signalhub --shell /usr/sbin/nologin signalhub
sudo mkdir -p /var/lib/signalhub && sudo chown signalhub: /var/lib/signalhub
sudo chown -R signalhub: /opt/signalhub
sudo systemctl daemon-reload && sudo systemctl enable --now signalhub
journalctl -u signalhub -f        # the setup token is printed here
```

## Operator commands

```bash
npm run signalhubctl -- doctor                     # health checks
npm run signalhubctl -- setup                      # setup in the terminal instead of the browser
npm run signalhubctl -- setup --new-token          # replace a lost or exposed setup token
npm run signalhubctl -- setup --reset              # forget the saved database and run setup again
npm run signalhubctl -- reset-password --username admin   # temporary password for a locked-out user
```

With the systemd layout above, run them as the service user with the same data directory, for example `sudo -u signalhub SIGNALHUB_DATA_DIR=/var/lib/signalhub node dist-runtime/signalhubctl.mjs doctor`.

## Upgrade

```bash
git pull
npm ci
npm run build
sudo systemctl restart signalhub    # migrations run on start
```

Back up the database (and `SIGNALHUB_DATA_DIR/signalhub.json`, which holds the encryption key) before upgrading.

## Development

`npm run dev` (web) or `npm run dev:all` (web + worker) uses the same supervisor in development mode: with no `DATABASE_URL` in `.env` it opens the setup wizard at <http://localhost:3301/setup>; with one it migrates and starts as usual. `npm run dev:web` runs the bare Next.js dev server.
