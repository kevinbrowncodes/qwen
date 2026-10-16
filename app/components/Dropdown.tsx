"use client";
/**
 * The reference's dropdown (STORY_010), in its own markup: `.qwen-chat-v2-dropdown-menu` with a
 * `.qwen-chat-v2-dropdown-menu-select` trigger and a `.qwen-chat-v2-dropdown-menu-popup` of items, the selected one
 * with `-item-selected` and its check. Behaviour is ours: click or Enter/Space opens, arrows move, Enter picks,
 * Escape or an outside click closes, and focus returns to the trigger.
 *
 * An item may carry a `detail` (STORY_030, ours: the LoRA info card). Its row then has an info button, and the popup
 * shows the detail in place of the list, with a back control and a button that picks the item. ArrowRight opens the
 * active item's detail and ArrowLeft returns, so the keyboard never leaves the trigger.
 */
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { currentZoom } from "@/lib/ui-zoom";
import { clampLeft, Popup, type Anchor } from "./Popup";

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  /** The body of this item's info card (STORY_030); without it the row has no info button. */
  readonly detail?: ReactNode;
}

/** The info card's controls (STORY_030): their icons and the pick button's two wordings. */
export interface DetailOptions {
  readonly infoIcon: string;
  readonly backIcon: string;
  readonly pickLabel: string;
  readonly selectedLabel: string;
}

const DETAIL_HINT = "Press right arrow for details";

export interface DropdownProps {
  readonly label: string;
  readonly display: ReactNode;
  readonly items: readonly DropdownItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  /** "top" opens above the trigger (the pinned phone composer). */
  readonly placement?: "bottom" | "top";
  readonly className?: string;
  /** Required for items with a `detail` to show their info button (STORY_030). */
  readonly detailOptions?: DetailOptions;
}

export function Dropdown({ label, display, items, selected, onSelect, placement = "bottom", className, detailOptions }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** The item whose info card is showing in place of the list, or null for the list (STORY_030). */
  const [detailId, setDetailId] = useState<string | null>(null);
  const hintId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  /** How far the open popup is pulled left so it stays on screen (STORY_019); measured when the list mounts. */
  const [shift, setShift] = useState(0);
  const listRef = useCallback((el: HTMLDivElement | null) => {
    popup.current = el;
    // The shift is reset when the dropdown opens, not here: when the list gives way to an info card (STORY_030) the
    // card is measured against the shift the list was drawn with.
    if (!el) return;
    // Measured pixels are the zoom times the CSS pixels `left` is set in (STORY_020): clamp in the first, shift in the second.
    const box = el.getBoundingClientRect();
    const zoom = currentZoom();
    setShift((current) => {
      const natural = box.left + current * zoom;
      return (natural - clampLeft(natural, box.width, window.innerWidth, 8 * zoom)) / zoom;
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
    setDetailId(null);
    setShift(0);
    setOpen(true);
  };
  const close = (): void => {
    setOpen(false);
    setDetailId(null);
    trigger.current?.focus();
  };
  const hasDetail = (item: DropdownItem | undefined): boolean => detailOptions !== undefined && item?.detail !== undefined;
  const showDetail = (index: number): void => {
    const item = items[index];
    if (!item || !hasDetail(item)) return;
    setActive(index);
    setDetailId(item.id);
    trigger.current?.focus();
  };
  const backToList = (): void => {
    setDetailId(null);
    trigger.current?.focus();
  };
  const detailItem = detailId === null ? undefined : items.find((i) => i.id === detailId);
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
    } else if (detailItem) {
      // The info card: back with ArrowLeft, pick with Enter or Space; Tab closes as it does for the list.
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        backToList();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(detailItem.id);
      } else if (e.key === "Tab") {
        setOpen(false);
        setDetailId(null);
      }
    } else if (e.key === "ArrowRight") {
      if (hasDetail(items[active])) {
        e.preventDefault();
        showDetail(active);
      }
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
          aria-controls={open && !detailItem ? listId : undefined}
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
      {open && detailItem && detailOptions ? (
        <Popup anchorRef={trigger} placement={placement}>
          {(anchor) => (
            <DetailCard
              ref={listRef}
              label={detailItem.label}
              anchor={anchor}
              shift={shift}
              options={detailOptions}
              isSelected={detailItem.id === selected}
              onBack={backToList}
              onPick={() => {
                pick(detailItem.id);
              }}
            >
              {detailItem.detail}
            </DetailCard>
          )}
        </Popup>
      ) : open ? (
        <Popup anchorRef={trigger} placement={placement}>
          {(anchor) => (
        <div ref={listRef} id={listId} role="listbox" aria-label={label} style={{ position: "fixed", left: anchor.left - shift, top: anchor.top }} className={`qwen-chat-v2-dropdown-menu-popup qwen-chat-v2-dropdown-menu-popup-${anchor.placement}-left`}>
          {items.map((item, i) => {
            const isSelected = item.id === selected;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                aria-describedby={hasDetail(item) ? hintId : undefined}
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
                {/* Hidden from assistive technology: the option is the unit, and ArrowRight reaches the card (STORY_030). */}
                {hasDetail(item) && detailOptions ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="clone-icon-button clone-dropdown-item-info"
                    onClick={(e) => {
                      e.stopPropagation();
                      showDetail(i);
                    }}
                  >
                    <Icon id={detailOptions.infoIcon} />
                  </button>
                ) : null}
                {isSelected ? <span className="qwen-chat-v2-dropdown-menu-item-check" aria-hidden="true" /> : null}
              </div>
            );
          })}
          {/* Outside the options, so each option's text stays its label alone. */}
          <span id={hintId} hidden>
            {DETAIL_HINT}
          </span>
        </div>
          )}
        </Popup>
      ) : null}
    </div>
  );
}

interface DetailCardProps {
  readonly label: string;
  readonly anchor: Anchor;
  readonly shift: number;
  readonly options: DetailOptions;
  readonly isSelected: boolean;
  readonly onBack: () => void;
  readonly onPick: () => void;
  readonly children: ReactNode;
}

/** The space the card may take, in CSS pixels: from its anchor to the window's far edge, less an 8px margin. */
function availableHeight(anchor: Anchor): number {
  const viewport = window.innerHeight / currentZoom();
  return Math.max(160, (anchor.placement === "top" ? anchor.top : viewport - anchor.top) - 8);
}

/**
 * An item's info card (STORY_030), drawn on the popup's own surface where the list was. The header and the pick button
 * stay put while the body scrolls, so a card taller than the space never pushes them off screen. Buttons keep the
 * focus on the trigger (mousedown is not allowed to move it), as the list's options do.
 */
const DetailCard = forwardRef<HTMLDivElement, DetailCardProps>(function DetailCard({ label, anchor, shift, options, isSelected, onBack, onPick, children }, ref) {
  const keepFocus = (e: ReactMouseEvent): void => {
    e.preventDefault();
  };
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`About ${label}`}
      style={{ position: "fixed", left: anchor.left - shift, top: anchor.top, maxHeight: availableHeight(anchor) }}
      className={`qwen-chat-v2-dropdown-menu-popup qwen-chat-v2-dropdown-menu-popup-${anchor.placement}-left clone-dropdown-detail`}
    >
      <div className="clone-dropdown-detail-head">
        <button type="button" className="clone-icon-button clone-dropdown-detail-back" aria-label="Back to the list" onMouseDown={keepFocus} onClick={onBack}>
          <Icon id={options.backIcon} />
        </button>
        <span className="clone-dropdown-detail-title">{label}</span>
      </div>
      <div className="clone-dropdown-detail-body">{children}</div>
      <div className="clone-dropdown-detail-foot">
        <button type="button" className="clone-dropdown-detail-pick" disabled={isSelected} onMouseDown={keepFocus} onClick={onPick}>
          {isSelected ? options.selectedLabel : options.pickLabel}
        </button>
      </div>
    </div>
  );
});
