# syntax=docker/dockerfile:1
# SysPass · imagen única: API (Fastify) + frontend compilado (React)

# ── 1. Compilar ─────────────────────────────
FROM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

COPY server server
COPY web web
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && mkdir -p server/node_modules

# ── 2. Ejecutar ─────────────────────────────
FROM node:22-alpine
LABEL org.opencontainers.image.title="SysPass" \
      org.opencontainers.image.description="Bóveda de credenciales multiempresa"

# La versión la pasa el workflow de publicación (por ejemplo 1.3.0)
ARG SYSPASS_VERSION=dev
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SYSPASS_VERSION=$SYSPASS_VERSION

WORKDIR /app
COPY --chown=node:node CHANGELOG.md ./
COPY --from=build --chown=node:node /src/package.json ./
COPY --from=build --chown=node:node /src/node_modules ./node_modules
COPY --from=build --chown=node:node /src/server/package.json ./server/
COPY --from=build --chown=node:node /src/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /src/server/dist ./server/dist
COPY --from=build --chown=node:node /src/server/migrations ./server/migrations
COPY --from=build --chown=node:node /src/web/dist ./web/dist

USER node
WORKDIR /app/server
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

# Aplica migraciones pendientes (y recifrado) antes de arrancar
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/src/index.js"]
