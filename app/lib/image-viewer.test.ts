import { describe, expect, it } from "vitest";
import { collectImages, counterLabel, stepIndex, swipeStep, viewerImageOf } from "./image-viewer";

describe("stepIndex (STORY_038)", () => {
  it("steps one image either way and stops at the ends", () => {
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("counterLabel", () => {
  it("reads as the sheet says it", () => {
    expect(counterLabel(1, 3)).toBe("2 of 3");
  });
});

describe("swipeStep", () => {
  it("a swipe to the left is the next image, to the right the previous, and a short one nothing", () => {
    expect(swipeStep(-80)).toBe(1);
    expect(swipeStep(80)).toBe(-1);
    expect(swipeStep(10)).toBe(0);
  });
});

function chat(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("collectImages", () => {
  it("lists a chat's marked images in the order they appear, results and references together", () => {
    const c = chat(`
      <img data-viewer data-viewer-name="reference.png" src="blob:ref" alt="reference.png">
      <img src="/not/marked.png">
      <img id="r" data-viewer data-viewer-name="qwen-abc.png" data-viewer-download="/api/jobs/abc/result?download=1" data-viewer-job="abc" src="/api/jobs/abc/result" alt="a prompt">
      <img data-viewer src="" alt="not loaded yet">`);
    const found = collectImages(c, c.querySelector("#r") ?? c);
    expect(found).toEqual({
      index: 1,
      images: [
        { src: "blob:ref", name: "reference.png", download: "blob:ref" },
        { src: "/api/jobs/abc/result", name: "qwen-abc.png", download: "/api/jobs/abc/result?download=1", job: "abc" },
      ],
    });
  });
  it("is null for an element that is not one of them", () => {
    const c = chat(`<img data-viewer src="/a.png"><img id="x" src="/b.png">`);
    expect(collectImages(c, c.querySelector("#x") ?? c)).toBeNull();
  });
});

describe("viewerImageOf", () => {
  it("names an image by its alt when it carries no name, and has nothing to show without a source", () => {
    expect(viewerImageOf(chat(`<img data-viewer src="/a.png" alt="alt name">`).querySelector("img") ?? document.body)).toEqual({ src: "/a.png", name: "alt name", download: "/a.png" });
    expect(viewerImageOf(chat(`<img data-viewer src="/a.png">`).querySelector("img") ?? document.body)).toEqual({ src: "/a.png", name: "", download: "/a.png" });
    expect(viewerImageOf(chat(`<img data-viewer>`).querySelector("img") ?? document.body)).toBeNull();
  });
});
