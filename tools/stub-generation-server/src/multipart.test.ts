import { describe, expect, it } from "vitest";
import { MultipartError, boundaryOf, parseMultipart } from "./multipart.ts";

const b = "XyZ";
const body = (parts: string[]): Buffer => Buffer.from(`${parts.map((p) => `--${b}\r\n${p}\r\n`).join("")}--${b}--\r\n`, "latin1");

describe("multipart", () => {
  it("reads the boundary, quoted or not", () => {
    expect(boundaryOf(`multipart/form-data; boundary=${b}`)).toBe(b);
    expect(boundaryOf(`multipart/form-data; boundary="${b}"`)).toBe(b);
    expect(boundaryOf("application/json")).toBeUndefined();
    expect(boundaryOf(undefined)).toBeUndefined();
  });

  it("parses fields and files with their types", () => {
    const parsed = parseMultipart(
      body([
        'Content-Disposition: form-data; name="prompt"\r\n\r\na cat',
        'Content-Disposition: form-data; name="ratio"\r\n\r\n1:1',
        'Content-Disposition: form-data; name="referenceImage"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nPNGDATA',
        'Content-Disposition: form-data; name="referenceImage"; filename="b.jpg"\r\n\r\nJPG',
      ]),
      b,
    );
    expect(parsed.fields).toEqual({ prompt: "a cat", ratio: "1:1" });
    expect(parsed.files.map((f) => [f.field, f.filename, f.contentType, f.data.toString()])).toEqual([
      ["referenceImage", "a.png", "image/png", "PNGDATA"],
      ["referenceImage", "b.jpg", "application/octet-stream", "JPG"],
    ]);
  });

  it("refuses a body with no boundary, a truncated part, or a nameless part", () => {
    expect(() => parseMultipart(Buffer.from("nothing"), b)).toThrow(MultipartError);
    expect(() => parseMultipart(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="x"\r\n\r\nno end`), b)).toThrow(/closing boundary/);
    expect(() => parseMultipart(body(["Content-Disposition: form-data\r\n\r\nx"]), b)).toThrow(/field name/);
    expect(() => parseMultipart(Buffer.from(`--${b}XX`), b)).toThrow(/CRLF/);
  });
});
