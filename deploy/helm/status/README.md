# SignalHub Helm chart

This chart deploys separate web, worker, and pre-upgrade migration workloads.
It expects an external MongoDB replica set and, for multiple replicas, S3-compatible
object storage.

Use an externally managed Kubernetes Secret in production:

```yaml
secrets:
  existingSecret: signalhub-production
```

The Secret must contain `DATABASE_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY`.
Rotation-safe deployments should also provide `SESSION_SIGNING_KEYS`,
`SESSION_ACTIVE_KEY_ID`, `ENCRYPTION_KEYS`, and `ENCRYPTION_ACTIVE_KEY_ID`.
Provider credentials, `METRICS_TOKEN`, and `OTEL_EXPORTER_OTLP_HEADERS` may be
kept in the same Secret. See `.env.example` for the complete supported
configuration.

Run a release preflight after installation:

```sh
kubectl exec deploy/<release>-signalhub-web -- node dist-runtime/signalhubctl.mjs preflight
```

The default NetworkPolicy permits outbound traffic so monitors, identity
providers, notification providers, object storage, and audit sinks remain
reachable. Replace `networkPolicy.egressCidrs` with the approved ranges for your
environment.
