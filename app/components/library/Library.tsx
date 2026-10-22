"use client";
/**
 * My Library at /library (STORY_013): every finished image in a masonry grid of 276px cards (2 columns of 180px on the
 * phone), each opening its chat at that image (STORY_031), with a Download bar that shows on hover (always on touch). Readings:
 * docs/recon/2026-09-26/states/my-library@1437.json and @393.json.
 *
 * STORY_039: two segments, All and Favorites, kept in the URL (`?view=favorites`), in the space above the grid where the
 * reference's type tabs are. A starred card shows a filled star in its corner at all times; the hover bar carries
 * Star or Unstar beside Download, outside the card's link, so pressing it never opens the turn. It reads `?view=`, so
 * the page renders it inside Suspense.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LIBRARY_EMPTY, libraryImages, libraryViewOf, resultUrl, turnHref, type LibraryView } from "@/lib/history-view";
import { useHistory } from "@/lib/use-history";
import { useNarrow } from "@/lib/use-narrow";
import { Icon } from "../Icon";

const SEGMENTS: ReadonlyArray<{ readonly view: LibraryView; readonly label: string; readonly href: string }> = [
  { view: "all", label: "All", href: "/library" },
  { view: "favorites", label: "Favorites", href: "/library?view=favorites" },
];

export function Library() {
  const { entries, loaded, setFavorite } = useHistory();
  const narrow = useNarrow();
  const view = libraryViewOf(useSearchParams().get("view"));
  const images = libraryImages(entries, view);
  const empty = LIBRARY_EMPTY[view];
  const iconSet = narrow ? "appicon" : "qwpcicon";
  return (
    <div className="clone-library">
      <nav className="clone-library-segments" aria-label="Library">
        <div className="clone-segmented">
          {SEGMENTS.map((s) => (
            <Link key={s.view} href={s.href} className={`clone-segmented-item${s.view === view ? " clone-segmented-item-on" : ""}`} aria-current={s.view === view ? "page" : undefined} data-testid={`library-segment-${s.view}`}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
      {loaded && images.length === 0 ? (
        <div className="clone-library-empty" data-testid="library-empty">
          <p className="clone-library-empty-title">{empty.title}</p>
          <p>{empty.text}</p>
          {view === "all" ? (
            <Link href="/" className="clone-library-new">
              New image
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="library-content-body">
          {/* Our own classes only: the reference's .item-card / .masonry-grid rules are sized by its JavaScript masonry. */}
          <div className="clone-masonry">
            {images.map((e) => {
              const w = e.result?.width ?? 1;
              const h = e.result?.height ?? 1;
              const starred = e.favoritedAt !== undefined;
              return (
                <div key={e.id} className="clone-card" data-testid="library-card" data-job-id={e.id}>
                  <Link href={turnHref(e)} className="clone-card-img" aria-label={`Open ${e.prompt}`} style={{ aspectRatio: `${String(w)} / ${String(h)}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a result from our own route */}
                    <img src={resultUrl(e.id)} alt={e.prompt} />
                  </Link>
                  {starred ? (
                    <span className="clone-card-star clone-star-on" data-testid="card-star">
                      <Icon id={`${iconSet}-star-fill`} />
                    </span>
                  ) : null}
                  <div className="library-item-operation">
                    <button
                      type="button"
                      className={`clone-icon-button library-item-operation-icon${starred ? " clone-star-on" : ""}`}
                      aria-label={starred ? "Unstar" : "Star"}
                      onClick={() => {
                        void setFavorite(e.id, !starred);
                      }}
                    >
                      <Icon id={`${iconSet}-${starred ? "star-fill" : "star"}`} />
                    </button>
                    <a className="library-item-operation-icon" href={`${resultUrl(e.id)}?download=1`} download aria-label="Download">
                      <Icon id={`${iconSet}-download`} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
