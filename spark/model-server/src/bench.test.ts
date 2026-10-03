import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPlan, contactSheet, EDIT_SEED, NONE, RATIO, remaining, runBench, scorecardTemplate, SUBJECTS, subjectFile, type BenchIndex, type Subject } from "./bench.ts";
import type { Lora } from "./loras.ts";
import { createModelServer, type ModelServer } from "./server.ts";

// STORY_022: the add-on bench, as a plan and against the model server with the fake worker.
const FAKE = fileURLToPath(new URL("./fake-worker.ts", import.meta.url));
const FIXTURE = readFileSync(fileURLToPath(new URL("../../../tools/stub-generation-server/fixtures/result.png", import.meta.url)));
const detail: Lora = { id: "fake-detail", label: "Fake detail", path: "/loras/fake-detail/d.safetensors", scale: 0.8, guidance: 3 };
const style: Lora = { id: "fake-style", label: "Fake style", path: "/loras/fake-style/s.safetensors", scale: 1 };
const info = [
  { id: "fake-detail", label: "Fake detail", scale: 0.8, guidance: 3 },
  { id: "fake-style", label: "Fake style", scale: 1 },
];

describe("the plan", () => {
  it("is every subject, then an edit per subject and setting, then a text-to-image per setting, with none first", () => {
    const plan = buildPlan(["fake-detail", "fake-style", NONE]);
    expect(plan.settings).toEqual([NONE, "fake-detail", "fake-style"]);
    expect(plan.subjects).toBe(SUBJECTS);
    expect(plan.cells).toHaveLength(4 * 3 + 3);
    expect(plan.cells[0]).toEqual({ key: "edit/A-1001/none", kind: "edit", subject: "A-1001", setting: NONE, file: "edit_A-1001_none.png" });
    expect(plan.cells[5]).toEqual({ key: "edit/A-1002/fake-style", kind: "edit", subject: "A-1002", setting: "fake-style", file: "edit_A-1002_fake-style.png" });
    expect(plan.cells[12]).toEqual({ key: "t2i/none", kind: "t2i", setting: NONE, file: "t2i_none.png" });
    expect(plan.cells[14]).toEqual({ key: "t2i/fake-style", kind: "t2i", setting: "fake-style", file: "t2i_fake-style.png" });
    expect(SUBJECTS.map((s) => s.seed)).toEqual([1001, 1002, 2001, 2002]);
    expect(SUBJECTS.every((s) => /about 3\d years old/.test(s.prompt))).toBe(true);
  });

  it("keeps the cells that are absent, failed or cancelled", () => {
    const plan = buildPlan(["x"]);
    const index: BenchIndex = {
      base: "",
      subjects: {},
      cells: { "edit/A-1001/none": { jobId: "a", status: "done", seconds: 1 }, "edit/A-1001/x": { jobId: "b", status: "failed", seconds: 1, error: "oom" }, "t2i/none": { jobId: "c", status: "cancelled", seconds: 1 } },
    };
    expect(remaining(plan.cells, index).map((c) => c.key)).toEqual(plan.cells.map((c) => c.key).filter((k) => k !== "edit/A-1001/none"));
  });

  it("renders the sheet with the clothed subject first, timings under done cells and the error in a failed one", () => {
    const plan = buildPlan(["fake-detail"], [SUBJECTS[0] as Subject]);
    const index: BenchIndex = {
      base: "",
      subjects: { "A-1001": { jobId: "s1", status: "done", seconds: 118.4 } },
      cells: { "edit/A-1001/none": { jobId: "a", status: "done", seconds: 120.6 }, "edit/A-1001/fake-detail": { jobId: "b", status: "failed", seconds: 3, error: "out of <memory>" } },
    };
    const html = contactSheet(plan, index, info, "Bench");
    expect(html).toContain('<img src="subject_A-1001.png"');
    expect(html).toContain('<img src="edit_A-1001_none.png"');
    expect(html).toContain("121 s");
    expect(html).not.toContain('<img src="edit_A-1001_fake-detail.png"');
    expect(html).toContain("failed: out of &lt;memory&gt;");
    expect(html).toContain("fake-detail (Fake detail, ×0.8, cfg 3)");
    expect(html).toContain("not run"); // the text-to-image cells
  });

  it("writes the scorecard with a row per cell carrying its job and seconds, and a decision row per add-on", () => {
    const plan = buildPlan(["fake-detail", "fake-style"], [SUBJECTS[0] as Subject]);
    const index: BenchIndex = { base: "", subjects: { "A-1001": { jobId: "subject-job-1", status: "done", seconds: 60 } }, cells: { "edit/A-1001/fake-style": { jobId: "0123456789abcdef", status: "done", seconds: 99.6 } } };
    const md = scorecardTemplate(plan, index, info, "Bench");
    expect(md).toContain("| `fake-detail` | Fake detail | 0.8 | 3 |");
    expect(md).toContain("| `fake-style` | Fake style | 1 | default (none) |");
    expect(md).toContain("| `none` | no add-on |  | default (none) |");
    expect(md).toContain("| A-1001 (seed 1001) | `subject-` | 60 | done |");
    expect(md).toContain("| `edit/A-1001/fake-style` | `01234567` | 100 | done |  |  |  |  |  |");
    expect(md).toContain("| `edit/A-1001/none` | `` |  | not run |  |  |  |  |  |");
    expect(md.split("\n").filter((l) => l.startsWith("| `fake-")).length).toBe(2 + 2); // settings rows and decision rows
    expect(md).not.toMatch(/\.png/);
  });
});

describe("against the model server with the fake worker", () => {
  let dir = "";
  let out = "";
  let log = "";
  let model: ModelServer | null = null;
  let base = "";
  /** Short prompts the fake worker finishes in a few steps; "fail" in a prompt makes it fail. */
  const subjects: readonly Subject[] = [
    { key: "A-1", prompt: "subject one", seed: 1001 },
    { key: "B-2", prompt: "subject two", seed: 2001 },
  ];

  async function start(outputDir: string): Promise<void> {
    process.env["FAKE_LOG"] = log;
    model = createModelServer({ outputDir, workerCommand: ["node", FAKE], restartDelayMs: 50, log: () => undefined, loras: [detail, style] });
    base = `http://127.0.0.1:${String(await model.listen(0))}`;
  }
  const sentJobs = (): Array<Record<string, unknown>> =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Record<string, unknown>)
          .filter((m) => m["type"] === "job")
      : [];
  const index = (): BenchIndex => JSON.parse(readFileSync(path.join(out, "index.json"), "utf8")) as BenchIndex;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "qwen-bench-"));
    out = path.join(dir, "bench");
    log = path.join(dir, "worker.log");
    await start(path.join(dir, "outputs"));
  });
  afterEach(async () => {
    await model?.close();
    model = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs every cell, edits from the subjects' results with the planned add-ons and seeds, then runs nothing again", async () => {
    const lines: string[] = [];
    const first = await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "undress", t2iPrompt: "nude", manifest: info, title: "Bench", report: (l) => lines.push(l) });
    expect(first).toEqual({ ran: 2 + 2 * 3 + 3, skipped: 0, failed: [], complete: true });
    const idx = index();
    expect(Object.keys(idx.cells)).toHaveLength(9);
    expect(Object.values(idx.cells).every((e) => e.status === "done" && e.jobId !== "")).toBe(true);
    for (const s of subjects) expect(readFileSync(path.join(out, subjectFile(s.key)))).toEqual(FIXTURE);
    expect(readFileSync(path.join(out, "edit_A-1_fake-detail.png"))).toEqual(FIXTURE);
    expect(readFileSync(path.join(out, "t2i_fake-style.png"))).toEqual(FIXTURE);
    expect(existsSync(path.join(out, "contact-sheet.html"))).toBe(true);
    expect(readFileSync(path.join(out, "scorecard.md"), "utf8")).toContain("| `fake-detail` | Fake detail | 0.8 | 3 |");

    const jobs = sentJobs();
    expect(jobs).toHaveLength(11);
    expect(jobs.slice(0, 2)).toMatchObject([
      { prompt: "subject one", seed: 1001, width: 896, height: 1184, references: [] },
      { prompt: "subject two", seed: 2001, width: 896, height: 1184, references: [] },
    ]);
    const edits = jobs.slice(2, 8);
    expect(edits.every((j) => j["prompt"] === "undress" && j["seed"] === EDIT_SEED && Array.isArray(j["references"]) && j["references"].length === 1 && j["width"] === undefined)).toBe(true);
    expect(edits.map((j) => (j["lora"] as { id: string } | undefined)?.id)).toEqual([undefined, "fake-detail", "fake-style", undefined, "fake-detail", "fake-style"]);
    expect(edits[1]?.["lora"]).toEqual({ id: "fake-detail", scale: 0.8, guidance: 3 });
    expect(jobs.slice(8).map((j) => [j["prompt"], j["seed"], (j["lora"] as { id: string } | undefined)?.id])).toEqual([
      ["nude", EDIT_SEED, undefined],
      ["nude", EDIT_SEED, "fake-detail"],
      ["nude", EDIT_SEED, "fake-style"],
    ]);
    expect(lines[0]).toMatch(/3 settings \(none, fake-detail, fake-style\), 9 cells/);
    expect(lines.at(-1)).toMatch(/11 jobs run, 0 cells already done, 0 failed$/);

    const second = await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "undress", t2iPrompt: "nude" });
    expect(second).toEqual({ ran: 0, skipped: 9, failed: [], complete: true });
    expect(sentJobs()).toHaveLength(11);
  });

  it("generates the subjects again when the server no longer has them, and still skips the done cells", async () => {
    await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "undress", t2iPrompt: "nude" });
    const before = index().subjects;
    await model?.close();
    await start(path.join(dir, "outputs-2")); // a fresh server: the old results are gone
    const again = await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "undress", t2iPrompt: "nude" });
    expect(again).toEqual({ ran: 2, skipped: 9, failed: [], complete: true });
    const after = index().subjects;
    expect(after["A-1"]?.jobId).not.toBe(before["A-1"]?.jobId);
    expect(sentJobs().slice(-2).map((j) => j["prompt"])).toEqual(["subject one", "subject two"]);
  });

  it("records a failed cell with the server's message, carries on, and says the run is incomplete", async () => {
    const outcome = await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "fail to undress", t2iPrompt: "nude" });
    expect(outcome.ran).toBe(11);
    expect(outcome.failed).toHaveLength(6);
    expect(outcome.complete).toBe(false);
    const idx = index();
    expect(idx.cells["edit/A-1/none"]).toMatchObject({ status: "failed", error: "CUDA out of memory (scripted)" });
    expect(idx.cells["t2i/none"]?.status).toBe("done");
    expect(existsSync(path.join(out, "edit_A-1_none.png"))).toBe(false);
    expect(readFileSync(path.join(out, "contact-sheet.html"), "utf8")).toContain("failed: CUDA out of memory (scripted)");
    // A later run retries only the failed cells.
    const retry = await runBench({ base, outDir: out, pollMs: 10, subjects, editPrompt: "undress", t2iPrompt: "nude" });
    expect(retry).toEqual({ ran: 6, skipped: 3, failed: [], complete: true });
  });

  it("uses the ratio and seed constants the story names", () => {
    expect(RATIO).toBe("3:4");
    expect(EDIT_SEED).toBe(42);
  });
});
