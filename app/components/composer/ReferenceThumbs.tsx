"use client";
/**
 * The attached reference images (STORY_011), in the reference's markup: `.message-input-column-file > .file-card-list`
 * of 56×56 `.vision-item-container` thumbnails, each with an always-visible `button.close-button` ("Remove file").
 * Each thumbnail shows a local object URL, revoked when it is removed or unmounted.
 */
import { useEffect, useRef } from "react";
import type { ReferenceItem } from "@/lib/composer-state";
import { Icon } from "../Icon";

function Thumb({ file, onRemove }: { readonly file: File; readonly onRemove: () => void }) {
  // The URL is made and revoked in the same effect and written straight to the image, so StrictMode's second mount
  // gets a fresh URL rather than one its first cleanup revoked.
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    if (image.current) image.current.src = u;
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [file]);
  return (
    <div className="vision-item-container" data-testid="reference-thumb">
      <div className="media">
        <div className="vision-item-content">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an asset next/image can optimise */}
          <img ref={image} className="vision-item-image" alt={file.name} />
        </div>
      </div>
      <button type="button" className="close-button" aria-label="Remove file" onClick={onRemove}>
        <Icon id="qwpcicon-close2" className="icon-close" />
      </button>
    </div>
  );
}

export function ReferenceThumbs({ items, onRemove }: { readonly items: readonly ReferenceItem[]; readonly onRemove: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="message-input-column-file">
      <div className="file-card-list">
        {items.map((item) => (
          <Thumb
            key={item.key}
            file={item.file}
            onRemove={() => {
              onRemove(item.key);
            }}
          />
        ))}
      </div>
    </div>
  );
}
