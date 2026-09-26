# EPIC_003 — The image generation screen is rebuilt to match the reference

**Status:** Not started (after EPIC_002)

## Goal

Our own implementation of the MVP flow from [README.md → MVP Scope](../../README.md#mvp-scope), each surface a clone story citing its EPIC_001 capture, built against the stub generation server, with the model endpoint as configuration.

## Stories

Drafted from EPIC_001's component inventory, one per surface/state group, numbered in implementation order. Every story carries a **Departures from the reference** section ([CLAUDE.md → §6 rule 8](../../CLAUDE.md#6-key-rules)) — expected departures already known: options the reference exposes that only make sense against Alibaba's cloud, and any limit Qwen-Image-2.1 on the Spark imposes (resolutions, generation time) that their cloud does not.
