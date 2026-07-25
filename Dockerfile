# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
WORKDIR /app
# Route modules import the database client while Next collects route metadata.
# These non-secret build-time placeholders prevent that import from requiring a
# developer .env file; the runtime Compose environment always overrides them.
ENV DATABASE_URL=mongodb://mongo:27017/status?replicaSet=rs0 \
    SESSION_SECRET=build-time-placeholder \
    ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache ca-certificates iputils tini \
    && addgroup --system --gid 1001 signalhub \
    && adduser --system --uid 1001 --ingroup signalhub signalhub \
    && mkdir -p /app/data/uploads \
    && chown -R signalhub:signalhub /app/data
COPY --from=build --chown=signalhub:signalhub /app/.next/standalone ./
COPY --from=build --chown=signalhub:signalhub /app/.next/static ./.next/static
COPY --from=build --chown=signalhub:signalhub /app/public ./public
COPY --from=build --chown=signalhub:signalhub /app/dist-runtime ./dist-runtime
COPY --from=production-dependencies --chown=signalhub:signalhub /app/node_modules ./node_modules
USER signalhub
EXPOSE 3000 8081
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
