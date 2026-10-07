/**
 * Copying text (STORY_024). The Clipboard API exists only in a secure context, and the app is also opened over the
 * LAN by plain http (http://qwen.local, CHORE_004), so a refusal falls back to a selected, off-screen textarea and the
 * copy command, which is deprecated but is the only copy a plain-http page has.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only copy without a secure context (see above)
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
