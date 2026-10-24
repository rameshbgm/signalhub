# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
WORKDIR /app
# Route modules import the database client while Next collects route metadata.
# These non-secret build-time placeholders prevent that import from requiring a
# developer .env file; the runtime Compose environment always overrides them.
ENV DATABASE_URL=postgresql://signalhub:build-time-placeholder@postgres:5432/signalhub \
    SESSION_SECRET=build-time-placeholder \
    ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache ca-certificates iputils tini \
    && addgroup --system --gid 1001 signalhub \
    && adduser --system --uid 1001 --ingroup signalhub signalhub \
    && mkdir -p /app/data \
    && chown signalhub:signalhub /app/data

COPY --from=build --chown=signalhub:signalhub /app/.next/standalone ./
COPY --from=build --chown=signalhub:signalhub /app/.next/static ./.next/static
COPY --from=build --chown=signalhub:signalhub /app/public ./public
COPY --from=build --chown=signalhub:signalhub /app/dist-runtime ./dist-runtime
COPY --from=production-dependencies --chown=signalhub:signalhub /app/node_modules ./node_modules
USER signalhub
# Setup state (database connection, generated secrets). Unused when everything
# comes from environment variables, as on Kubernetes.
ENV SIGNALHUB_DATA_DIR=/app/data
# Stamps the real connection address on every request, whichever command the
# container runs (the supervisor, or `node server.js` on Kubernetes). Keep this
# if you override NODE_OPTIONS: add to it instead of replacing it.
ENV NODE_OPTIONS=--import=/app/dist-runtime/peer-address.mjs
VOLUME ["/app/data"]
EXPOSE 3000 8081
ENTRYPOINT ["/sbin/tini", "--"]
# Supervisor: migrations, web and worker in one container (see scripts/start.ts).
# Kubernetes runs split pods with `--role web` / `--role worker`.
CMD ["node", "dist-runtime/start.mjs"]
