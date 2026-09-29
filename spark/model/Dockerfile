# spark/model/Dockerfile — Qwen-Image-2.1 on the DGX Spark (GB10, sm_121, aarch64, CUDA 13) (STORY_014).
#
# Nothing is installed on the host: this image is the whole model stack. The weights are a read-only bind mount
# (models/Qwen-Image-2.1, CHORE_002) and outputs a read-write one; neither is baked in. The recipe is the sibling
# minimax project's, which is known to work on this box: its CUDA 13 runtime base (pinned by digest) and PyTorch from
# the cu130 index, the only index with aarch64 + CUDA 13 wheels. Not the NGC pytorch image: spark-ltx2 found its
# kernels give wrong numerics on sm_121.
#
# STORY_015: the same image runs the model server (spark/model-server, TypeScript on Node 26, no dependencies) in
# front of the worker (worker.py). Build context is spark/: docker build -f spark/model/Dockerfile spark
ARG CUDA_IMAGE=nvidia/cuda:13.0.2-runtime-ubuntu24.04@sha256:6a0e31b59e70890446f2c17356d6efc0d54260090a8c63d6ca7c2ad049db95d2
ARG NODE_IMAGE=node:26-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae
FROM ${NODE_IMAGE} AS node

FROM ${CUDA_IMAGE}

ARG TORCH_INDEX=https://download.pytorch.org/whl/cu130
ARG TORCH_VERSION=2.11.0+cu130
ARG TORCHVISION_VERSION=0.26.0+cu130
# QwenImage21Pipeline exists only on diffusers' main branch (added in 6256aa7666, 2026-09-18; no release has it yet).
# Pinned to main as read on 2026-09-26.
ARG DIFFUSERS_COMMIT=e0abab83b5df05de9e7abd788643c1a7c1e42e28
# The model card needs transformers >= 5.17.
ARG TRANSFORMERS_VERSION=5.17.0
# STORY_019: diffusers loads LoRAs (the community add-ons) only through PEFT. Latest release as read on 2026-09-29.
ARG PEFT_VERSION=0.21.1
ARG UID=1000
ARG GID=1000

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 TOKENIZERS_PARALLELISM=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv procps libatomic1 \
 && rm -rf /var/lib/apt/lists/*

# Ubuntu 24.04 ships an "ubuntu" user at uid/gid 1000; retire it so the host user's ids can be reused.
RUN (userdel -r ubuntu 2>/dev/null || true) && (groupdel ubuntu 2>/dev/null || true) \
 && groupadd -g "${GID}" model && useradd -m -u "${UID}" -g "${GID}" -s /bin/bash model \
 && mkdir -p /srv/model && chown model:model /srv/model
USER model
WORKDIR /srv/model

RUN python3 -m venv /srv/model/venv && /srv/model/venv/bin/pip install --quiet --upgrade pip
RUN /srv/model/venv/bin/pip install --quiet --extra-index-url "${TORCH_INDEX}" "torch==${TORCH_VERSION}" "torchvision==${TORCHVISION_VERSION}"
RUN /srv/model/venv/bin/pip install --quiet \
      "git+https://github.com/huggingface/diffusers@${DIFFUSERS_COMMIT}" \
      "transformers==${TRANSFORMERS_VERSION}" accelerate pillow \
 && /srv/model/venv/bin/pip freeze > /srv/model/requirements.lock
# Its own layer, so adding it kept the torch and diffusers layers above; the lock is written again with it.
RUN /srv/model/venv/bin/pip install --quiet "peft==${PEFT_VERSION}" \
 && /srv/model/venv/bin/pip freeze > /srv/model/requirements.lock

# Node for the model server: the official binary, the same pinned image the app uses (glibc 2.36 → runs on 24.04).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --chown=model:model model/try.py model/worker.py /srv/model/
COPY --chown=model:model model-server/package.json /srv/model-server/
COPY --chown=model:model model-server/src/ /srv/model-server/src/
ENV PATH="/srv/model/venv/bin:${PATH}" DIFFUSERS_COMMIT="${DIFFUSERS_COMMIT}" \
    WEIGHTS=/weights OUTPUT_DIR=/outputs WORKER="python3 /srv/model/worker.py" PORT=4120
EXPOSE 4120
CMD ["node", "/srv/model-server/src/main.ts"]
