/** `pnpm --filter stub-generation-server fixtures`: rebuilds fixtures/*.png byte for byte (STORY_006). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { referenceFixture, resultFixture } from "./png.ts";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
writeFileSync(path.join(dir, "result.png"), resultFixture());
writeFileSync(path.join(dir, "reference.png"), referenceFixture());
console.log(`[stub] fixtures written to ${dir}`);
