import { describe, it, expect, afterEach } from "vitest";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pngSize, saveVerified, isValidHex } from "./pipeline";

const ICON = path.resolve(__dirname, "..", "fixtures", "sample-extension", "icon128.png");

describe("pngSize", () => {
  it("reads width and height from a PNG header", async () => {
    const buf = await readFile(ICON);
    expect(pngSize(buf)).toEqual({ width: 128, height: 128 });
  });
});

describe("saveVerified", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes the file when its size matches what's expected", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "zipsnap-test-"));
    const buf = await readFile(ICON);
    const file = path.join(dir, "icon.png");
    await saveVerified(buf, file, { width: 128, height: 128 });
    expect(await readdir(dir)).toContain("icon.png");
  });

  it("throws and does not write the file when the size doesn't match", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "zipsnap-test-"));
    const buf = await readFile(ICON);
    const file = path.join(dir, "icon.png");
    await expect(saveVerified(buf, file, { width: 1280, height: 800 })).rejects.toThrow(
      /came out 128x128, expected 1280x800/,
    );
    expect(await readdir(dir)).not.toContain("icon.png");
  });
});

describe("isValidHex", () => {
  it("accepts valid 6-digit hex strings", () => {
    expect(isValidHex("#64748b")).toBe(true);
    expect(isValidHex("#FFFFFF")).toBe(true);
    expect(isValidHex("#000000")).toBe(true);
    expect(isValidHex("#aAbBcC")).toBe(true);
  });
  it("rejects invalid values", () => {
    expect(isValidHex("#fff")).toBe(false);
    expect(isValidHex("64748b")).toBe(false);
    expect(isValidHex("#gggggg")).toBe(false);
    expect(isValidHex("not-a-color")).toBe(false);
    expect(isValidHex("")).toBe(false);
  });
});
