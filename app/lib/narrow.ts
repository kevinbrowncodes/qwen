/**
 * Narrow layout (STORY_009): the reference switches to its phone layout by putting `mobile` on <html>, and its
 * stylesheets key the phone rules off `html.mobile`. Ours does the same from the viewport width, before first paint
 * (BOOT_SCRIPT in the layout) and on every resize (useNarrow).
 */
export const NARROW_QUERY = "(max-width: 768px)";

/**
 * The reference sizes its phone layout in rem and sets the root font size from the viewport: 16.768px at 393 wide
 * (docs/recon/2026-09-26/capture-notes.md, Phase 7) is exactly 393 / 375 × 16.
 */
export function narrowRootFontSize(viewportWidth: number): string {
  return `${String(Math.round((viewportWidth / 375) * 16 * 1000) / 1000)}px`;
}

/** Runs in <head> before hydration, so the first paint is already the right layout. */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia(${JSON.stringify(NARROW_QUERY)}).matches;d.classList.toggle("mobile",m);d.style.fontSize=m?(Math.round(window.innerWidth/375*16*1000)/1000)+"px":"";}catch(e){}})();`;

type Root = { classList: { toggle(name: string, force: boolean): unknown }; style: { fontSize: string } };

export function applyNarrowClass(root: Root, narrow: boolean, viewportWidth = 375): void {
  root.classList.toggle("mobile", narrow);
  root.style.fontSize = narrow ? narrowRootFontSize(viewportWidth) : "";
}
