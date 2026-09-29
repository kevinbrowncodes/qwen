import { validateAddition, type Candidate } from "./upload-validation";

/**
 * The composer's state (STORY_010), as a pure reducer: the mode (resting or image), the model, ratio and add-on
 * (STORY_019) the owner chose, and the text. Defaults come from the generation server's capabilities, with a static fallback shaped like
 * contract v1 so image mode still opens when the server is down (the submit then shows the server's answer).
 */
export type Mode = "chat" | "image";

export interface ModelOption {
  readonly id: string;
  readonly label: string;
}
export interface RatioOption {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
/** A community add-on (LoRA) the server has loaded (contract v1.2, STORY_019). */
export interface LoraOption {
  readonly id: string;
  readonly label: string;
}
export interface Capabilities {
  readonly models: readonly ModelOption[];
  readonly ratios: readonly RatioOption[];
  readonly defaultRatio: string;
  readonly maxReferences: number;
  readonly loras: readonly LoraOption[];
}

/** The reference's order (docs/recon/2026-09-26/interactions.md → The options), at the model server's sizes (STORY_014). */
export const FALLBACK_CAPABILITIES: Capabilities = {
  models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }],
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
  maxReferences: 10,
  loras: [],
};

/** A reference image attached for an edit (STORY_011); `key` is stable for React and removal. */
export interface ReferenceItem {
  readonly key: string;
  readonly file: File;
}

export interface ComposerState {
  readonly mode: Mode;
  readonly model: string;
  readonly ratio: string;
  /** The ratio for an edit (STORY_017): MATCH_REFERENCE keeps the reference's shape; otherwise a ratio id. */
  readonly editRatio: string;
  /** The add-on for the next generation (STORY_019): NO_LORA, or an id from the capabilities. */
  readonly lora: string;
  readonly text: string;
  readonly references: readonly ReferenceItem[];
  /** Why the last attachment was refused, shown under the composer until the next change. */
  readonly error: string | null;
}

export type ComposerAction =
  | { readonly type: "enterImage" }
  | { readonly type: "leaveImage" }
  | { readonly type: "setModel"; readonly model: string }
  | { readonly type: "setRatio"; readonly ratio: string }
  | { readonly type: "setEditRatio"; readonly ratio: string }
  | { readonly type: "setLora"; readonly lora: string }
  | { readonly type: "setText"; readonly text: string }
  | { readonly type: "capabilities"; readonly capabilities: Capabilities }
  | { readonly type: "addReferences"; readonly items: readonly ReferenceItem[] }
  /** Files read by the component (name, size, first bytes), checked here against what is already attached. */
  | { readonly type: "attach"; readonly items: readonly ReferenceItem[]; readonly candidates: readonly Candidate[] }
  | { readonly type: "removeReference"; readonly key: string }
  | { readonly type: "refuse"; readonly message: string }
  | { readonly type: "sent" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reads GET /api/capabilities; anything that is not contract-shaped is null (the caller keeps the fallback). */
export function parseCapabilities(v: unknown): Capabilities | null {
  if (!isRecord(v) || !Array.isArray(v["models"]) || !Array.isArray(v["ratios"])) return null;
  const models = v["models"].filter(isRecord).flatMap((m) => (typeof m["id"] === "string" && typeof m["label"] === "string" ? [{ id: m["id"], label: m["label"] }] : []));
  const ratios = v["ratios"]
    .filter(isRecord)
    .flatMap((r) => (typeof r["id"] === "string" && typeof r["width"] === "number" && typeof r["height"] === "number" ? [{ id: r["id"], width: r["width"], height: r["height"] }] : []));
  const first = ratios[0];
  if (models.length === 0 || first === undefined) return null;
  const wanted = typeof v["defaultRatio"] === "string" ? v["defaultRatio"] : "";
  const defaultRatio = ratios.some((r) => r.id === wanted) ? wanted : first.id;
  const refs = v["referenceImages"];
  const maxReferences = isRecord(refs) && typeof refs["max"] === "number" ? refs["max"] : FALLBACK_CAPABILITIES.maxReferences;
  // A server before v1.2 has no add-ons.
  const loras = Array.isArray(v["loras"])
    ? v["loras"].filter(isRecord).flatMap((l) => (typeof l["id"] === "string" && l["id"] !== NO_LORA && typeof l["label"] === "string" ? [{ id: l["id"], label: l["label"] }] : []))
    : [];
  return { models, ratios, defaultRatio, maxReferences, loras };
}

export function initialState(capabilities: Capabilities = FALLBACK_CAPABILITIES): ComposerState {
  return { mode: "chat", model: capabilities.models[0]?.id ?? "", ratio: capabilities.defaultRatio, editRatio: MATCH_REFERENCE, lora: NO_LORA, text: "", references: [], error: null };
}

export function reduce(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "enterImage":
      return { ...state, mode: "image" };
    case "leaveImage":
      return { ...state, mode: "chat" };
    case "setModel":
      return { ...state, model: action.model };
    case "setRatio":
      return { ...state, ratio: action.ratio };
    case "setEditRatio":
      return { ...state, editRatio: action.ratio };
    case "setLora":
      return { ...state, lora: action.lora };
    case "setText":
      return { ...state, text: action.text };
    case "addReferences":
      // Attaching enters image mode (an edit is an image generation) and clears an earlier refusal.
      return { ...state, mode: "image", references: [...state.references, ...action.items], error: null };
    case "attach": {
      const verdict = validateAddition(state.references.length, action.candidates);
      return verdict.ok ? reduce(state, { type: "addReferences", items: action.items }) : { ...state, error: verdict.message };
    }
    case "removeReference":
      return { ...state, references: state.references.filter((r) => r.key !== action.key), error: null };
    case "refuse":
      return { ...state, error: action.message };
    case "sent":
      return { ...state, text: "", references: [], error: null };
    case "capabilities": {
      const { capabilities } = action;
      const model = capabilities.models.some((m) => m.id === state.model) ? state.model : (capabilities.models[0]?.id ?? "");
      const ratio = capabilities.ratios.some((r) => r.id === state.ratio) ? state.ratio : capabilities.defaultRatio;
      const editRatio = capabilities.ratios.some((r) => r.id === state.editRatio) ? state.editRatio : MATCH_REFERENCE;
      // An add-on the server no longer offers falls back to none (STORY_019).
      const lora = capabilities.loras.some((l) => l.id === state.lora) ? state.lora : NO_LORA;
      return { ...state, model, ratio, editRatio, lora };
    }
  }
}

/** An edit's default: keep the reference's shape (STORY_017). Never sent to the server; no ratio is sent instead. */
export const MATCH_REFERENCE = "match";

/** No add-on (STORY_019): never sent to the server; the request just has no `lora`. */
export const NO_LORA = "none";

/** The ratio the composer's dropdown is showing: the edit ratio while references are attached (STORY_017). */
export function activeRatio(state: ComposerState): string {
  return state.references.length > 0 ? state.editRatio : state.ratio;
}

export function canSend(state: ComposerState): boolean {
  return state.text.trim() !== "";
}

/** The narrow layout shortens the model's label ("Qwen-Image 2.1" → "Model 2.1"), as the reference does. */
export function shortModelLabel(label: string): string {
  return label.replace(/^Qwen-Image\s+/, "Model ");
}

export const STORAGE_KEY = "qwen.composer.v1";

/** What survives a reload within the session: the mode and the options, never the text. */
export function serialize(state: ComposerState): string {
  return JSON.stringify({ mode: state.mode, model: state.model, ratio: state.ratio, editRatio: state.editRatio, lora: state.lora });
}

export function restore(raw: string | null, base: ComposerState): ComposerState {
  if (raw === null) return base;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isRecord(v)) return base;
  const mode = v["mode"] === "image" || v["mode"] === "chat" ? v["mode"] : base.mode;
  const model = typeof v["model"] === "string" ? v["model"] : base.model;
  const ratio = typeof v["ratio"] === "string" ? v["ratio"] : base.ratio;
  const editRatio = typeof v["editRatio"] === "string" ? v["editRatio"] : base.editRatio;
  const lora = typeof v["lora"] === "string" ? v["lora"] : base.lora;
  return { ...base, mode, model, ratio, editRatio, lora };
}
