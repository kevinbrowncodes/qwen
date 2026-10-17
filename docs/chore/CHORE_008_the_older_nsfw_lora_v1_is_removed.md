# CHORE_008 — The older NSFW LoRA (version 1) is removed

**Status:** Approved by the owner on 2026-10-17 ("get rid of the older version then"), in progress

## Summary

`nsfw-f23gg`, labelled "NSFW (f23gg)", is TheseAlpacas' "NSFW LORA | Qwen Image 2.1" v1.0, the creator's "experimental" first release. It was mirrored on Hugging Face by the account f23gg and identified by its checksum. v2.0 (`nsfw-thesealpacas-v2`) replaced it two days later and is installed. The owner asked for v1.0 to go.

## Why

- **It is superseded.** The creator describes v2 as better in anatomy, prompt following, detail and realism.
- **It did nothing on the bench:** 0 of 4 edits undressed, and its text-to-image was no better than no LoRA (2026-10-02 bench, the assistant's review of 2026-10-11).
- STORY_023's own criterion already says "if v2 is kept and v1 (`nsfw-f23gg`) is not, v1 goes". That story still waits for the owner's scorecard for the other LoRAs, so this one removal is done ahead of it, by the procedure it sets out.

## Changes

- [ ] **The manifest.** The `nsfw-f23gg` entry is removed from `spark/loras.json`. v2's provenance `note`, which compares it to v1.0, says v1.0 was removed by this chore.
- [ ] **The file on disk.** `models/loras/nsfw-f23gg/` (153 MB, one `.safetensors` file) is deleted, with the owner's say-so given that session (CLAUDE.md §4a). It can be fetched again from its pinned source (`f23gg/NSFW-LORA-Qwen-Image-2.1` at `ed1acb1…`, sha256 `c29f503f…`) if it is ever wanted.
- [ ] **The model server** is restarted when no job is running and memory allows (`spark/up.sh`), and `/capabilities` lists six LoRAs, without `nsfw-f23gg`.
- [ ] **The README's** installed list drops it.
- [ ] **STORY_023** notes that v1.0 was removed ahead of it.

Older tickets (STORY_019, STORY_021, STORY_022, STORY_030, CHORE_006) and the bench scorecard mention `nsfw-f23gg` as history and are left as they are.

## Testing

- **Unit:** `spark/model-server/src/loras.test.ts`'s case over the committed manifest now expects six entries. The cases that keep the file sorted by downloads, and give every entry a creator, a made-for line and the two abilities, still run over the six.
- **Integration and e2e:** none new. They run against the stub's two fake LoRAs, so no real LoRA appears in them. Both stay green in the gate.
- **Manual, on the Spark:** after the restart, the worker's `ready` line and `/capabilities` list the six, and `spark/fetch-loras.sh status` shows nothing missing.
- **Old images made with it stay readable.** The Info panel shows a LoRA's label while the server still offers it and its id otherwise (STORY_024), so their Info reads `nsfw-f23gg` from then on.
