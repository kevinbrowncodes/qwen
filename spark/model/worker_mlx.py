"""The Qwen-Image-2.1 worker on Apple silicon (STORY_035): mflux on MLX (Metal), behind the same line protocol as
the Spark's diffusers worker that came before it (removed in CHORE_010; spark/model-server/src/protocol.ts), so the model
server and the job API did not change.

Run by the model server as its WORKER, on the Mac Studio 2026:
    uv run --project spark/model/mlx python spark/model/worker_mlx.py      (WEIGHTS = the Qwen-Image-2.1 folder)

One model, QwenImage21Edit, loaded once in bf16: with no references it draws text-to-image at the job's size; with
references it edits, at the job's size or else the reference's shape at about 1 MP. Loading mflux's text-to-image
class as well would hold the 33 GB model twice. Every add-on in `init` is loaded once, unbaked, and its layers are
recorded under its id. A job puts its own add-on's layers in place at its strength and the plain base layers
everywhere else, so switching costs no reload and an add-on not in use costs nothing per step (leaving them all in
place at scale 0 cost 17-37% per step on the Mac Studio 2026, STORY_035).
A cancel is honoured at the next step: the in-loop callback raises, the generate call unwinds, and the worker takes
the next job. What a job means without MLX (arguments, scales, PNG text, failure messages) is mlxjob.py, tested in
the gate; reading stdin, the stops and the job loop are jobloop.py.
"""

import json
import os
import select
import sys
import threading

from jobloop import JobLoop
import mlxjob

# Keep the real stdout for the protocol, and point fd 1 (and Python's print) at stderr before any library loads:
# mflux prints progress bars and notes that must never reach the server as protocol lines.
_protocol = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr

from PIL.PngImagePlugin import PngInfo  # noqa: E402

WEIGHTS = os.environ.get("WEIGHTS", "")
_loop = JobLoop(_protocol)


class Cancelled(Exception):
    pass


class _Steps:
    """mflux's in-loop callback for the running job: one `progress` line per step, and the stop check."""

    def __init__(self, loop: JobLoop) -> None:
        self.loop = loop
        self.job_id = None
        self.steps = 0

    def call_in_loop(self, t, seed, prompt, latents, config, time_steps) -> None:  # noqa: ARG002 (mflux's signature)
        if self.job_id is None:
            return
        if self.loop.stopped(self.job_id):
            raise Cancelled()
        self.loop.say({"type": "progress", "id": self.job_id, "step": int(t) + 1, "steps": self.steps})


def read_init(timeout: float = 2.0) -> list:
    """The add-ons the server asked for; it writes `init` as soon as the worker starts."""
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
        _loop.put(message)
    return []


def _wrapped(module) -> list:
    """(path, base layer, [LoRA layer objects]) for every layer of the transformer that carries add-ons."""
    from mflux.models.common.lora.layer.fused_linear_lora_layer import FusedLoRALinear
    from mflux.models.common.lora.layer.linear_lora_layer import LoRALinear

    found = []
    for path, child in module.named_modules():
        if ".loras." in f".{path}.":
            continue  # a LoRA object inside a fused layer's list: counted with its fused layer
        if isinstance(child, FusedLoRALinear):
            found.append((path, child.base_linear, list(child.loras)))
        elif isinstance(child, LoRALinear):
            found.append((path, child.linear, [child]))
    return found


class Loras:
    """The loaded add-ons, and which layer each wrapped path holds now. `use(job)` puts the job's add-on in place at
    its strength, and the base layer wherever that add-on has none, so only the job's own add-on costs anything."""

    def __init__(self, model, wanted: list) -> None:
        from mflux.models.common.lora.mapping.lora_loader import LoRALoader
        from mflux.models.qwen21.weights.qwen21_lora_mapping import Qwen21LoRAMapping

        self.model = model
        self.replace = LoRALoader._replace_target_module
        owner: dict = {}
        for lora in wanted:
            # mflux keeps a layer's existing LoRA objects when it fuses a new one in, so identity marks whose they are.
            try:
                LoRALoader.load_and_apply_lora(
                    lora_mapping=Qwen21LoRAMapping.get_mapping(),
                    transformer=model.transformer,
                    lora_paths=[lora["path"]],
                    lora_scales=[1.0],
                    bake_lora=False,
                )
                mine = [o for _, _, objs in _wrapped(model.transformer) for o in objs if id(o) not in owner]
                if not mine:
                    raise RuntimeError("no layer matched")
                owner.update((id(o), lora["id"]) for o in mine)
                print(f"worker: add-on {lora['id']} loaded ({len(mine)} layers)", file=sys.stderr)
            except Exception as error:  # a bad file must not keep the model from serving
                print(f"worker: add-on {lora['id']} failed to load: {type(error).__name__}: {error}"[:400], file=sys.stderr)
        self.loaded = list(dict.fromkeys(owner.values()))
        # path -> (base layer, {add-on id: its LoRA layer}); every path starts on its base layer.
        self.slots = {
            path: (base, {owner[id(o)]: o for o in objs if id(o) in owner}) for path, base, objs in _wrapped(model.transformer)
        }
        self.holding: dict = {}
        for path, (base, _) in self.slots.items():
            self.replace(model.transformer, path, base)
            self.holding[path] = None

    def use(self, job: dict) -> None:
        scales = mlxjob.lora_scales(job, self.loaded)  # refuses an add-on that did not load
        chosen = (job.get("lora") or {}).get("id")
        for path, (base, by_id) in self.slots.items():
            want = chosen if chosen in by_id else None
            if want is not None:
                by_id[want].scale = scales[want]
            if self.holding[path] != want:
                self.replace(self.model.transformer, path, by_id[want] if want is not None else base)
                self.holding[path] = want


def run(model, steps_cb: _Steps, loras: Loras, job: dict, loop: JobLoop) -> None:
    job_id = job["id"]
    say = loop.say
    try:
        loras.use(job)
        kwargs = mlxjob.generate_kwargs(job)
        steps_cb.job_id, steps_cb.steps = job_id, kwargs["num_inference_steps"]
        image = model.generate_image(**kwargs).image
        info = PngInfo()
        text = mlxjob.parameters_text(job, image.width, image.height)
        if text is not None:
            info.add_text("parameters", text)
        image.save(job["output"], pnginfo=info)
        say({"type": "done", "id": job_id, "path": job["output"], "width": image.width, "height": image.height})
    except Cancelled:
        say({"type": "cancelled", "id": job_id})
    except Exception as error:  # the server reports the message; the worker stays up for the next job
        say({"type": "failed", "id": job_id, "message": mlxjob.failure_message(error)})
    finally:
        steps_cb.job_id = None
        try:
            import mlx.core as mx

            mx.clear_cache()
        except Exception:  # an older MLX without clear_cache: nothing to free
            pass


def main() -> int:
    from mflux.models.qwen21.variants.edit.qwen_image_21_edit import QwenImage21Edit

    model = QwenImage21Edit(quantize=None, model_path=WEIGHTS or None)
    loras = Loras(model, read_init())
    steps_cb = _Steps(_loop)
    model.callbacks.register(steps_cb)
    threading.Thread(target=_loop.read, args=(sys.stdin,), daemon=True).start()
    _loop.say({"type": "ready", "loras": loras.loaded})
    return _loop.serve(lambda job, loop: run(model, steps_cb, loras, job, loop))


if __name__ == "__main__":
    sys.exit(main())
