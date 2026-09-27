"use client";
/**
 * My Library at /library (STORY_013): every finished image in a masonry grid of 276px cards (2 columns of 180px on the
 * phone), each opening its generation, with a Download bar that shows on hover (always on touch). Readings:
 * docs/recon/2026-09-26/states/my-library@1437.json and @393.json.
 */
import Link from "next/link";
import { finished, resultUrl } from "@/lib/history-view";
import { useHistory } from "@/lib/use-history";
import { useNarrow } from "@/lib/use-narrow";
import { Icon } from "../Icon";

export function Library() {
  const { entries, loaded } = useHistory();
  const narrow = useNarrow();
  const images = finished(entries);
  return (
    <div className="clone-library">
      {loaded && images.length === 0 ? (
        <div className="clone-library-empty" data-testid="library-empty">
          <p className="clone-library-empty-title">No images yet.</p>
          <p>Generated images appear here.</p>
          <Link href="/" className="clone-library-new">
            New image
          </Link>
        </div>
      ) : (
        <div className="library-content-body">
          {/* Our own classes only: the reference's .item-card / .masonry-grid rules are sized by its JavaScript masonry. */}
          <div className="clone-masonry">
            {images.map((e) => {
              const w = e.result?.width ?? 1;
              const h = e.result?.height ?? 1;
              return (
                <div key={e.id} className="clone-card" data-testid="library-card">
                  <Link href={`/g/${encodeURIComponent(e.id)}`} className="clone-card-img" aria-label={`Open ${e.prompt}`} style={{ aspectRatio: `${String(w)} / ${String(h)}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a result from our own route */}
                    <img src={resultUrl(e.id)} alt={e.prompt} />
                  </Link>
                  <div className="library-item-operation">
                    <a className="library-item-operation-icon" href={`${resultUrl(e.id)}?download=1`} download aria-label="Download">
                      <Icon id={narrow ? "appicon-download" : "qwpcicon-download"} />
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
