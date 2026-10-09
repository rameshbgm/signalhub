# Kubernetes

Plain manifests built with kustomize (`kubectl apply -k`, no Helm needed). Works on any conformant cluster: GKE, EKS, AKS, k3s, kind.

```
deploy/kubernetes/
  base/            web (2 replicas) + worker + ingress, external PostgreSQL
  with-postgres/   base + a single PostgreSQL StatefulSet (for clusters without a managed database)
```

## Install

```bash
cp deploy/kubernetes/base/secrets.env.example deploy/kubernetes/base/secrets.env
# edit secrets.env: DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, STATUS_BOOTSTRAP_PASSWORD
# edit config.env (NEXT_PUBLIC_APP_URL) and ingress.yaml (host, TLS secret)
kubectl apply -k deploy/kubernetes/base
kubectl -n signalhub rollout status deploy/signalhub-web
```

No database yet? Set `POSTGRES_PASSWORD` in `secrets.env` and point `DATABASE_URL` at the bundled one (`postgresql://signalhub:<POSTGRES_PASSWORD>@signalhub-postgres:5432/signalhub?sslmode=disable`), then `kubectl apply -k deploy/kubernetes/with-postgres`. Back up its volume, or move to a managed database for production.

Pin the image: in `base/kustomization.yaml` change `newTag: latest` to a release, or `kustomize edit set image ghcr.io/rameshbgm/signalhub=ghcr.io/rameshbgm/signalhub:1.2.0`.

## How it runs

- Each web pod has an initContainer, `start.mjs --prepare`, that applies migrations (advisory-locked, safe with any number of replicas) and, on an empty database, creates the administrator from `STATUS_BOOTSTRAP_*`. Sign in and change the password.
- Web and worker pods are stateless with read-only root filesystems; there is no setup wizard on Kubernetes. Without `STATUS_BOOTSTRAP_PASSWORD`, create the administrator with `kubectl -n signalhub exec -it deploy/signalhub-web -- node dist-runtime/signalhubctl.mjs setup`.
- The worker is a separate Deployment; scale it for many monitors (jobs are lease-based).
- NetworkPolicies allow only the web port in; egress stays open for monitors, email/SMS and webhooks.
- ICMP (ping) monitors: set `MONITOR_ENABLE_ICMP=true` in `config.env` and add `NET_RAW` to the worker's capabilities.

## Upgrade

Change the image tag and `kubectl apply -k` again. The new pods' initContainers migrate before they start serving; back up the database first.
