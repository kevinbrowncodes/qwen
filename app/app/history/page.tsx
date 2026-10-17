import { Suspense } from "react";
import { HistoryDays } from "@/components/history/HistoryDays";

/** /history: earlier days' chats, one day at a time (STORY_032). It reads `?day=`, so it renders inside Suspense. */
export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="clone-history" />}>
      <HistoryDays />
    </Suspense>
  );
}
