"use client";
/**
 * The settings that made a generation (STORY_024), under the action row when Info is on. Ours: the reference shows no
 * generation details (docs/recon/2026-09-26/inventory.md). The rows come from lib/generation-settings.ts.
 */
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { copyAllText, NOT_RECORDED, type SettingRow } from "@/lib/generation-settings";

export interface SettingsPanelProps {
  readonly id: string;
  readonly rows: readonly SettingRow[];
  /** Absent when the request cannot be sent again (an edit whose files this page no longer holds). */
  readonly onSameSeed?: () => void;
}

export function SettingsPanel({ id, rows, onSameSeed }: SettingsPanelProps) {
  const [copied, setCopied] = useState<"seed" | "all" | null>(null);
  const seed = rows.find((r) => r.key === "seed");
  const copy = (what: "seed" | "all", text: string): void => {
    void copyText(text).then((ok) => {
      setCopied(ok ? what : null);
    });
  };

  return (
    <section id={id} className="clone-settings" aria-label="Settings" data-testid="settings-panel">
      <div className="clone-settings-title">Settings</div>
      <dl className="clone-settings-rows">
        {rows.map((row) => (
          <div key={row.key} className="clone-settings-row" data-row={row.key}>
            <dt>{row.label}</dt>
            <dd>
              <span className="clone-settings-value">{row.value}</span>
              {row.detail === undefined ? null : <span className="clone-settings-detail">{row.detail}</span>}
            </dd>
            {row.key === "seed" && row.value !== NOT_RECORDED ? (
              <button
                type="button"
                className="clone-settings-button clone-settings-copy"
                aria-label="Copy seed"
                onClick={() => {
                  copy("seed", row.value);
                }}
              >
                {copied === "seed" ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="clone-settings-buttons">
        <button
          type="button"
          className="clone-settings-button"
          onClick={() => {
            copy("all", copyAllText(rows));
          }}
        >
          {copied === "all" ? "Copied" : "Copy all"}
        </button>
        {onSameSeed && seed && seed.value !== NOT_RECORDED ? (
          <button type="button" className="clone-settings-button" onClick={onSameSeed}>
            Same seed again
          </button>
        ) : null}
      </div>
    </section>
  );
}
