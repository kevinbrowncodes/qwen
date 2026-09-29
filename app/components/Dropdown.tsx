"use client";
/**
 * The reference's dropdown (STORY_010), in its own markup: `.qwen-chat-v2-dropdown-menu` with a
 * `.qwen-chat-v2-dropdown-menu-select` trigger and a `.qwen-chat-v2-dropdown-menu-popup` of items, the selected one
 * with `-item-selected` and its check. Behaviour is ours: click or Enter/Space opens, arrows move, Enter picks,
 * Escape or an outside click closes, and focus returns to the trigger.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { clampLeft, Popup } from "./Popup";

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export interface DropdownProps {
  readonly label: string;
  readonly display: ReactNode;
  readonly items: readonly DropdownItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  /** "top" opens above the trigger (the pinned phone composer). */
  readonly placement?: "bottom" | "top";
  readonly className?: string;
}

export function Dropdown({ label, display, items, selected, onSelect, placement = "bottom", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  /** How far the open popup is pulled left so it stays on screen (STORY_019); measured when the list mounts. */
  const [shift, setShift] = useState(0);
  const listRef = useCallback((el: HTMLDivElement | null) => {
    popup.current = el;
    if (!el) {
      setShift(0);
      return;
    }
    const box = el.getBoundingClientRect();
    setShift((current) => {
      const natural = box.left + current;
      return natural - clampLeft(natural, box.width, window.innerWidth);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!(e.target instanceof Node)) return;
      if (root.current?.contains(e.target) || popup.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const openAt = (): void => {
    setActive(Math.max(0, items.findIndex((i) => i.id === selected)));
    setOpen(true);
  };
  const close = (): void => {
    setOpen(false);
    trigger.current?.focus();
  };
  const pick = (id: string): void => {
    onSelect(id);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openAt();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[active];
      if (item) pick(item.id);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`qwen-chat-v2-dropdown-menu clone-dropdown${className ? ` ${className}` : ""}`} ref={root}>
      <div className="qwen-chat-v2-dropdown-menu-trigger">
        <div
          ref={trigger}
          role="combobox"
          tabIndex={0}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={`qwen-chat-v2-dropdown-menu-select qwen-chat-v2-dropdown-menu-select-size-m${open ? " qwen-chat-v2-dropdown-menu-select-open" : ""}`}
          onClick={() => {
            if (open) setOpen(false);
            else openAt();
          }}
          onKeyDown={onKeyDown}
        >
          {display}
          <span className="qwen-chat-v2-dropdown-menu-select-arrow" />
        </div>
      </div>
      {open ? (
        <Popup anchorRef={trigger} placement={placement}>
          {(anchor) => (
        <div ref={listRef} id={listId} role="listbox" aria-label={label} style={{ position: "fixed", left: anchor.left - shift, top: anchor.top }} className={`qwen-chat-v2-dropdown-menu-popup qwen-chat-v2-dropdown-menu-popup-${placement === "top" ? "top" : "bottom"}-left`}>
          {items.map((item, i) => {
            const isSelected = item.id === selected;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                data-active={i === active}
                className={`qwen-chat-v2-dropdown-menu-item${isSelected ? " qwen-chat-v2-dropdown-menu-item-selected" : ""}${i === active ? " clone-item-active" : ""}`}
                onMouseEnter={() => {
                  setActive(i);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  pick(item.id);
                }}
              >
                {item.icon ? <Icon id={item.icon} className="qwen-chat-v2-dropdown-menu-item-icon" /> : null}
                <span className="qwen-chat-v2-dropdown-menu-item-label">{item.label}</span>
                {isSelected ? <span className="qwen-chat-v2-dropdown-menu-item-check" aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
          )}
        </Popup>
      ) : null}
    </div>
  );
}
