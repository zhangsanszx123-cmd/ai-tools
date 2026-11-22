# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
# No production credentials or database access during build.
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 MEDIA_STORAGE_DIR=/app/storage/media
RUN mkdir -p /app/storage/media /app/.next/cache && chown -R node:node /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node deploy/healthcheck.cjs ./healthcheck.cjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=15s --start-period=40s --retries=3 CMD ["node", "healthcheck.cjs"]
CMD ["node", "server.js"]
