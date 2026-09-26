"use client";
/**
 * The composer in its resting state (STORY_009), in the reference's markup: `+` (Select Mode), the textarea
 * ("Ask Qwen") and the right-hand buttons. Image mode, options and send arrive in STORY_010.
 */
import { useNarrow } from "@/lib/use-narrow";
import { Icon } from "../Icon";

export function Composer() {
  const narrow = useNarrow();
  return (
    <div className="message-input">
      <div className="message-input-wrapper message-input-wrapper-position">
        <div className="message-input-container" data-testid="composer">
          <div>
            <div className="message-input-container-area">
              <div className="mode-select">
                <div className="qwen-chat-v2-dropdown-menu mode-select-dropdown">
                  <div className="qwen-chat-v2-dropdown-menu-trigger">
                    <div className="mode-select-open" role="button" tabIndex={0} aria-label="Select Mode">
                      <Icon id={narrow ? "appicon-add" : "qwpcicon-addBold"} className="mode-select-open-icon" />
                    </div>
                  </div>
                </div>
              </div>
              <textarea rows={1} className="message-input-textarea" placeholder="Ask Qwen" autoComplete="off" aria-label="Prompt" />
              <div className="message-input-right-button" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
