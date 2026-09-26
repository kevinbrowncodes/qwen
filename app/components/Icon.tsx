/**
 * A reference icon (STORY_009): the reference's own markup, `span.anticon > svg > use`, pointing at the harvested
 * sprite served from /reference/sprite.svg (recon/src/reference-sync.ts). Decorative; the control around it is named.
 */
export function Icon({ id, className }: { readonly id: string; readonly className?: string }) {
  return (
    <span role="img" aria-hidden="true" className={className === undefined ? "anticon" : `anticon ${className}`}>
      <svg width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
        <use href={`/reference/sprite.svg#${id}`} />
      </svg>
    </span>
  );
}
