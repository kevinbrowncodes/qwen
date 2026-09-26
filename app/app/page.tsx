import { ComposerHost } from "@/components/composer/ComposerHost";

/** The home (STORY_009): the reference's welcome area and composer. */
export default function Home() {
  return (
    <div className="placeholder-container" id="dropzone-container">
      <div className="placeholder-text-container">
        <div className="placeholder-logo-pc-container">
          <div className="placeholder-logo-text" role="heading" aria-level={1}>
            How can I help you?
          </div>
        </div>
      </div>
      <ComposerHost />
    </div>
  );
}
