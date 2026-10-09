# Render, Railway, Fly.io and DigitalOcean App Platform

SignalHub runs as **one always-on service** (the image's default command runs migrations, the web server and the worker) plus a managed PostgreSQL. Use the environment variables from the [deployment overview](README.md#two-ways-to-configure); the platform's load balancer terminates TLS, so also set `TRUST_PROXY_HEADERS=true`.

> Free tiers that sleep when idle stop the worker, so notifications and monitors pause. Use a paid, always-on instance.

## Render (one click)

The repository includes a [`render.yaml`](../../render.yaml) Blueprint: a Docker web service plus a managed PostgreSQL, with `SESSION_SECRET` and `ENCRYPTION_KEY` generated for you.

1. Fork the repository, then in Render choose **New → Blueprint** and select your fork.
2. Enter `NEXT_PUBLIC_APP_URL` (your `onrender.com` URL or custom domain) and the first administrator's `STATUS_BOOTSTRAP_PASSWORD` and email.
3. Deploy, then sign in at `/login` as `admin` and change the password.

## Railway

1. **New project → Deploy from GitHub repo** (Railway builds the Dockerfile).
2. **+ New → Database → PostgreSQL** in the same project.
3. On the SignalHub service set variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `STATUS_BOOTSTRAP_PASSWORD`, `TRUST_PROXY_HEADERS=true`.
4. **Settings → Networking → Generate domain** (target port 3000).

Prefer the browser wizard? Skip the variables except `TRUST_PROXY_HEADERS`, attach a **volume** at `/app/data`, deploy, and read the setup token from the deploy logs.

## Fly.io

The repository includes a [`fly.toml`](../../fly.toml) with one always-on machine and a volume for `/app/data`.

```bash
fly launch --copy-config --no-deploy          # pick an app name and region
fly volumes create signalhub_data --size 1
fly postgres create                            # or use any external PostgreSQL
fly postgres attach <postgres-app>             # sets DATABASE_URL
fly secrets set SESSION_SECRET=$(openssl rand -base64 48) ENCRYPTION_KEY=$(openssl rand -base64 48) \
  NEXT_PUBLIC_APP_URL=https://<app>.fly.dev STATUS_BOOTSTRAP_PASSWORD='a-long-unique-password'
fly deploy
```

Without `fly postgres attach` and the secrets, the app starts in setup mode instead: `fly logs` shows the setup token for `https://<app>.fly.dev/setup`.

## DigitalOcean App Platform

1. **Create App → GitHub** and pick the repository; App Platform detects the Dockerfile. HTTP port **3000**.
2. Add a **Dev or Managed Database (PostgreSQL)** component.
3. Environment variables: `DATABASE_URL=${db.DATABASE_URL}`, `SESSION_SECRET`, `ENCRYPTION_KEY` (mark both encrypted), `NEXT_PUBLIC_APP_URL=${APP_URL}`, `STATUS_BOOTSTRAP_PASSWORD`, `TRUST_PROXY_HEADERS=true`.
4. DigitalOcean managed databases use their own CA: download it from the database page and paste it into `DATABASE_SSL_CA`.
5. Health check path: `/api/health/live`.
