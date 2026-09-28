# BUG_009 — The app has no icon when it is added to the Dock or saved as an app

**Status:** Resolved (2026-09-28)
**Found by:** the owner, 2026-09-28 (Safari → Add to Dock showed a plain "Q" tile)

## Summary

The app declares no icon of any kind: no favicon, no `apple-touch-icon` and no web app manifest. Safari's "Add to Dock", a home-screen bookmark and the browser tab all fall back to a generated letter tile. The reference uses its own favicon, a file on Alibaba's CDN that the harvest did not fetch (it makes no network requests). The owner's saved page does include the Qwen logo (`qwen-logo-dark.svg`, harvested in STORY_003 and CHORE_003), whose left part is the Qwen mark.

## Steps to Reproduce

1. Open http://192.168.1.28:3100 in Safari.
2. File → Add to Dock.
3. The icon is a letter "Q", not the Qwen mark.

## Expected vs Actual Behaviour

- **Expected:** the Qwen mark as the tab icon, the Dock icon and the saved-app icon, named "Qwen Local".
- **Actual:** a generated letter tile.

## Root Cause

STORY_005's layout set a title and description but no icons, and no later story added any.

## Acceptance Criteria

- [x] `recon/src/app-icons.ts` (`pnpm reference:icons`) builds the icons from the harvested logo, with no network request. It keeps the logo's mark (every path left of the "Qwen" lettering, found by measuring the paths' boxes in the browser), in white, centred on a `#171717` square with a margin. It writes:
  - `app/app/icon.svg`, the favicon;
  - `app/app/apple-icon.png`, 180×180, which Safari's Add to Dock and iOS use;
  - `app/public/icons/icon-192.png` and `icon-512.png`, for the manifest.
- [x] `app/app/manifest.ts` serves a web app manifest: name "Qwen Local", `display: standalone`, background and theme `#171717`, and the two icons.
- [x] The built page links the favicon, the apple touch icon and the manifest (Next.js metadata files).

## Testing

- **Unit:** `recon/src/app-icons.test.ts` checks the pure part: choosing the mark's paths from measured boxes, and building the icon SVG around them (the viewBox is square, the background is `#171717`, and no lettering path is included). A check that the committed PNGs exist with the right pixel sizes (read from their PNG headers).
- **Integration:** N/A. There are no routes beyond the ones Next.js generates from the metadata files, and the e2e covers those.
- **E2E:** `app/e2e/icons.spec.ts`:
  - the home's head has `link[rel=icon]` and `link[rel=apple-touch-icon]` and a manifest link;
  - each answers 200 with an image type;
  - the manifest's JSON has the name "Qwen Local" and the 192 and 512 icons.
- **Manual:** the owner adds the app to the Dock again and sees the Qwen mark.

## Resolution

- **The icon:** `pnpm reference:icons` measured the logo's 7 paths in the browser and kept the 3 left of the widest gap (the mark). It wrote `app/app/icon.svg`, `app/app/apple-icon.png` (180), and `app/public/icons/icon-192.png` and `icon-512.png`: the white Qwen mark on `#171717`.
- **The wiring:** Next.js links the favicon and the apple touch icon from those files, and `app/app/manifest.ts` serves the manifest.
- **Tests:** unit `recon/src/app-icons.test.ts`; e2e `icons.spec.ts`. Gate green.
- **An icon Safari has already cached is kept:** re-adding the app to the Dock after the deploy picks up the new icon, but an existing Dock entry must be removed and added again.
