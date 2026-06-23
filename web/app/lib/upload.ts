/** Shared drag-and-drop / zip helpers used by both the kit generator and grader. */

export interface Picked {
  blob: Blob;
  name: string;
}

export interface Entry {
  path: string;
  file: File;
}

/** Recursively reads a dropped directory/file entry into a flat list with paths. */
export function walkEntry(entry: any, prefix: string, out: Entry[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f: File) => {
        out.push({ path: prefix + entry.name, file: f });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: any[] = [];
      const readBatch = () =>
        reader.readEntries(async (ents: any[]) => {
          if (ents.length === 0) {
            for (const e of all) await walkEntry(e, prefix + entry.name + "/", out);
            resolve();
          } else {
            all.push(...ents);
            readBatch();
          }
        }, () => resolve());
      readBatch();
    } else resolve();
  });
}

/** Zips a list of {path, file} into a single Blob (JSZip loaded on demand). */
export async function zipFiles(files: Entry[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const { path, file } of files) zip.file(path, file);
  return zip.generateAsync({ type: "blob" });
}

/** Strips macOS cruft from a dropped/selected file set. */
export function filterReal(entries: Entry[]): Entry[] {
  return entries.filter((f) => !f.path.includes("__MACOSX") && !f.path.endsWith(".DS_Store"));
}

/** Reads a drop event into either a single zip or a flat list of entries. */
export async function readDrop(e: React.DragEvent): Promise<{ zip?: File; entries?: Entry[] }> {
  const dt = e.dataTransfer;
  if (dt.files.length === 1 && /\.zip$/i.test(dt.files[0].name)) {
    return { zip: dt.files[0] };
  }
  const items = Array.from(dt.items).filter((i) => i.kind === "file");
  const fsEntries = items.map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (fsEntries.length) {
    const out: Entry[] = [];
    for (const entry of fsEntries) await walkEntry(entry, "", out);
    return { entries: out };
  }
  return { entries: Array.from(dt.files).map((f) => ({ path: f.name, file: f })) };
}
