/**
 * What this server offers (STORY_015): Qwen-Image-2.1, the seven ratios in the reference's order, at the sizes chosen
 * in STORY_014 from the measurements on the Spark (spark/model/measurements/, spark/README.md → Sizes).
 */
import type { Capabilities } from "./validation.ts";

export const MODEL_ID = "qwen-image-2.1";

/**
 * About one megapixel per ratio, every side a multiple of 32: 51 s and 36.9 GiB peak for 1376×768 on the Spark,
 * against 248–266 s and 56.7 GiB for the card's 2K sizes (spark/model/measurements/2026-09-26*.json, STORY_014).
 * An edit takes its size from its reference at the same ~1 MP (the pipeline's output_resolution=1024).
 */
export const CAPABILITIES: Capabilities = {
  models: [{ id: MODEL_ID, label: "Qwen-Image 2.1" }],
  ratios: [
    { id: "1:1", width: 1024, height: 1024 },
    { id: "2:3", width: 832, height: 1248 },
    { id: "3:2", width: 1248, height: 832 },
    { id: "3:4", width: 896, height: 1184 },
    { id: "4:3", width: 1184, height: 896 },
    { id: "16:9", width: 1376, height: 768 },
    { id: "9:16", width: 768, height: 1376 },
  ],
  defaultRatio: "16:9",
  prompt: { maxChars: 4000 },
  referenceImages: { max: 10, maxBytes: 20 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp"] },
};

export const STEPS = 40;
