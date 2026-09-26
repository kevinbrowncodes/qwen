/**
 * A minimal deterministic PNG encoder (8-bit RGB, no interlace) for the stub's fixtures (STORY_006). No image is
 * copied from the reference or from the model (CLAUDE.md §6 rule 10): the fixtures are drawn here, byte for byte
 * reproducible, so `pnpm --filter stub-generation-server fixtures` rebuilds exactly what is committed.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encodes width×height pixels given by `rgb(x, y)` as a PNG. */
export function encodePng(width: number, height: number, rgb: (x: number, y: number) => readonly [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Reads width and height from a PNG's IHDR; throws on anything that is not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The result fixture: 64×36 (16:9), eight bands from the page's dark to the reference's image-mode blue (#426eff). */
export function resultFixture(): Buffer {
  const band = (x: number): number => Math.floor(x / 8) / 7;
  return encodePng(64, 36, (x) => [Math.round(0x17 + (0x42 - 0x17) * band(x)), Math.round(0x17 + (0x6e - 0x17) * band(x)), Math.round(0x17 + (0xff - 0x17) * band(x))]);
}

/** The upload fixture: 32×32, a checkerboard, so a test can tell it from the result. */
export function referenceFixture(): Buffer {
  return encodePng(32, 32, (x, y) => ((x >> 3) + (y >> 3)) % 2 === 0 ? [0xfa, 0xfb, 0xff] : [0x29, 0x36, 0x52]);
}
