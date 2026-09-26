/**
 * Cleans the owner's "Save Page As" copy of the reference into a snapshot
 * that can be committed (STORY_002).
 *
 * Removes every script and script hook, masks the owner's display name and
 * avatar, and relinks the saved page's local files to the harvested assets
 * STORY_003 writes beside it. The inline <style> elements and the icon
 * sprites stay, so the snapshot renders its icons on its own.
 */
import { parse, serialize } from "parse5";
import type { Identity } from "./identity-guard.ts";
import { type Element, type Node, elements, getAttr, hasClass, isElement, removeNode, setAttr, setText, textContent } from "./html-tree.ts";

/** What the masked display name reads as in every committed file. */
export const MASKED_NAME = "Owner";

/** A neutral grey disc, standing in for the owner's avatar. */
export const PLACEHOLDER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23555'/%3E%3C/svg%3E";

/** Stands in for an image generated on the reference (CLAUDE.md §3e: those never enter git). */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%233e474e'/%3E%3C/svg%3E";

/** Where the reference serves generated images; its paths carry the account's ids. */
export const GENERATED_MEDIA = /https?:\/\/cdn\.qwenlm\.ai\/output\/[^"'()\s]+/g;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The saved page's sidecar folder, as Chrome names it for a page titled "Qwen". */
export const SAVED_FILES_PREFIX = "./Qwen_files/";

export type SnapshotOptions = {
  /** Where the harvested stylesheets sit, relative to the snapshot. */
  cssBase: string;
  /** Where the harvested brand images sit, relative to the snapshot. */
  brandBase: string;
};

export const DEFAULT_SNAPSHOT_OPTIONS: SnapshotOptions = { cssBase: "../assets/css/", brandBase: "../assets/brand/" };

export type CleanedSnapshot = {
  html: string;
  /** The identity found on the page, for the guard. Never printed. */
  identity: Identity;
  /** Local references that point at nothing once committed, in document order. */
  deadLinks: string[];
  removedScripts: number;
};

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

const LOGO_FILE = /^qwen-logo[\w-]*\.svg$/;

/** Reads the display name and avatar from the sidebar user button. Throws if either is missing. */
export function readIdentity(root: Node): Identity {
  const all = elements(root);
  const button = all.find((el) => el.tagName === "button" && hasClass(el, "user-menu-btn"));
  if (!button) throw new SnapshotError("snapshot: no button.user-menu-btn on the page; cannot find the identity to mask. Stopping.");
  const inButton = elements(button);
  const nameEl = inButton.find((el) => hasClass(el, "user-menu-btn-text"));
  const avatarEl = all.find((el) => el.tagName === "img" && hasClass(el, "user-img"));
  const displayName = nameEl ? textContent(nameEl).trim() : "";
  const avatarSrc = avatarEl ? (getAttr(avatarEl, "src") ?? "") : "";
  if (displayName === "") throw new SnapshotError("snapshot: the user button has no .user-menu-btn-text; cannot find the name to mask. Stopping.");
  if (avatarSrc === "") throw new SnapshotError("snapshot: no img.user-img with a src; cannot find the avatar to mask. Stopping.");
  return { displayName, avatarSrc };
}

/** Markup the capture extension (Claude in Chrome) adds to a page it drives (BUG_001). */
export function isCaptureToolMarkup(el: Element): boolean {
  if ((getAttr(el, "id") ?? "").startsWith("claude-agent")) return true;
  return (getAttr(el, "class") ?? "").split(/\s+/).some((c) => c.startsWith("claude-agent"));
}

function isScriptLink(el: Element): boolean {
  if (el.tagName !== "link") return false;
  const rel = (getAttr(el, "rel") ?? "").toLowerCase();
  return rel === "modulepreload" || (rel === "preload" && getAttr(el, "as") === "script");
}

function relink(value: string, options: SnapshotOptions, deadLinks: string[]): string {
  if (!value.startsWith(SAVED_FILES_PREFIX)) return value;
  const file = value.slice(SAVED_FILES_PREFIX.length).split(/[?#]/)[0] ?? "";
  if (file.endsWith(".css")) return options.cssBase + file;
  if (LOGO_FILE.test(file)) return options.brandBase + file;
  deadLinks.push(value);
  return value;
}

export function cleanSnapshot(savedHtml: string, options: SnapshotOptions = DEFAULT_SNAPSHOT_OPTIONS): CleanedSnapshot {
  const doc = parse(savedHtml);
  const identity = readIdentity(doc);
  const deadLinks: string[] = [];
  let removedScripts = 0;

  for (const el of elements(doc)) {
    if (isCaptureToolMarkup(el)) {
      removeNode(el);
      continue;
    }
    if (el.tagName === "script" || el.tagName === "iframe" || isScriptLink(el)) {
      removeNode(el);
      removedScripts += el.tagName === "script" ? 1 : 0;
      continue;
    }
    el.attrs = el.attrs.filter((a) => !a.name.toLowerCase().startsWith("on"));
    for (const attr of el.attrs) {
      if (/^\s*javascript:/i.test(attr.value)) attr.value = "#";
      // Library tiles and thumbnails: the generated image's URL, and the item ids beside it.
      attr.value = attr.value.replace(GENERATED_MEDIA, PLACEHOLDER_IMAGE).replace(UUID, ":id");
      if (attr.name === "href" || attr.name === "src") attr.value = relink(attr.value, options, deadLinks);
    }
    if (el.tagName === "img" && hasClass(el, "user-img")) setAttr(el, "src", PLACEHOLDER_AVATAR);
    if (hasClass(el, "user-menu-btn-text")) setText(el, MASKED_NAME);
  }

  // The name may also sit in a tooltip, a title or a chat heading: mask it everywhere.
  maskEverywhere(doc, identity.displayName);

  return { html: serialize(doc), identity, deadLinks, removedScripts };
}

function maskEverywhere(root: Node, name: string): void {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node.nodeName === "#text" && "value" in node) node.value = node.value.replaceAll(name, MASKED_NAME);
    if (isElement(node)) {
      for (const attr of node.attrs) attr.value = attr.value.replaceAll(name, MASKED_NAME);
    }
    if ("childNodes" in node) stack.push(...node.childNodes);
  }
}
