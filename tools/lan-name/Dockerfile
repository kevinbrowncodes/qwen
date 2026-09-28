# tools/lan-name/Dockerfile (CHORE_004): the mDNS responder for qwen.local. Plain Node running TypeScript, no packages:
# the app's pinned base image, so nothing new is pulled.
ARG NODE_IMAGE=node:26-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae
FROM ${NODE_IMAGE}
COPY src/mdns.ts src/main.ts /srv/lan-name/src/
COPY package.json /srv/lan-name/
WORKDIR /srv/lan-name
USER node
CMD ["node", "src/main.ts"]
