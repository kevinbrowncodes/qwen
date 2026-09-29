/**
 * Narrow layout (STORY_009): the reference switches to its phone layout by putting `mobile` on <html>, and its
 * stylesheets key the phone rules off `html.mobile`. Ours does the same from the viewport width, before first paint
 * (BOOT_SCRIPT in the layout) and on every resize (useNarrow). The width is the effective one, the window's divided
 * by the interface zoom (STORY_020): media queries ignore CSS zoom, so this no longer asks matchMedia.
 */
import { ZOOM_KEY, ZOOM_STEPS } from "./ui-zoom";

export const NARROW_MAX_WIDTH = 768;

/** Pure: the phone layout at an effective width of 768px or less (the reference's breakpoint). */
export function isNarrow(viewportWidth: number, zoom = 1): boolean {
  return viewportWidth / zoom <= NARROW_MAX_WIDTH;
}

/**
 * The reference sizes its phone layout in rem and sets the root font size from the viewport: 16.768px at 393 wide
 * (docs/recon/2026-09-26/capture-notes.md, Phase 7) is exactly 393 / 375 × 16.
 */
export function narrowRootFontSize(viewportWidth: number): string {
  return `${String(Math.round((viewportWidth / 375) * 16 * 1000) / 1000)}px`;
}

/** Runs in <head> before hydration: applies the stored zoom (STORY_020), then the layout for the effective width. */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement,z=1;try{var v=Number(window.localStorage.getItem(${JSON.stringify(ZOOM_KEY)}));if(${JSON.stringify(ZOOM_STEPS)}.indexOf(v)>0){z=v;d.style.zoom=String(v);d.style.setProperty("--ui-zoom",String(v));d.dataset.zoom=String(v);}}catch(e){}try{var w=window.innerWidth/z,m=w<=${String(NARROW_MAX_WIDTH)};d.classList.toggle("mobile",m);d.style.fontSize=m?(Math.round(w/375*16*1000)/1000)+"px":"";}catch(e){}})();`;

type Root = { classList: { toggle(name: string, force: boolean): unknown }; style: { fontSize: string } };

export function applyNarrowClass(root: Root, narrow: boolean, viewportWidth = 375): void {
  root.classList.toggle("mobile", narrow);
  root.style.fontSize = narrow ? narrowRootFontSize(viewportWidth) : "";
}
