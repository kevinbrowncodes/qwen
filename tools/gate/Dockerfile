# tools/gate/Dockerfile — the toolchain image (STORY_005): Node 26, pnpm, Playwright's Chromium and WebKit.
#
# Every gate step (typecheck, lint, unit, integration, build, e2e) and the dev server run inside this image with the repo
# bind-mounted at /work. Nothing Node-related is installed on the Spark (containers first). The recipe is the sibling
# minimax project's STORY_007, which is known to work on this box; base pinned by tag and digest (read there 2026-09-12).
ARG NODE_IMAGE=node:26-bookworm@sha256:e7bc1a4cd2419953c91f9a6f7bb6efb3737773093fb4ded0b1c77a0a5831fac4
FROM ${NODE_IMAGE}

ARG PNPM_VERSION=10.32.1
ARG PLAYWRIGHT_VERSION=1.63.0
ARG UID=1000
ARG GID=1000

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_store_dir=/pnpm-store \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1

# pnpm at the version the root package.json's packageManager field names (Node 26 ships no corepack).
RUN npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force

# Playwright's browsers and their OS packages, at the same version as @playwright/test in the workspace.
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium webkit \
 && rm -rf /var/lib/apt/lists/* /root/.npm /root/.cache \
 && chmod -R a+rX /ms-playwright

# Run as the host user's ids so files written into the bind mount stay the owner's. The node image already has
# uid/gid 1000 ("node"); any other id gets a fresh user.
RUN if ! getent group "${GID}" > /dev/null; then groupadd -g "${GID}" gate; fi \
 && if ! getent passwd "${UID}" > /dev/null; then useradd -m -u "${UID}" -g "${GID}" -s /bin/bash gate; fi \
 && mkdir -p /pnpm-store /work && chown "${UID}:${GID}" /pnpm-store /work

USER ${UID}:${GID}
WORKDIR /work
CMD ["bash"]
