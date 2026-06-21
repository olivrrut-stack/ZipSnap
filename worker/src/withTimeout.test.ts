import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the promise settles in time", async () => {
    const p = withTimeout(Promise.resolve("ok"), 1000, "too slow");
    await expect(p).resolves.toBe("ok");
  });

  it("rejects with the label when the promise never settles", async () => {
    // A promise that never resolves — the real-world page.evaluate hang.
    const p = withTimeout(new Promise<string>(() => {}), 5000, "auth-detect timed out");
    const assertion = expect(p).rejects.toThrow("auth-detect timed out");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("does not reject if the promise settles just before the deadline", async () => {
    let resolve!: (v: string) => void;
    const inner = new Promise<string>((r) => { resolve = r; });
    const p = withTimeout(inner, 5000, "too slow");
    await vi.advanceTimersByTimeAsync(4000);
    resolve("done");
    await expect(p).resolves.toBe("done");
  });
});
