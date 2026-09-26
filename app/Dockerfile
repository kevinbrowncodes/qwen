# app/Dockerfile — the production UI image (STORY_005). Build context is the repo root (compose.yaml).
# Stage 1 installs the workspace's dependencies for app only, stage 2 builds Next.js in standalone mode, stage 3 is
# the slim runtime with nothing but the traced bundle. Base pinned by tag and digest (the sibling's, read 2026-09-12).
ARG NODE_IMAGE=node:26-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION=10.32.1
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
RUN npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force
WORKDIR /work
# Every workspace manifest, so the frozen lockfile resolves; only app's dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
COPY recon/package.json recon/
COPY tools/gate/package.json tools/gate/
COPY tools/stub-generation-server/package.json tools/stub-generation-server/
RUN pnpm install --frozen-lockfile --filter app...

FROM deps AS build
# The stub too: the app's integration tests import it, and `next build` type-checks the whole app project (BUG_003).
COPY tools/stub-generation-server/ tools/stub-generation-server/
COPY app/ app/
RUN pnpm --filter app build

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /srv
COPY --from=build --chown=node:node /work/app/.next/standalone ./
COPY --from=build --chown=node:node /work/app/.next/static ./app/.next/static
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3100
CMD ["node", "app/server.js"]
