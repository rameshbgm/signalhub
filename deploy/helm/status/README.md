# SignalHub Helm chart

This chart deploys separate web, worker, and pre-upgrade migration workloads.
It expects an external PostgreSQL 18 or newer database and, for multiple
replicas, S3-compatible object storage. Start with the
[complete setup guide](../../../docs/OPEN_SOURCE_SETUP_GUIDE.md#9-kubernetes-and-helm-installation)
for AWS, Azure, GCP, networking, secrets, identity, backups, and production
hardening. Product operators can use the
[HTML user manual](../../../public/docs/user-manual.html).

## Prerequisites

- Kubernetes 1.27 or newer and Helm 3.
- A reviewed SignalHub runtime image available to every cluster node.
- TLS ingress and the canonical application DNS name.
- External PostgreSQL with TLS, backups, and tested restoration.
- S3-compatible storage when `replicaCount` or `workerReplicaCount` is greater
  than one.
- An external secret workflow in production.

## 1. Create the runtime Secret

Use an externally managed Kubernetes Secret in production:

```yaml
secrets:
  existingSecret: signalhub-production
```

The Secret must contain `DATABASE_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY`:

```bash
kubectl create namespace signalhub
kubectl -n signalhub create secret generic signalhub-production \
  --from-literal=DATABASE_URL='postgresql://signalhub:<password>@postgres.example:5432/signalhub?sslmode=require' \
  --from-literal=SESSION_SECRET='<independent-random-value>' \
  --from-literal=ENCRYPTION_KEY='<independent-random-value>' \
  --from-literal=METRICS_TOKEN='<metrics-token>' \
  --from-literal=S3_BUCKET='signalhub-assets' \
  --from-literal=S3_REGION='us-east-1'
```

Rotation-safe deployments should also provide `SESSION_SIGNING_KEYS`,
`SESSION_ACTIVE_KEY_ID`, `ENCRYPTION_KEYS`, and `ENCRYPTION_ACTIVE_KEY_ID`.
Provider credentials, `METRICS_TOKEN`, and `OTEL_EXPORTER_OTLP_HEADERS` may be
kept in the same Secret. See `.env.example` for the complete supported
configuration.

## 2. Create an environment values file

```yaml
image:
  repository: registry.example.com/operations/signalhub
  tag: "1.0.0"

replicaCount: 2
workerReplicaCount: 2

config:
  appUrl: https://status.example.com
  assetStorageDriver: s3
  requireWorker: "true"
  trustProxyHeaders: "true"
  trustedProxyHops: "1"

secrets:
  existingSecret: signalhub-production

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: status.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: signalhub-tls
      hosts: [status.example.com]
```

Commit non-secret values if desired. Never commit a rendered Secret or a values
file containing credentials.

## 3. Validate and install

```bash
helm lint deploy/helm/status -f values-production.yaml
helm template signalhub deploy/helm/status -f values-production.yaml >/tmp/signalhub.yaml
helm upgrade --install signalhub deploy/helm/status \
  --namespace signalhub \
  --create-namespace \
  -f values-production.yaml
kubectl -n signalhub rollout status deployment/signalhub-signalhub-web
kubectl -n signalhub rollout status deployment/signalhub-signalhub-worker
```

The pre-install/pre-upgrade hook runs `dist-runtime/migrate.mjs` before the new
application rollout. Treat a failed migration hook as a failed release; inspect
it before retrying.

## 4. Bootstrap and verify

Run bootstrap once using a protected operator session. Avoid placing the
password in shell history:

```bash
printf '%s' '<initial-password>' \
  | kubectl -n signalhub exec -i deploy/signalhub-signalhub-web -- \
      node dist-runtime/bootstrap.mjs --password-stdin
kubectl -n signalhub port-forward service/signalhub-signalhub 3301:80
curl -fsS http://127.0.0.1:3301/api/health/live
curl -fsS http://127.0.0.1:3301/api/health/ready
```

The initial Admin must change the bootstrap password and finish profile setup
at first login.

## 5. Operate and upgrade

Run a release preflight after installation:

```sh
kubectl exec deploy/<release>-signalhub-web -- node dist-runtime/signalhubctl.mjs preflight
```

The default NetworkPolicy permits outbound traffic so monitors, identity
providers, notification providers, object storage, and audit sinks remain
reachable. Replace `networkPolicy.egressCidrs` with the approved ranges for your
environment.

Before every upgrade, back up PostgreSQL and assets, verify restoration, render
the proposed chart, run `signalhubctl preflight`, and pin the reviewed image
digest. After rollout, confirm migration state, worker readiness, queue health,
login, public pages, and notification delivery.
