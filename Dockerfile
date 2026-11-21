# =============================================================================
# QuantZing (quantzing.com) — Production Multi-Stage Node 24 Dockerfile
# Stage 1: Build QuantZing Web Bundle (expo export + post-web-build.js)
# Stage 2: Sovereign ATProto PDS + AppView Hybrid + QuantOS Proxy Server (:3008)
# =============================================================================

FROM node:24-bookworm AS web-build

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV CI=1
ENV NODE_OPTIONS="--max-old-space-size=8192"

ARG EXPO_PUBLIC_ENV=production
ENV EXPO_PUBLIC_ENV=${EXPO_PUBLIC_ENV}
ARG EXPO_PUBLIC_QUANTZING_DOMAIN=quantzing.com
ENV EXPO_PUBLIC_QUANTZING_DOMAIN=${EXPO_PUBLIC_QUANTZING_DOMAIN}
ARG EXPO_PUBLIC_RELEASE_VERSION=1.139.0
ENV EXPO_PUBLIC_RELEASE_VERSION=${EXPO_PUBLIC_RELEASE_VERSION}
ARG EXPO_PUBLIC_BUNDLE_IDENTIFIER=production
ENV EXPO_PUBLIC_BUNDLE_IDENTIFIER=${EXPO_PUBLIC_BUNDLE_IDENTIFIER}

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY scripts ./scripts
COPY lexicons ./lexicons

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm lexicons:generate && \
    pnpm intl:build && \
    EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 \
    EXPO_UNSTABLE_TREE_SHAKING=1 \
    pnpm exec expo export --platform web --source-maps && \
    node ./scripts/post-web-build.js

# =============================================================================
# Stage 2: Production Runtime Image (Node 24 Slim)
# =============================================================================

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Etc/UTC
ENV HOST=0.0.0.0
ENV PORT=3008
ENV QUANTZING_DATA_DIR=/data/.quantzing-data
ENV QUANT_AI_HOST=quant-ai
ENV QUANT_AI_PORT=4240
ENV QUANT_ROUTER_HOST=quant-router
ENV QUANT_ROUTER_PORT=4003
ENV QUANT_PAY_HOST=quant-pay
ENV QUANT_PAY_PORT=4002

RUN apt-get update && apt-get install --yes --no-install-recommends \
    ca-certificates \
    dumb-init && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /data/.quantzing-data/blobs && \
    chown -R node:node /data /app

COPY --from=web-build --chown=node:node /app/package.json ./package.json
COPY --from=web-build --chown=node:node /app/dist ./dist
COPY --from=web-build --chown=node:node /app/scripts ./scripts
COPY --from=web-build --chown=node:node /app/deploy ./deploy

VOLUME ["/data/.quantzing-data"]

USER node

EXPOSE 3008

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3008/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "./scripts/serve-quantzing.mjs"]

LABEL org.opencontainers.image.title="QuantZing"
LABEL org.opencontainers.image.description="QuantZing Sovereign ATProto Social Network & QuantOS Web/PDS Server"
LABEL org.opencontainers.image.url="https://quantzing.com"
LABEL org.opencontainers.image.licenses="MIT"
