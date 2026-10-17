# BUG_013 — The Spark runs short of GPU memory every day, and spark/up.sh can restart the model without checking

**Status:** Open (2026-10-17)
**Found:** 2026-10-17, while deciding whether the model server could be restarted for CHORE_008 with the sibling minimax app mid-render

## Summary

Two related problems on the shared Spark:

1. **The GPU driver runs out of memory every day.** Since the boot of 2026-10-13 20:06, the kernel has logged 377 `NVRM: … Out of memory [NV_ERR_NO_MEMORY] … _memdescAllocInternal` failures: 3 on 10-13, 29 on 10-14, 122 on 10-15, 143 on 10-16 and 80 on 10-17 by 12:41, a few to a dozen every hour. The boot before it, which logged 343 of the same failures (the last at 16:04), **ended without a shutdown sequence at 2026-10-13 16:34**. The journal simply stops, and the next boot is at 20:06; the boot before that ended with a normal `systemd-shutdown`. The cause of the 10-13 stop is not proven, but on the Spark the GPU and the system share the same 121 GiB, so a GPU allocation that fails under pressure can stall the whole machine rather than one process.
2. **`spark/up.sh` skips its memory check when `qwen-model` is already running,** then runs `docker compose up -d --build model`. When the image or configuration has changed, that recreates the container, which stops the model server and loads the model again with no check of available memory. That is the path every model-server deploy takes, including the restart for STORY_030 on 2026-10-16.

## Steps to Reproduce

1. With the sibling minimax app's ComfyUI rendering (holding about 46 GiB of GPU memory, read with `nvidia-smi --query-compute-apps=pid,used_memory --format=csv`) and qwen-model loaded (about 32 GiB), read `MemAvailable` in `/proc/meminfo`: 22–24 GiB on 2026-10-16 and 10-17, with 4–5 GiB of swap in use.
2. `journalctl -k -b 0 | grep -c NV_ERR_NO_MEMORY`: the count grows through the day.
3. Change anything in `spark/model-server/` and run `spark/up.sh`. It prints "qwen-model is already running", and then rebuilds and recreates the container anyway, without the 60 GiB check.

## Expected vs Actual Behaviour

- **Expected:** the two apps fit the Spark's memory with headroom, or each knows the other's budget, so GPU allocations do not fail as a matter of routine. A model-server restart through `spark/up.sh` checks memory the same way a cold start does: about 60 GiB available once qwen's own memory is counted back in.
- **Actual:** GPU allocations fail daily. One unexplained hard stop of the machine followed a day of the same failures. `spark/up.sh` checks memory only on a cold start, so a deploy can reload the model into a box that is already short.

## Root Cause

Not yet established.

- **(1) Known:** qwen-model holds about 32 GiB once loaded and needs about 60 GiB available to load (`NEED_GIB=60` in `spark/up.sh`, from STORY_014's measurements). minimax's ComfyUI held 40–46 GiB while rendering on both days. Neither app knows about the other.
- **(1) Unknown:** which process the `NV_ERR_NO_MEMORY` failures belong to (the kernel line does not say), and whether they are harmless retries or real failures, so this needs measuring. Whether the 10-13 stop was memory at all also needs evidence (a hardware or power event leaves the same gap in the journal).
- **(2) Known:** in `spark/up.sh` the memory check sits in the `else` branch of "is qwen-model running", so a running container bypasses it, and `docker compose up -d --build` recreates it when the image changed.

## Acceptance Criteria

- [ ] **The failures are attributed:** which process (qwen's worker, minimax's ComfyUI, or another) gets `NV_ERR_NO_MEMORY`, and whether any job failed because of it, read from both apps' logs around the timestamps. Record the method and the result here.
- [ ] **`spark/up.sh` checks memory before recreating a running model server:** it counts qwen-model's own GPU memory back in (from `nvidia-smi`) and refuses below `NEED_GIB` with the same message as a cold start, rather than recreating anyway. The existing behaviour when nothing changed (an idempotent no-op) stays. A test (`spark/up.test.sh`, or the script's dry-run pattern like `tools/gate/run.test.sh`) proves both branches.
- [ ] **The owner decides how the two apps share the Spark:** a memory budget for each, or a rule such as "qwen does not reload while minimax renders". The decision and its date are written in the README's Running the Model section and in the minimax repo's equivalent.
- [ ] **If (1) shows qwen's worker is the one failing,** a story follows for what the model server does about it. This bug does not change model-server code.

## Notes

- The restart for CHORE_008 (removing `nsfw-f23gg`) was held on 2026-10-17 for this reason, at the owner's choice after they were shown the 10-13 evidence. A background check restarts the model server once qwen is idle and at least 29 GiB is available (60 GiB with qwen's 32 counted back in).
- `vm.panic_on_oom = 0` and `kernel.panic = 0`, and neither `systemd-oomd` nor `earlyoom` is active. The kernel is not set to reboot on memory exhaustion, so a stop like 10-13's would be a hang or a hardware event, not a configured reboot.
