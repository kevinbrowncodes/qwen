/** How the result route names the image (STORY_007): inline for display, attachment for a download. */
export function resultFileName(id: string): string {
  const short = id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "image";
  return `qwen-${short}.png`;
}

export function contentDisposition(id: string, kind: "inline" | "attachment"): string {
  return `${kind}; filename="${resultFileName(id)}"`;
}
