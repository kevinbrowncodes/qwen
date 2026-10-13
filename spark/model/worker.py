"""The Qwen-Image-2.1 worker (STORY_015): loads the pipeline once, then runs jobs sent by the model server.

Protocol: one JSON object per line (spark/model-server/src/protocol.ts).
  stdin:  {"type":"init", loras:[{id, path}]}   (first, when the server has add-ons; STORY_019)
          {"type":"job", id, prompt, seed, steps, width?, height?, references:[paths], output,
                         lora?:{id, scale, guidance?}}
          {"type":"cancel", id}
  stdout: {"type":"ready", loras:[ids that loaded]} | {"type":"progress", id, step, steps}
          {"type":"done", id, path, width, height} | {"type":"failed", id, message} | {"type":"cancelled", id}

stdout carries protocol lines only: the libraries' own prints and progress bars are sent to stderr, which the server
logs. A cancel is honoured at the next denoising step: the step callback raises, the pipeline unwinds, and the worker
is free for the next job. Reading stdin, the stops and the loop that takes jobs are jobloop.py (STORY_026), which
needs no torch and is tested in the gate.

Add-ons (LoRAs, STORY_019) are loaded once, after the pipeline, and left unfused: each job enables the one it names
at its strength, or disables them all, so switching costs nothing. One that fails to load is logged and left out, and
the server never offers it. An add-on's `guidance` (STORY_021) is the job's true_cfg_scale: the pipeline's default
is 1.0, no guidance, and some creators tuned theirs for 3 to 6. Above 1 the pipeline runs a second, unguided pass per
step, so such a job takes about twice as long.
"""

import json
import os
import select
import sys
import threading

from jobloop import JobLoop

# Keep the real stdout for the protocol, and point fd 1 (and Python's print) at stderr before any library loads.
_protocol = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr

import torch  # noqa: E402
from PIL import Image  # noqa: E402
from PIL.PngImagePlugin import PngInfo  # noqa: E402

WEIGHTS = os.environ.get("WEIGHTS", "/weights")
_loop = JobLoop(_protocol)


class Cancelled(Exception):
    pass


def load_image(path: str) -> Image.Image:
    """A reference as the pipeline takes it: RGBA when it has transparency (the model reads the alpha), else RGB."""
    image = Image.open(path)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    return image.convert("RGBA") if has_alpha else image.convert("RGB")


def read_init(timeout: float = 2.0) -> list:
    """The add-ons the server asked for. It writes `init` as soon as the worker starts, so after the minutes the
    pipeline takes to load it is already waiting; no line within the timeout means the server has none."""
    ready, _, _ = select.select([sys.stdin], [], [], timeout)
    if not ready:
        return []
    line = sys.stdin.readline().strip()
    try:
        message = json.loads(line) if line else {}
    except json.JSONDecodeError:
        message = {}
    if message.get("type") == "init":
        return [l for l in message.get("loras") or [] if isinstance(l, dict) and l.get("id") and l.get("path")]
    if message.get("type") == "job":
        _loop.put(message)  # not expected before ready, but never dropped
    return []


def load_loras(pipe, wanted: list) -> list:
    """Loads each add-on under its id; returns the ids that loaded."""
    loaded = []
    for lora in wanted:
        try:
            pipe.load_lora_weights(
                os.path.dirname(lora["path"]), weight_name=os.path.basename(lora["path"]), adapter_name=lora["id"]
            )
            loaded.append(lora["id"])
            print(f"worker: add-on {lora['id']} loaded", file=sys.stderr)
        except Exception as error:  # a bad file must not keep the model from serving
            print(f"worker: add-on {lora['id']} failed to load: {type(error).__name__}: {error}"[:400], file=sys.stderr)
    if loaded:
        pipe.disable_lora()
    return loaded


def use_lora(pipe, job: dict, loaded: list) -> None:
    """Exactly the job's add-on at its strength, or none."""
    lora = job.get("lora")
    if lora and lora.get("id") in loaded:
        pipe.enable_lora()
        pipe.set_adapters([lora["id"]], adapter_weights=[float(lora.get("scale", 1.0))])
    elif lora:
        raise RuntimeError(f"the add-on {lora.get('id')} is not loaded")
    elif loaded:
        pipe.disable_lora()


def png_info(job: dict, image: Image.Image) -> PngInfo:
    """The settings the image carries (STORY_024): the server's lines, with the size, which only the saved image knows,
    appended to the Size line. Written as a `parameters` text chunk, the name image tools conventionally read (Pillow
    falls back to iTXt for a prompt outside Latin-1); the pixels are unchanged."""
    info = PngInfo()
    params = job.get("parameters")
    if params:
        lines = list(params["lines"])
        at = params["sizeLine"]
        if 0 <= at < len(lines):
            lines[at] = f"{lines[at]} · {image.width} × {image.height}"
        info.add_text("parameters", "\n".join(lines))
    return info


def run(pipe, job: dict, loaded: list, loop: JobLoop) -> None:
    job_id = job["id"]
    say = loop.say
    steps = int(job.get("steps", 40))

    def on_step(_pipe, step: int, _timestep, callback_kwargs: dict) -> dict:
        if loop.stopped(job_id):
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
    guidance = (job.get("lora") or {}).get("guidance")
    if guidance and float(guidance) > 1:
        # The pipeline applies true CFG only when a negative prompt is given (do_true_cfg = scale > 1 and
        # has_neg_prompt); without one it logs a warning and samples unguided. The model card's empty negative
        # prompt is a single space.
        kwargs["true_cfg_scale"] = float(guidance)
        kwargs["negative_prompt"] = " "
    references = [load_image(p) for p in job.get("references") or []]
    if references:
        kwargs["image"] = references if len(references) > 1 else references[0]
    try:
        use_lora(pipe, job, loaded)
        image = pipe(**kwargs).images[0]
        image.save(job["output"], pnginfo=png_info(job, image))
        say({"type": "done", "id": job_id, "path": job["output"], "width": image.width, "height": image.height})
    except Cancelled:
        say({"type": "cancelled", "id": job_id})
    except torch.OutOfMemoryError:
        say({"type": "failed", "id": job_id, "message": "The Spark ran out of memory for this image; try a smaller one."})
    except Exception as error:  # the server reports the message; the worker stays up for the next job
        say({"type": "failed", "id": job_id, "message": f"{type(error).__name__}: {error}"[:300]})
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def main() -> int:
    from diffusers import QwenImage21Pipeline

    pipe = QwenImage21Pipeline.from_pretrained(WEIGHTS, torch_dtype=torch.bfloat16).to("cuda")
    pipe.set_progress_bar_config(disable=True)
    loaded = load_loras(pipe, read_init())
    threading.Thread(target=_loop.read, args=(sys.stdin,), daemon=True).start()
    _loop.say({"type": "ready", "loras": loaded})
    return _loop.serve(lambda job, loop: run(pipe, job, loaded, loop))

if __name__ == "__main__":
    sys.exit(main())
