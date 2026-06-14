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
