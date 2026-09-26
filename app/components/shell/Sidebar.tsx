"use client";
import Link from "next/link";
import { Icon } from "../Icon";

/** The sidebar's MVP entries in the reference's markup (STORY_009); the history list arrives in STORY_013. */
export function Sidebar({ iconSet, onToggle, onNavigate }: { readonly iconSet: "qwpcicon" | "appicon"; readonly onToggle: () => void; readonly onNavigate: () => void }) {
  return (
    <>
      <div className="sidebar-header-wrapper">
        <span className="clone-logo-text">Qwen Local</span>
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
      <div className="sidebar-new-list-content" />
    </>
  );
}
