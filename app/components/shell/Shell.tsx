"use client";
/**
 * The reference's page frame (STORY_009), rendered with its own class names so the lifted stylesheets lay it out:
 * sidebar (a drawer at phone width), top bar, main area. Markup from docs/recon/2026-09-26/snapshots/home-signed-in@1437.html
 * and the 393 readings; only the MVP's entries are rendered (see the story's Departures).
 */
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useNarrow } from "@/lib/use-narrow";
import { Icon } from "../Icon";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: { readonly children: ReactNode }) {
  const narrow = useNarrow();
  const onLibrary = usePathname() === "/library";
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sideHidden = narrow ? !drawerOpen : collapsed;
  const iconSet = narrow ? "appicon" : "qwpcicon";

  return (
    <div className="app">
      <div className="desktop-layout">
        <div className="sidebar-wrapper">
          {narrow && drawerOpen ? <div className="clone-drawer-mask" data-testid="drawer-backdrop" onClick={() => { setDrawerOpen(false); }} /> : null}
          <div className={sideHidden ? "sidebar sidebar-collapse" : "sidebar"} id="sidebar">
            <div className={`sidebar-side side-mobile-width${sideHidden ? " sidebar-hide-side" : ""}`} data-testid="sidebar" aria-hidden={sideHidden}>
              <Sidebar
                iconSet={iconSet}
                onToggle={() => {
                  if (narrow) setDrawerOpen(false);
                  else setCollapsed((c) => !c);
                }}
                onNavigate={() => {
                  if (narrow) setDrawerOpen(false);
                }}
              />
            </div>
          </div>
        </div>
        <div className="desktop-layout-content">
          <div className="desktop-layout-content-inner">
            <div className="splitter-container">
              <div className="splitter-container-left-panel">
                <div className="home-page-layout-main">
                  {narrow ? (
                    <header className="header-mobile">
                      <div className="header-content">
                        <div className="header-left">
                          <button type="button" className="clone-icon-button sidebar-toggle-icon" aria-label="Open sidebar" onClick={() => { setDrawerOpen(true); }}>
                            <Icon id="appicon-menu" />
                          </button>
                          {onLibrary ? (
                            <div className="header-mobile-title">My Library</div>
                          ) : (
                            <div className="mms-trigger">
                              <div className="mms-trigger__name">Qwen-Image 2.1</div>
                            </div>
                          )}
                        </div>
                        <div className="header-right" />
                      </div>
                    </header>
                  ) : (
                    <header className="header-desktop">
                      <div className="header-content" id="qwen-chat-header-content">
                        <div className="header-left" id="qwen-chat-header-left">
                          {collapsed ? (
                            <button type="button" className="slide-switch" aria-label="Toggle sidebar" onClick={() => { setCollapsed(false); }}>
                              <Icon id="qwpcicon-sidebarLeft" className="slide-switch-icon" />
                            </button>
                          ) : null}
                          {onLibrary ? (
                            <div className="header-route clone-library-header">
                              <h1 className="header-title">My Library</h1>
                            </div>
                          ) : (
                            <div className="wms-trigger" aria-label="Model">
                              <div className="wms-trigger__content">
                                <div className="wms-trigger__text">Qwen-Image 2.1</div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="header-right" id="qwen-chat-header-right" />
                      </div>
                    </header>
                  )}
                  <main className="main-content">{children}</main>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
