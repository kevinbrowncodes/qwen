import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell/Shell";
import { BOOT_SCRIPT } from "@/lib/narrow";
import "./clone.css";

export const metadata: Metadata = {
  title: "Qwen Local",
  description: "A self-hosted image generation workstation",
};

/**
 * The reference's stylesheets, lifted verbatim and concatenated in the page's own order (recon/src/reference-sync.ts),
 * are loaded first; clone.css (ours) only fills what the reference set from JavaScript. <html class="dark"> and the page
 * colour are what the reference sets on its root (docs/recon/2026-09-26/snapshots/home-signed-in@1437.html).
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: "rgb(23, 23, 23)" }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        {/* eslint-disable-next-line @next/next/no-css-tags -- a lifted, prebuilt stylesheet served as-is from public/ */}
        <link rel="stylesheet" href="/reference/reference.css" />
      </head>
      <body>
        <div id="root">
          <Shell>{children}</Shell>
        </div>
      </body>
    </html>
  );
}
