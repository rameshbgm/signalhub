# Contributing to SignalHub

Thanks for helping improve SignalHub. Contributions are welcome under the
Apache-2.0 license.

## Development

1. Install Node.js 20+ and Docker.
2. Copy `.env.example` to `.env` and set local secrets.
3. Start dependencies with `docker compose up -d`.
4. Run `npm install`, then `npm run db:indexes` and `npm run dev`.

Before opening a pull request, run `npm run verify` (lint, typecheck, tests,
and production build). Add or update tests for behavior changes. Keep changes
focused, document configuration changes, and never commit credentials or
production data.

## Pull requests

Describe the problem, the solution, and verification steps. UI changes should
include screenshots at desktop and mobile widths. Reviewers may request
security, accessibility, or migration coverage where relevant.

By submitting a contribution, you agree it is provided under Apache-2.0 and
that you have the right to submit it.
