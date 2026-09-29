"use client";
/**
 * The composer's `+` (Select Mode) and its menu (STORY_010), in the reference's markup. Only the MVP's two items:
 * Upload attachment (STORY_011) and Create Image.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Popup } from "../Popup";

export function ModeMenu({ iconSet, placement, onCreateImage, onUpload }: { readonly iconSet: "qwpcicon" | "appicon"; readonly placement: "bottom" | "top"; readonly onCreateImage: () => void; readonly onUpload: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!(e.target instanceof Node)) return;
      if (root.current?.contains(e.target) || popup.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  return (
    <div className="qwen-chat-v2-dropdown-menu mode-select-dropdown clone-dropdown" ref={root}>
      <div className="qwen-chat-v2-dropdown-menu-trigger">
        <div
          ref={trigger}
          className="mode-select-open"
          role="button"
          tabIndex={0}
          aria-label="Select Mode"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          <Icon id={iconSet === "appicon" ? "appicon-add" : "qwpcicon-addBold"} className="mode-select-open-icon" />
        </div>
      </div>
      {open ? (
        <Popup anchorRef={trigger} placement={placement}>
          {(anchor) => (
        <div ref={popup} role="menu" aria-label="Select Mode" style={{ position: "fixed", left: anchor.left, top: anchor.top }} className={`qwen-chat-v2-dropdown-menu-popup qwen-chat-v2-dropdown-menu-popup-${anchor.placement}-left clone-mode-menu`}>
          <div className="mode-select-dropdown-menu">
            <div role="menuitem" tabIndex={0} className="qwen-chat-v2-dropdown-menu-item mode-select-common-item" onClick={choose(onUpload)} onKeyDown={(e) => { if (e.key === "Enter") choose(onUpload)(); }}>
              <Icon id={`${iconSet}-upload`} className="qwen-chat-v2-dropdown-menu-item-icon" />
              <span className="qwen-chat-v2-dropdown-menu-item-label">
                Upload attachment
                <span className="clone-item-desc">image</span>
              </span>
            </div>
            <div role="menuitem" tabIndex={0} className="qwen-chat-v2-dropdown-menu-item mode-select-common-item" onClick={choose(onCreateImage)} onKeyDown={(e) => { if (e.key === "Enter") choose(onCreateImage)(); }}>
              <Icon id={`${iconSet}-aiPicture`} className="qwen-chat-v2-dropdown-menu-item-icon" />
              <span className="qwen-chat-v2-dropdown-menu-item-label">Create Image</span>
            </div>
          </div>
        </div>
          )}
        </Popup>
      ) : null}
    </div>
  );
}
