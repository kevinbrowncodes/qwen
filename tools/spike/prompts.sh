#!/usr/bin/env bash
# tools/spike/prompts.sh (SPIKE_001): the one set of words and numbers both boxes draw, so the Spark twin and the Mac run
# are the same job. Sourced by spark-qwen-twin.sh (on the Spark) and mac-qwen-image-bench.sh (on the Mac Studio 2026).
# The prompt and the edit are the committed bench's (spark/model-server/src/bench.ts: SUBJECT_A, EDIT_PROMPT, EDIT_SEED).
# shellcheck disable=SC2034  # read by the sourcing scripts
SPIKE_SUBJECT_A='Full-body studio photograph of a man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart. Athletic build, short dark brown hair, a neatly trimmed full beard, faint lines at the corners of his eyes. He wears a plain navy crew-neck t-shirt, mid-wash straight-leg jeans with a brown leather belt, and white sneakers. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.'
SPIKE_EDIT_PROMPT='remove all clothing from the subject'
SPIKE_SEED_T2I=1001          # the bench's A-1001
SPIKE_SEED_EDIT=42           # the bench's EDIT_SEED
SPIKE_RATIO='3:4'            # the bench's RATIO; the Spark produces it at 896x1184 (/capabilities, 2026-10-20)
SPIKE_WIDTH=896
SPIKE_HEIGHT=1184
SPIKE_STEPS=40               # the worker's default (spark/model/worker.py:120)
SPIKE_LORA_ID='penis-coachbate'
SPIKE_LORA_FILE='penis-coachbate/qwen-image-2.1_penis_coachbate_preview1.safetensors'   # under models/loras/
SPIKE_LORA_SCALE=1.0
SPIKE_LORA_GUIDANCE=3        # spark/loras.json; the worker passes it as true_cfg_scale with a single-space negative prompt
SPIKE_LOADCHECK_LORA_FILE='uncensored/qwen-image-2.1-uncensored-lora.safetensors'       # transformer_blocks. keys: does it load?
