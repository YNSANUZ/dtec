import { describe, expect, it } from "vitest";
import { getKeyboardInset } from "@/lib/room/mobile-viewport";

describe("getKeyboardInset", () => {
  it("returns the visible viewport bottom gap when a mobile keyboard covers the page", () => {
    expect(getKeyboardInset(900, 560, 0)).toBe(340);
    expect(getKeyboardInset(900, 600, 80)).toBe(220);
  });

  it("returns no inset when the keyboard is absent or measurements are invalid", () => {
    expect(getKeyboardInset(900, 900, 0)).toBe(0);
    expect(getKeyboardInset(0, 600, 0)).toBe(0);
    expect(getKeyboardInset(900, Number.NaN, 0)).toBe(0);
  });
});
