/**
 * The Python worker as the server sees it (STORY_015): a child process spoken to in JSON lines. It is started once,
 * reports `ready` when the pipeline has loaded, and is restarted if it exits; whoever owns it is told, so the job it
 * was running can be failed. `init`, when given, is its first line on every start (the add-ons to load, STORY_019).
 * `restart(reason)` replaces a live worker that has stopped answering (STORY_026): SIGTERM, then SIGKILL.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { encode, LineSplitter, parseWorkerLine, type FromWorker, type ToWorker, type WorkerInit } from "./protocol.ts";

/** Why the worker last went away: on its own, or replaced by the server's watchdog (STORY_026). */
export type ExitReason = "exited" | "stop not answered" | "silent";

export interface WorkerEvents {
  readonly onMessage: (m: FromWorker) => void;
  readonly onExit: (code: number | null, reason: ExitReason) => void;
  readonly onLog?: (line: string) => void;
}

export class Worker {
  private child: ChildProcess | null = null;
  private stopped = false;
  private readyNow = false;
  private readonly command: readonly string[];
  private readonly events: WorkerEvents;
  private readonly restartDelayMs: number;
  private readonly init: WorkerInit | undefined;
  private readonly killAfterMs: number;
  /** Set while a restart the server asked for is under way; the exit reports it, then clears it. */
  private restarting: ExitReason | null = null;

  constructor(command: readonly string[], events: WorkerEvents, restartDelayMs = 1000, init?: WorkerInit, killAfterMs = 10_000) {
    this.command = command;
    this.events = events;
    this.restartDelayMs = restartDelayMs;
    this.init = init;
    this.killAfterMs = killAfterMs;
  }

  get ready(): boolean {
    return this.readyNow;
  }

  start(): void {
    const [cmd, ...args] = this.command;
    if (cmd === undefined) throw new Error("no worker command");
    this.readyNow = false;
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    if (this.init) child.stdin.write(encode(this.init));
    const out = new LineSplitter();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of out.push(chunk)) {
        const m = parseWorkerLine(line);
        if (m === null) {
          this.events.onLog?.(line);
          continue;
        }
        if (m.type === "ready") this.readyNow = true;
        this.events.onMessage(m);
      }
    });
    const err = new LineSplitter();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      for (const line of err.push(chunk)) this.events.onLog?.(line);
    });
    child.on("exit", (code) => {
      const reason = this.restarting ?? "exited";
      this.restarting = null;
      this.readyNow = false;
      this.child = null;
      this.events.onExit(code, reason);
      if (!this.stopped) setTimeout(() => {
        if (!this.stopped) this.start();
      }, this.restartDelayMs);
    });
  }

  send(message: ToWorker): boolean {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed) return false;
    stdin.write(encode(message));
    return true;
  }

  /** Replaces a live worker: it is killed, and the exit handler starts a new one. A second call while one is under
   * way does nothing. */
  restart(reason: Exclude<ExitReason, "exited">): void {
    const child = this.child;
    if (!child || this.restarting !== null) return;
    this.restarting = reason;
    this.readyNow = false;
    const kill = setTimeout(() => {
      child.kill("SIGKILL");
    }, this.killAfterMs);
    child.once("exit", () => {
      clearTimeout(kill);
    });
    child.kill("SIGTERM");
  }

  stop(): Promise<void> {
    this.stopped = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("exit", () => {
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
}
