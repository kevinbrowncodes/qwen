/**
 * The reference's full-window drop overlay (STORY_018), in the markup its lifted rules style: `.dropzone-overlay`
 * and its content, wrapper and inner. The inner text and icon are ours (the capture has only the CSS; a departure in
 * the story). Decorative: `pointer-events: none`, so the drop lands on the page beneath it. Portalled to the body:
 * the reference's `#dropzone-container` carries a transform, which would otherwise shrink `position: fixed` to it.
 */
import { createPortal } from "react-dom";
import { MAX_REFERENCE_BYTES, MAX_REFERENCES } from "@/lib/upload-validation";
import { Icon } from "../Icon";

const HINT = `PNG, JPEG or WebP · up to ${String(MAX_REFERENCES)} images, ${String(MAX_REFERENCE_BYTES / 1024 / 1024)} MB each`;

export function DropOverlay() {
  return createPortal(
    <div className="dropzone-overlay" data-testid="drop-overlay" aria-hidden="true">
      <div className="dropzone-overlay-content">
        <div className="dropzone-overlay-content-wrapper">
          <div className="dropzone-overlay-inner clone-drop-inner">
            <Icon id="qwpcicon-aiPicture" className="clone-drop-icon" />
            <div className="clone-drop-title">Drop images here to edit</div>
            <div className="clone-drop-hint">{HINT}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
