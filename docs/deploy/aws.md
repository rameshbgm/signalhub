# AWS: ECS Fargate (or App Runner) with RDS for PostgreSQL

## 1. Database (RDS)

1. Create an **RDS for PostgreSQL** instance (16+), in private subnets, with a database `signalhub`.
2. Allow inbound 5432 from the security group of the SignalHub service only.
3. Download the RDS CA bundle (`global-bundle.pem` from the RDS documentation). Its contents become `DATABASE_SSL_CA`.

Connection string: `postgresql://signalhub:<password>@<endpoint>:5432/signalhub` (no `sslmode` needed when `DATABASE_SSL_CA` is set; certificates are verified against it). Connect to the instance directly rather than through RDS Proxy: LISTEN/NOTIFY and advisory locks pin every connection, which removes the proxy's benefit.

## 2. Secrets (Secrets Manager)

Store `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `DATABASE_SSL_CA` and `STATUS_BOOTSTRAP_PASSWORD` in Secrets Manager and reference them from the task definition (`secrets` → `valueFrom`). Keep a separate backup of `ENCRYPTION_KEY`.

## 3a. ECS Fargate (recommended)

- Task definition: one container, image `ghcr.io/rameshbgm/signalhub:<version>`, port **3000**, default command. 1 vCPU / 2 GB is comfortable.
- Environment: `NEXT_PUBLIC_APP_URL=https://status.example.com`, `TRUST_PROXY_HEADERS=true`, `TRUSTED_PROXY_HOPS=1`, plus the secrets above.
- Service: desired count 1 or more behind an **Application Load Balancer** (HTTPS listener with an ACM certificate) → target group on port 3000, health check `/api/health/live`.
- Logs: awslogs driver to CloudWatch.

Running more than one task: each task runs migrations at start (serialized by an advisory lock) and its own worker; jobs are lease-based, so that is safe.

## 3b. App Runner

App Runner only deploys images from Amazon ECR, so first copy the image into an ECR repository (for example with `docker pull` / `docker tag` / `docker push`, or an ECR pull-through cache). Then: source image from ECR, port 3000, health check path `/api/health/live`, the same variables and secrets, and a **VPC connector** to reach RDS. Set minimum instances to 1.

## 4. First sign-in

Open `https://status.example.com/login`, sign in as `admin` with `STATUS_BOOTSTRAP_PASSWORD`, and change the password.
