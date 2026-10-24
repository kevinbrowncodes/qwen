"""What the mflux worker does with a job, without mflux (STORY_035): standard library only, so the gate tests it.

worker_mlx.py hands these the protocol's job dicts (spark/model-server/src/protocol.ts) and does only the MLX calls:
the arguments for QwenImage21Edit.generate_image, which loaded add-on gets which scale, the PNG's settings text
(STORY_024), and the message a failed job reports.
"""

from typing import Optional

# The model card's empty negative prompt is a single space. mflux, like diffusers, runs true CFG only when guidance is
# above 1 and a negative prompt is given; mflux's edit class refuses guidance above 1 without one.
NEGATIVE_PROMPT = " "
MEMORY_MESSAGE = "The model server ran out of memory for this image; try a smaller one."


def memory_limit_bytes(env: dict) -> Optional[int]:
    """The worker's MLX memory limit (STORY_041), from MEMORY_LIMIT_GB in its environment (~/qwen-model/.env): the
    loaded model plus an image's working set, in bytes. None when unset or not a positive number: MLX keeps its own
    default, 91.2 GiB on the Ultra (95 % of hw.memsize, measured 2026-10-23). MLX calls the limit a guideline: past
    it, MLX frees its cache and waits for work in flight before allocating more, and an allocation raises (the
    out-of-memory error failure_message words) only when RAM and swap are also exhausted. So it slows the worker's
    growth; the Ultra's memory agent, asked before each image, is the guard (PATHS EPIC_023)."""
    raw = str(env.get("MEMORY_LIMIT_GB") or "").strip()
    try:
        gb = float(raw)
    except ValueError:
        return None
    return int(gb * (1 << 30)) if gb > 0 else None


class NotLoaded(RuntimeError):
    """A job named an add-on the worker does not have (the server only offers loaded ones; a restart can race)."""


def guidance_of(job: dict) -> float:
    """The job's add-on guidance when above 1 (STORY_021), else 1.0: no guidance."""
    raw = (job.get("lora") or {}).get("guidance")
    try:
        value = float(raw) if raw is not None else 1.0
    except (TypeError, ValueError):
        return 1.0
    return value if value > 1 else 1.0


def generate_kwargs(job: dict) -> dict:
    """The keyword arguments for QwenImage21Edit.generate_image. No references is text-to-image; an edit without a
    size takes its reference's shape at about 1 MP (mflux's output_resolution=1024), as on the Spark."""
    kwargs: dict = {
        "seed": int(job["seed"]),
        "prompt": job["prompt"],
        "num_inference_steps": int(job.get("steps", 40)),
        "image_paths": list(job.get("references") or []),
    }
    if job.get("width") and job.get("height"):
        kwargs["width"] = int(job["width"])
        kwargs["height"] = int(job["height"])
    guidance = guidance_of(job)
    if guidance > 1:
        kwargs["guidance"] = guidance
        kwargs["negative_prompt"] = NEGATIVE_PROMPT
    return kwargs


def lora_scales(job: dict, loaded: list) -> dict:
    """Each loaded add-on's scale for this job: the job's own at its strength, every other at 0."""
    scales = {lora_id: 0.0 for lora_id in loaded}
    lora = job.get("lora")
    if lora:
        if lora.get("id") not in scales:
            raise NotLoaded(f"the add-on {lora.get('id')} is not loaded")
        scales[lora["id"]] = float(lora.get("scale", 1.0))
    return scales


def parameters_text(job: dict, width: int, height: int) -> Optional[str]:
    """The PNG's `parameters` text (STORY_024): the server's lines, with the size appended to the Size line."""
    params = job.get("parameters")
    if not params:
        return None
    lines = list(params["lines"])
    at = params.get("sizeLine", -1)
    if isinstance(at, int) and 0 <= at < len(lines):
        lines[at] = f"{lines[at]} · {width} × {height}"
    return "\n".join(lines)


def failure_message(error: BaseException) -> str:
    """What a failed job reports. MLX reports running out of memory as a RuntimeError whose text mentions memory."""
    text = str(error)
    if isinstance(error, MemoryError) or (isinstance(error, RuntimeError) and "memory" in text.lower()):
        return MEMORY_MESSAGE
    return f"{type(error).__name__}: {text}"[:300]
