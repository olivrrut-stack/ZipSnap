import { describe, it, expect } from "vitest";
import { StoreCopySchema, STORE_CATEGORIES } from "./copy";

const VALID = {
  shortDescription: "A short, punchy summary under the limit.",
  longDescription: "Does one clear thing.\n\n• Feature one\n• Feature two",
  suggestedCategory: STORE_CATEGORIES[0],
  slideHeadlines: ["One Two Three", "Four Five Six", "Seven Eight Nine", "Ten Eleven Twelve", "Last One Here"],
};

describe("StoreCopySchema", () => {
  it("accepts a fully valid store copy object", () => {
    expect(StoreCopySchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects a category outside the known Chrome Web Store list", () => {
    const result = StoreCopySchema.safeParse({ ...VALID, suggestedCategory: "Not A Real Category" });
    expect(result.success).toBe(false);
  });

  it("requires exactly 5 slide headlines", () => {
    const tooFew = StoreCopySchema.safeParse({ ...VALID, slideHeadlines: ["Only One"] });
    expect(tooFew.success).toBe(false);

    const tooMany = StoreCopySchema.safeParse({ ...VALID, slideHeadlines: [...VALID.slideHeadlines, "Extra"] });
    expect(tooMany.success).toBe(false);
  });

  it("rejects a missing field", () => {
    const { shortDescription, ...rest } = VALID;
    const result = StoreCopySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
