"use client";
/**
 * The generation server's capabilities for a page that only needs to name things (STORY_024: the Info panel's model
 * and add-on labels). Starts from the contract's fallback and keeps it when the server is down or off-contract.
 */
import { useEffect, useState } from "react";
import { FALLBACK_CAPABILITIES, parseCapabilities, type Capabilities } from "./composer-state";

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(FALLBACK_CAPABILITIES);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/capabilities", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const parsed = parseCapabilities(body);
        if (parsed) setCaps(parsed);
      })
      .catch(() => {
        // the server is down, or the page went away: the fallback stands
      });
    return () => {
      controller.abort();
    };
  }, []);
  return caps;
}
