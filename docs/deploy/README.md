# Deploying SignalHub

One image, `ghcr.io/rameshbgm/signalhub`, runs everywhere. By default a container starts the whole installation (migrations, web server and background worker) through `dist-runtime/start.mjs`. The only thing SignalHub needs from outside is a **PostgreSQL 14+ database**.

| Where | How | Guide |
|---|---|---|
| A VPS or VM (DigitalOcean, Hetzner, Linode, EC2, …) | `./install.sh` | [Setup guide](../OPEN_SOURCE_SETUP_GUIDE.md) |
| Any Docker host | `docker compose up -d`, then the setup wizard | [Setup guide](../OPEN_SOURCE_SETUP_GUIDE.md#3-install) |
| Kubernetes (any distribution, GKE, EKS, AKS) | `kubectl apply -k deploy/kubernetes/base` | [Kubernetes](kubernetes.md) |
| Render, Railway, Fly.io, DigitalOcean App Platform | one service + managed Postgres | [PaaS](paas.md) |
| AWS (ECS Fargate, App Runner) + RDS | one service | [AWS](aws.md) |
| Google Cloud Run + Cloud SQL | one service | [GCP](gcp.md) |
| Azure Container Apps + Azure Database for PostgreSQL | one app | [Azure](azure.md) |

## Two ways to configure

**Setup wizard (single host with a persistent disk).** Start the container with nothing set. Open `/setup`, paste the setup token from the logs, enter your database and create the administrator. The connection and generated secrets are saved in `/app/data/signalhub.json`, so `/app/data` must be a persistent volume.

**Environment variables (stateless: Kubernetes, PaaS, serverless containers).** Set these and the wizard never appears:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:password@host:5432/db?sslmode=verify-full` (direct connection, not a transaction pooler) |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 48` (back it up: it decrypts stored credentials) |
| `NEXT_PUBLIC_APP_URL` | the public `https://` address |
| `STATUS_BOOTSTRAP_PASSWORD` | first administrator's password, used once on an empty database |
| `STATUS_BOOTSTRAP_EMAIL`, `STATUS_BOOTSTRAP_USERNAME` (default `admin`) | optional |
| `DATABASE_SSL_CA` | optional: your provider's CA certificate (PEM text) |
| `TRUST_PROXY_HEADERS=true` | when a load balancer sits in front (almost always on cloud platforms) |

Environment variables always win over the wizard's file, so you can start with the wizard and move to variables later (the wizard offers a backup download of the file).

## Database rules that apply everywhere

- **PostgreSQL 14 or newer**, an empty, dedicated database is best. The user needs `CREATE` on the `public` schema.
- **Use the direct connection string.** Transaction poolers (PgBouncer in transaction mode, Supabase port 6543, Neon `-pooler` hosts) break the background worker's LISTEN/NOTIFY and advisory locks.
- **TLS:** `?sslmode=verify-full` for providers with publicly trusted certificates; for RDS, Azure and Cloud SQL paste the provider CA into `DATABASE_SSL_CA` (or mount it and set `NODE_EXTRA_CA_CERTS=/path/ca.pem`). `?sslmode=no-verify` encrypts without checking the certificate. `?sslmode=disable` only on a private network.
- **Always on:** the worker sends notifications and runs monitors, so keep at least one instance running (no scale-to-zero, no CPU throttling between requests).
