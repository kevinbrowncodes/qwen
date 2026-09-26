/**
 * Small helpers over parse5's default tree, shared by the snapshot cleaner
 * (STORY_002) and the harvester (STORY_003). HTML is never handled with
 * regular expressions: a saved page is 1.5 MB of minified markup, and a regex
 * that misses one nesting case leaks what it was meant to remove.
 */
import type { DefaultTreeAdapterTypes } from "parse5";

export type Node = DefaultTreeAdapterTypes.Node;
export type Element = DefaultTreeAdapterTypes.Element;
export type ParentNode = DefaultTreeAdapterTypes.ParentNode;
export type ChildNode = DefaultTreeAdapterTypes.ChildNode;
export type TextNode = DefaultTreeAdapterTypes.TextNode;

export function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function childrenOf(node: Node): ChildNode[] {
  const own = "childNodes" in node ? node.childNodes : [];
  // A <template>'s children live in its content fragment.
  if (isElement(node) && node.tagName === "template" && "content" in node) {
    return [...own, ...node.content.childNodes];
  }
  return own;
}

/** Every element under `root`, depth-first in document order. */
export function elements(root: Node): Element[] {
  const out: Element[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (isElement(node) && node !== root) out.push(node);
    const kids = childrenOf(node);
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = kids[i];
      if (kid !== undefined) stack.push(kid);
    }
  }
  return out;
}

export function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function setAttr(el: Element, name: string, value: string): void {
  const existing = el.attrs.find((a) => a.name === name);
  if (existing) existing.value = value;
  else el.attrs.push({ name, value });
}

export function hasClass(el: Element, className: string): boolean {
  return (getAttr(el, "class") ?? "").split(/\s+/).includes(className);
}

export function textContent(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  return childrenOf(node).map(textContent).join("");
}

/** Replaces every child of `el` with a single text node. */
export function setText(el: Element, value: string): void {
  const text: TextNode = { nodeName: "#text", value, parentNode: el };
  el.childNodes = [text];
}

export function removeNode(node: ChildNode): void {
  const parent = node.parentNode;
  if (!parent) return;
  parent.childNodes = parent.childNodes.filter((c) => c !== node);
  node.parentNode = null;
}
