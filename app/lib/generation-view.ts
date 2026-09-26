/**
 * What the generation view shows for a job (STORY_012), as pure functions: the notice for a failed, moderated or
 * stopped job, the status line under the skeleton, and the skeleton's size for the requested ratio.
 */
import type { JobStatusResponse } from "./job-api";

export const MODERATED = "The prompt was refused on content grounds.";
export const STOPPED = "Stopped.";

export function noticeFor(job: Pick<JobStatusResponse, "status" | "error">): string | null {
  if (job.status === "cancelled") return STOPPED;
  if (job.status !== "failed") return null;
  if (job.error?.code === "moderated") return MODERATED;
  return `The generation failed: ${job.error?.message ?? "no reason given"}`;
}

export function statusLine(status: string): string | null {
  if (status === "queued") return "Queued";
  if (status === "running") return "Generating";
  return null;
}

/** The skeleton is 400 wide at the requested ratio (reading: 400×225 for 16:9); an edit's size is not known yet. */
export function skeletonSize(ratio: string | null, width = 400): { width: number; height: number } {
  const m = ratio === null ? null : /^(\d+):(\d+)$/.exec(ratio);
  const w = m ? Number(m[1]) : 16;
  const h = m ? Number(m[2]) : 9;
  return { width, height: Math.round((width * h) / w) };
}
