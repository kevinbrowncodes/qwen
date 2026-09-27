"""The Qwen-Image-2.1 worker (STORY_015): loads the pipeline once, then runs jobs sent by the model server.

Protocol: one JSON object per line (spark/model-server/src/protocol.ts).
  stdin:  {"type":"job", id, prompt, seed, steps, width?, height?, references:[paths], output}
          {"type":"cancel", id}
  stdout: {"type":"ready"} | {"type":"progress", id, step, steps}
          {"type":"done", id, path, width, height} | {"type":"failed", id, message} | {"type":"cancelled", id}

stdout carries protocol lines only: the libraries' own prints and progress bars are sent to stderr, which the server
logs. A cancel is honoured at the next denoising step: the step callback raises, the pipeline unwinds, and the worker
is free for the next job.
"""

import json
import os
import queue
import sys
import threading

# Keep the real stdout for the protocol, and point fd 1 (and Python's print) at stderr before any library loads.
_protocol = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr

import torch  # noqa: E402
from PIL import Image  # noqa: E402

WEIGHTS = os.environ.get("WEIGHTS", "/weights")
_lock = threading.Lock()
_cancelled: set = set()
_jobs: "queue.Queue[dict]" = queue.Queue()


class Cancelled(Exception):
    pass


def say(message: dict) -> None:
    with _lock:
        _protocol.write(json.dumps(message) + "\n")
        _protocol.flush()


def read_stdin() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            print(f"worker: ignoring a line that is not JSON: {line[:80]}", file=sys.stderr)
            continue
        if message.get("type") == "cancel":
            with _lock:
                _cancelled.add(message.get("id"))
        elif message.get("type") == "job":
            _jobs.put(message)
    # The server closed our stdin: finish.
    _jobs.put({"type": "exit"})


def load_image(path: str) -> Image.Image:
    """A reference as the pipeline takes it: RGBA when it has transparency (the model reads the alpha), else RGB."""
    image = Image.open(path)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    return image.convert("RGBA") if has_alpha else image.convert("RGB")


def run(pipe, job: dict) -> None:
    job_id = job["id"]
    steps = int(job.get("steps", 40))

    def on_step(_pipe, step: int, _timestep, callback_kwargs: dict) -> dict:
        with _lock:
            if job_id in _cancelled:
                raise Cancelled()
        say({"type": "progress", "id": job_id, "step": step + 1, "steps": steps})
        return callback_kwargs

    kwargs = {
        "prompt": job["prompt"],
        "num_inference_steps": steps,
        "generator": torch.Generator("cuda").manual_seed(int(job["seed"])),
        "callback_on_step_end": on_step,
    }
    if job.get("width") and job.get("height"):
        kwargs["width"] = int(job["width"])
        kwargs["height"] = int(job["height"])
    references = [load_image(p) for p in job.get("references") or []]
    if references:
        kwargs["image"] = references if len(references) > 1 else references[0]
    try:
        image = pipe(**kwargs).images[0]
        image.save(job["output"])
        say({"type": "done", "id": job_id, "path": job["output"], "width": image.width, "height": image.height})
    except Cancelled:
        say({"type": "cancelled", "id": job_id})
    except torch.OutOfMemoryError:
        say({"type": "failed", "id": job_id, "message": "The Spark ran out of memory for this image; try a smaller one."})
    except Exception as error:  # the server reports the message; the worker stays up for the next job
        say({"type": "failed", "id": job_id, "message": f"{type(error).__name__}: {error}"[:300]})
    finally:
        with _lock:
            _cancelled.discard(job_id)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def main() -> int:
    from diffusers import QwenImage21Pipeline

    pipe = QwenImage21Pipeline.from_pretrained(WEIGHTS, torch_dtype=torch.bfloat16).to("cuda")
    pipe.set_progress_bar_config(disable=True)
    threading.Thread(target=read_stdin, daemon=True).start()
    say({"type": "ready"})
    while True:
        job = _jobs.get()
        if job.get("type") == "exit":
            return 0
        with _lock:
            if job["id"] in _cancelled:
                _cancelled.discard(job["id"])
                say({"type": "cancelled", "id": job["id"]})
                continue
        run(pipe, job)


if __name__ == "__main__":
    sys.exit(main())
