# Security policy

Please do not report vulnerabilities in public issues. Email a concise report
to the maintainers (or the security contact configured by your deployment)
with reproduction steps, affected versions, and impact. We will acknowledge
reports within 5 business days and coordinate a fix and disclosure timeline.

For self-hosted deployments, rotate exposed signing/encryption keyring
entries, API keys, SCIM tokens, webhook secrets, and SMTP/IdP credentials
immediately. Keep MongoDB and SignalHub administration interface on trusted
networks, set `ALLOW_PUBLIC_SIGNUP=false` unless required, configure forwarded
headers only for a known proxy hop count, and use TLS for all public traffic.

Enterprise deployments should use a MongoDB replica set, S3-compatible object
storage, authenticated metrics, external secret management, and the restricted
Helm security defaults. Retain a local platform Owner as a break-glass account,
test backup restoration, and periodically verify the audit hash chains.

We support the latest released version and the preceding minor release.
