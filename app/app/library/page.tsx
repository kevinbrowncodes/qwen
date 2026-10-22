import { Suspense } from "react";
import { Library } from "@/components/library/Library";

/** /library: My Library (STORY_013). It reads `?view=` (STORY_039), so it renders inside Suspense. */
export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="clone-library" />}>
      <Library />
    </Suspense>
  );
}
