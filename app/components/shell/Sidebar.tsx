"use client";
/**
 * The sidebar (STORY_009 entries, STORY_013 history): New image, My Library with the two newest finished images
 * (68×68, the reference's `.my-library-content-item`), and every generation grouped by day.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { latestFinished, resultUrl } from "@/lib/history-view";
import { useHistory } from "@/lib/use-history";
import { Icon } from "../Icon";
import { HistoryList } from "./HistoryList";

export function Sidebar({ iconSet, onToggle, onNavigate }: { readonly iconSet: "qwpcicon" | "appicon"; readonly onToggle: () => void; readonly onNavigate: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { entries, remove, stop } = useHistory();
  const [now] = useState(() => new Date());
  const activeId = pathname.startsWith("/g/") ? decodeURIComponent(pathname.slice(3)) : null;
  const thumbs = latestFinished(entries);

  return (
    <>
      <div className="sidebar-header-wrapper">
        {/* The reference's own logo (harvested, STORY_003), styled by its .logo-img rule: 75×20. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a lifted SVG served as-is from public/ */}
        <img className="logo-img" src="/reference/qwen-logo-dark.svg" alt="Qwen" />
        <button type="button" className="slide-switch" aria-label="Toggle sidebar" id="sidebar-toggle-button" onClick={onToggle}>
          <Icon id={`${iconSet}-sidebarLeft`} className="slide-switch-icon" />
        </button>
      </div>
      <div className="sidebar-entry-fixed-list">
        <Link href="/" aria-label="New image" className="sidebar-entry-fixed-list-content" onClick={onNavigate}>
          <Icon id={`${iconSet}-newDialogue`} className="sidebar-entry-fixed-list-icon" />
          <div className="sidebar-entry-fixed-list-text">New image</div>
        </Link>
        <Link href="/library" className="my-library-head" onClick={onNavigate}>
          <div className="my-library-head-left">
            <Icon id={`${iconSet}-library`} className="my-library-head-left-icon" />
            <div className="my-library-head-left-text">My Library</div>
          </div>
          <div className="my-library-head-right">
            <Icon id={`${iconSet}-rightMini`} className="my-library-head-right-icon" />
          </div>
        </Link>
      </div>
      <div className="sidebar-new-list-content">
        {thumbs.length > 0 ? (
          <div className="sidebar-entry-list">
            <div className="my-library-content clone-library-thumbs">
              {thumbs.map((e) => (
                <Link key={e.id} href={`/g/${encodeURIComponent(e.id)}`} className="my-library-content-item" onClick={onNavigate} aria-label={`Open ${e.prompt}`} data-testid="library-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a result from our own route */}
                  <img src={resultUrl(e.id)} alt="" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <HistoryList
          entries={entries}
          activeId={activeId}
          now={now}
          iconSet={iconSet}
          onNavigate={onNavigate}
          onStop={(id) => void stop(id)}
          onDelete={(id) => {
            void remove(id).then((removed) => {
              if (removed && id === activeId) {
                onNavigate();
                router.push("/");
              }
            });
          }}
        />
      </div>
    </>
  );
}
