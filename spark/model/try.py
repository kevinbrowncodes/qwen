"""STORY_014: render Qwen-Image-2.1 by hand on the Spark and write down the time and memory.

Runs inside qwen/model (spark/model/Dockerfile) with the weights at /weights (read-only) and outputs at /outputs.
Renders a text-to-image at 1:1 and at 16:9 at the model card's sizes, then an edit of the stub's reference fixture,
and writes one JSON record of what it measured. Peak memory: torch's own counter for the process's CUDA allocations,
plus the host's used memory sampled from /proc/meminfo (nvidia-smi cannot report memory on the GB10's unified memory).
"""

import json
import os
import sys
import threading
import time
from datetime import datetime, timezone

import torch
from PIL import Image

WEIGHTS = os.environ.get("WEIGHTS", "/weights")
OUT = os.environ.get("OUTPUTS", "/outputs")
RECORD = os.environ.get("RECORD", "/record/measurement.json")
REFERENCE = os.environ.get("REFERENCE", "/fixtures/reference.png")
STEPS = int(os.environ.get("STEPS", "40"))
PROMPT = "A red bicycle leaning against a weathered brick wall, late afternoon light, photograph"
EDIT_PROMPT = "Turn the checkerboard into a chessboard on a wooden table, photograph"


def meminfo_used_gib() -> float:
    fields = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            fields[k] = int(v.strip().split()[0])
    return (fields["MemTotal"] - fields["MemAvailable"]) / 1024 / 1024


class Sampler:
    """Samples the host's used memory every 0.5 s and keeps the peak."""

    def __init__(self) -> None:
        self.peak = meminfo_used_gib()
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.peak = max(self.peak, meminfo_used_gib())
            time.sleep(0.5)

    def __enter__(self) -> "Sampler":
        self._t.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._t.join()


def main() -> int:
    from diffusers import QwenImage21Pipeline  # imported late so a missing class is a clear error

    record: dict = {
        "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": "Qwen/Qwen-Image-2.1",
        "revision": "790c92633540aa0cb11d9abf19eb46d861714758",
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "device": torch.cuda.get_device_name(0),
        "capability": list(torch.cuda.get_device_capability(0)),
        "diffusers_commit": os.environ.get("DIFFUSERS_COMMIT", ""),
        "dtype": "bfloat16",
        "steps": STEPS,
        "true_cfg_scale": 1.0,
        "host_used_gib_before": round(meminfo_used_gib(), 1),
        "runs": [],
    }
    import diffusers
    import transformers

    record["diffusers"] = diffusers.__version__
    record["transformers"] = transformers.__version__

    with Sampler() as s:
        t0 = time.perf_counter()
        pipe = QwenImage21Pipeline.from_pretrained(WEIGHTS, torch_dtype=torch.bfloat16).to("cuda")
        torch.cuda.synchronize()
        record["load_seconds"] = round(time.perf_counter() - t0, 1)
        record["host_used_gib_after_load"] = round(meminfo_used_gib(), 1)
        record["cuda_allocated_gib_after_load"] = round(torch.cuda.memory_allocated() / 2**30, 1)

        jobs = [
            {"name": "t2i-1x1", "prompt": PROMPT, "width": 2048, "height": 2048},
            {"name": "t2i-16x9", "prompt": PROMPT, "width": 2752, "height": 1536},
            {"name": "edit", "prompt": EDIT_PROMPT, "image": REFERENCE},
        ]
        # JOBS='[{"name":..., "width":..., "height":...}]' measures other sizes (the edit is added when "edit" is named).
        if os.environ.get("JOBS"):
            jobs = [{"prompt": EDIT_PROMPT if j.get("name") == "edit" else PROMPT, **j} for j in json.loads(os.environ["JOBS"])]
            for j in jobs:
                if j.get("name") == "edit":
                    j["image"] = REFERENCE
        for job in jobs:
            torch.cuda.reset_peak_memory_stats()
            kwargs = {"prompt": job["prompt"], "num_inference_steps": STEPS, "generator": torch.Generator("cuda").manual_seed(42)}
            if "width" in job:
                kwargs.update(width=job["width"], height=job["height"])
            if "image" in job:
                kwargs["image"] = Image.open(job["image"]).convert("RGB")
            t = time.perf_counter()
            image = pipe(**kwargs).images[0]
            torch.cuda.synchronize()
            seconds = time.perf_counter() - t
            path = os.path.join(OUT, f"story014-{job['name']}.png")
            image.save(path)
            run = {
                "name": job["name"],
                "size": [image.width, image.height],
                "seconds": round(seconds, 1),
                "seconds_per_step": round(seconds / STEPS, 2),
                "cuda_peak_gib": round(torch.cuda.max_memory_allocated() / 2**30, 1),
                "output": path,
            }
            record["runs"].append(run)
            print(json.dumps(run), flush=True)
        record["host_used_gib_peak"] = round(s.peak, 1)

    os.makedirs(os.path.dirname(RECORD), exist_ok=True)
    with open(RECORD, "w") as f:
        json.dump(record, f, indent=2)
        f.write("\n")
    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
