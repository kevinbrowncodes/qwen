"use client";
/**
 * Settings (STORY_020): a dialog with one setting so far, the interface zoom. The reference has no settings screen
 * in the capture, so this surface is ours (the story's Departures). A step applies at once; Esc, ✕ or a click on the
 * backdrop closes, and focus goes back to what opened it.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { readZoom, writeZoom, ZOOM_STEPS, zoomLabel, type Zoom } from "@/lib/ui-zoom";
import { Icon } from "../Icon";

export function SettingsDialog({ onClose, returnFocus }: { readonly onClose: () => void; readonly returnFocus?: RefObject<HTMLElement | null> }) {
  const [zoom, setZoom] = useState<Zoom>(() => readZoom());
  const radios = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    radios.current[ZOOM_STEPS.indexOf(zoom)]?.focus();
    const target = returnFocus?.current;
    return () => {
      target?.focus();
    };
    // Focus the chosen step once, on open; later choices move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const choose = (z: Zoom): void => {
    setZoom(z);
    writeZoom(z);
  };
  const onArrow = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = (ZOOM_STEPS.indexOf(zoom) + step + ZOOM_STEPS.length) % ZOOM_STEPS.length;
    const next = ZOOM_STEPS[i] ?? 1;
    choose(next);
    radios.current[i]?.focus();
  };

  return createPortal(
    <div className="clone-modal-mask" data-testid="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="clone-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="clone-modal-header">
          <h2 id="settings-title" className="clone-modal-title">Settings</h2>
          <button type="button" className="clone-icon-button clone-modal-close" aria-label="Close settings" onClick={onClose}>
            <Icon id="qwpcicon-close" />
          </button>
        </div>
        <div className="clone-setting">
          <div className="clone-setting-name" id="zoom-label">Zoom</div>
          <div className="clone-setting-hint" id="zoom-hint">Makes the whole interface bigger on this browser.</div>
          <div className="clone-segmented" role="radiogroup" aria-labelledby="zoom-label" aria-describedby="zoom-hint" onKeyDown={onArrow}>
            {ZOOM_STEPS.map((z, i) => (
              <button
                key={z}
                ref={(el) => {
                  radios.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={z === zoom}
                tabIndex={z === zoom ? 0 : -1}
                className={`clone-segmented-item${z === zoom ? " clone-segmented-item-on" : ""}`}
                onClick={() => {
                  choose(z);
                }}
              >
                {zoomLabel(z)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
