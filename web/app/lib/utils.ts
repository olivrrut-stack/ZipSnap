/** Maps a rendered kit file name to the Chrome Web Store size it was built at. */
export function sizeOf(name: string): string {
  if (name.startsWith("screenshot")) return "1280 × 800";
  if (name.startsWith("small-promo")) return "440 × 280";
  if (name.startsWith("marquee")) return "1400 × 560";
  return "";
}

/** Picks a top-level name to label the zip (the dropped folder's name, if any). */
export function deriveName(files: { path: string; file: File }[]): string {
  const top = files[0]?.path.split("/")[0];
  return (top && files.every((f) => f.path.includes("/")) ? top : "extension") + ".zip";
}

/**
 * Batches a rapid burst of numeric events into at most one `flush` per
 * `intervalMs`, summing the values. A mouse-wheel/trackpad scroll fires dozens
 * of events per second; without coalescing each one became a separate network
 * request, which exhausted the server's rate limit and blocked the live-browser
 * login flow. Returns a `push` function to feed each event's value into.
 */
export function createCoalescer(
  flush: (total: number) => void,
  intervalMs: number,
): (value: number) => void {
  let total = 0;
  let pending = false;
  return (value: number) => {
    total += value;
    if (pending) return;
    pending = true;
    setTimeout(() => {
      const sum = total;
      total = 0;
      pending = false;
      flush(sum);
    }, intervalMs);
  };
}
