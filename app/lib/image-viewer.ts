/**
 * The image viewer's rules (STORY_038): which images a chat offers it, in the order they appear, and how it steps
 * through them. An image joins the viewer by carrying `data-viewer` (only a finished image does: a running job's
 * skeleton, a failed or moderated turn and a missing reference draw no such image), with its name and its download.
 */

export interface ViewerImage {
  /** What the `<img>` shows: the result's URL, or a reference's object URL. */
  readonly src: string;
  /** The file name: the result's download name, or the attached file's. */
  readonly name: string;
  /** What Download saves: a result through `?download=1`, a reference its own object URL. */
  readonly download: string;
}

/** The attribute that marks an image the viewer opens. */
export const VIEWER_ATTR = "data-viewer";

/** Pure: the index one step from `index`, held inside the list (the viewer does not wrap). */
export function stepIndex(index: number, delta: number, count: number): number {
  return Math.min(Math.max(index + delta, 0), Math.max(count - 1, 0));
}

/** Pure: the counter under the image, "2 of 3". */
export function counterLabel(index: number, count: number): string {
  return `${String(index + 1)} of ${String(count)}`;
}

/** Pure: the step a horizontal swipe asks for: a swipe to the left shows the next image; a short one is a tap. */
export function swipeStep(dx: number, threshold = 40): -1 | 0 | 1 {
  if (dx <= -threshold) return 1;
  if (dx >= threshold) return -1;
  return 0;
}

/** The viewer's entry for a marked image, or null for one without a source yet. */
export function viewerImageOf(el: Element): ViewerImage | null {
  const src = el.getAttribute("src") ?? "";
  if (src === "") return null;
  return { src, name: el.getAttribute("data-viewer-name") ?? el.getAttribute("alt") ?? "", download: el.getAttribute("data-viewer-download") ?? src };
}

/**
 * The images under `container`, in document order, and the index of `clicked` among them; null when `clicked` is not
 * one of them. The chat's own rendering is the list: no request and no second copy of the turns.
 */
export function collectImages(container: Element, clicked: Element): { readonly images: readonly ViewerImage[]; readonly index: number } | null {
  const marked = Array.from(container.querySelectorAll(`img[${VIEWER_ATTR}]`));
  const images: ViewerImage[] = [];
  let index = -1;
  for (const el of marked) {
    const image = viewerImageOf(el);
    if (!image) continue;
    if (el === clicked) index = images.length;
    images.push(image);
  }
  return index < 0 ? null : { images, index };
}
