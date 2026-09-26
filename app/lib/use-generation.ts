"use client";
/**
 * Polls one generation until it is terminal (STORY_012). The first poll goes at once, then 1 s, ×1.5, capped at 4 s
 * (lib/polling.ts). Timers are scheduled on every effect setup and cleared on every cleanup, so React StrictMode's
 * simulated remount leaves exactly one loop running and an unmount leaves none (CLAUDE.md §6b).
 */
import { useCallback, useEffect, useState } from "react";
import { isApiError, isJobStatusResponse, isTerminal, type JobStatusResponse } from "./job-api";
import { delayFor } from "./polling";

export interface Generation {
  readonly job: JobStatusResponse | null;
  /** The server's message when the job cannot be read (unknown id, server down). */
  readonly problem: string | null;
  readonly stop: () => Promise<void>;
}

export function useGeneration(id: string, onTerminal?: (job: JobStatusResponse) => void): Generation {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let attempt = 0;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
        const body: unknown = await res.json();
        if (!alive) return;
        if (res.ok && isJobStatusResponse(body)) {
          setJob(body);
          setProblem(null);
          if (isTerminal(body.status)) {
            onTerminal?.(body);
            return;
          }
        } else if (isApiError(body)) {
          setProblem(body.error.message);
          if (res.status === 404) return;
        }
      } catch {
        if (!alive) return;
      }
      timer = setTimeout(() => {
        void poll();
      }, delayFor(attempt++));
    };
    void poll();
    return () => {
      alive = false;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
    // onTerminal is a notification, not an input: a new function each render must not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, round]);

  const stop = useCallback(async (): Promise<void> => {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.status === 202) {
      setJob((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    }
    // 202 or 409 (it finished first): read the real final state once more.
    setRound((r) => r + 1);
  }, [id]);

  return { job, problem, stop };
}
