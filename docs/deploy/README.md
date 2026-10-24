# Deploying SignalHub

One image, `ghcr.io/rameshbgm/signalhub`, runs everywhere. By default a container starts the whole installation (migrations, web server and background worker) through `dist-runtime/start.mjs`. The only thing SignalHub needs from outside is a **PostgreSQL 14+ database**.

| Where | How | Guide |
|---|---|---|
| A VPS or VM (DigitalOcean, Hetzner, Linode, EC2, …) | `./install.sh` | [Setup guide](../OPEN_SOURCE_SETUP_GUIDE.md) |
| Any machine with Node.js, no Docker | `npm ci && npm run build && npm run start:all` | [Node.js](node.md) |
| Any Docker host | `docker compose up -d`, then the setup wizard | [Setup guide](../OPEN_SOURCE_SETUP_GUIDE.md#3-install) |
| Kubernetes (any distribution, GKE, EKS, AKS) | `kubectl apply -k deploy/kubernetes/base` | [Kubernetes](kubernetes.md) |
| Render, Railway, Fly.io, DigitalOcean App Platform | one service + managed Postgres | [PaaS](paas.md) |
| AWS (ECS Fargate) + RDS | one service | [AWS](aws.md) |
| Google Cloud Run + Cloud SQL | one service | [GCP](gcp.md) |
| Azure Container Apps + Azure Database for PostgreSQL | one app | [Azure](azure.md) |

Choose and operate the infrastructure that suits you. SignalHub does not need a provider selection: it runs from the same image or Node.js build wherever the runtime requirements below are met.

## Two ways to configure

**Setup wizard (single host with a persistent disk).** Start the container with nothing set and open `/setup`. Enter your database and create the administrator. The connection and generated secrets are saved in `/app/data/signalhub.json`, so `/app/data` must be a persistent volume.

**Environment variables (stateless: Kubernetes, PaaS, serverless containers).** Set these and the wizard never appears:

Store these values in your platform's secret manager. The two keys serve different purposes and must be generated independently. If you use the browser wizard instead, SignalHub generates them and saves them in `/app/data/signalhub.json` on the persistent volume.

| Variable | Purpose | Value |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection. Use the direct connection, not a transaction pooler. | `postgresql://user:password@host:5432/db?sslmode=verify-full` |
| `SESSION_SECRET` | Signs login sessions. Changing it signs users out unless you retain the old key during rotation. | Generate with `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | Encrypts sensitive saved values such as provider credentials, MFA secrets and subscriber contacts. Back it up separately from the database; losing it makes those values unreadable. | Generate independently with `openssl rand -base64 48` |
| `NEXT_PUBLIC_APP_URL` | Canonical public `https://` address used in links and authentication callbacks. | `https://status.example.com` |
| `STATUS_BOOTSTRAP_PASSWORD` | Creates the first administrator on an empty database; required for environment-only setup. It must be changed at first sign-in. | A long, unique password |
| `STATUS_BOOTSTRAP_EMAIL`, `STATUS_BOOTSTRAP_USERNAME` (default `admin`) | Optional administrator details. | Your email and preferred sign-in name |
| `DATABASE_SSL_CA` | Optional provider CA certificate for database TLS verification. | PEM text |
| `TRUST_PROXY_HEADERS` | Optional. Leave unset for **Auto**. Set `true` only if your proxy reaches the app from a public address. | See [client IP and reverse proxies](../configuration.md#client-ip-and-reverse-proxies) |

Keep `SESSION_SECRET` and `ENCRYPTION_KEY` stable across restarts and deployments. Generate them separately with a cryptographic random generator; do not type your own values or reuse one key for both. Back up the encryption key with your recovery materials, not in the same database dump. See [what the keys protect](../configuration.md#what-the-two-application-keys-do) and [key rotation](../operations.md#rotating-keys).

The public address, proxy trust, HTTPS and HSTS, sign-in policy, rate limits, and monitoring options have safe defaults. Set values through environment variables or manage them in **Platform administration → Configuration → Runtime**. Environment variables take precedence and are useful when configuration is managed by your deployment tooling.

Environment variables always win over the wizard's file, so you can start with the wizard and move to variables later (the wizard offers a backup download of the file).

## After the first start

Whichever way you deployed: open **Platform administration → Configuration → Runtime** to check database, migration, and worker health; set up an email provider under **Configuration**; create a second administrator; and consider switching on **Require authenticator codes** ([MFA guide](../mfa.md)). Multi-factor emails and the "this wasn't me" link need a configured provider and `NEXT_PUBLIC_APP_URL`.

## Database rules that apply everywhere

- **PostgreSQL 14 or newer**, an empty, dedicated database is best. The user needs `CREATE` on the `public` schema.
- **Use the direct connection string.** Transaction poolers (PgBouncer in transaction mode, Supabase port 6543, Neon `-pooler` hosts) break the background worker's LISTEN/NOTIFY and advisory locks.
- **TLS:** `?sslmode=verify-full` for providers with publicly trusted certificates; for RDS, Azure and Cloud SQL paste the provider CA into `DATABASE_SSL_CA` (or mount it and set `NODE_EXTRA_CA_CERTS=/path/ca.pem`). `?sslmode=no-verify` encrypts without checking the certificate. `?sslmode=disable` only on a private network.
- **Always on:** the worker sends notifications and runs monitors, so keep at least one instance running (no scale-to-zero, no CPU throttling between requests).
