import { describe, expect, it } from "vitest";
import { BIRTHDAY_CYCLE_MS, BIRTHDAY_DANCE_MS, BIRTHDAY_BADGE_MS, getCelebrationState } from "@/lib/birthdays/celebration";

describe("getCelebrationState", () => {
  it("starts immediately and shows the badge for five seconds", () => {
    expect(getCelebrationState(true, 1000, 1000)).toEqual({ visible: true, dancing: true });
    expect(getCelebrationState(true, 1000, 1000 + BIRTHDAY_DANCE_MS)).toEqual({ visible: true, dancing: false });
    expect(getCelebrationState(true, 1000, 1000 + BIRTHDAY_BADGE_MS - 1)).toEqual({ visible: true, dancing: false });
    expect(getCelebrationState(true, 1000, 1000 + BIRTHDAY_BADGE_MS)).toEqual({ visible: false, dancing: false });
  });

  it("pauses for two full minutes after the five-second badge", () => {
    expect(BIRTHDAY_CYCLE_MS).toBe(BIRTHDAY_BADGE_MS + 120_000);
    expect(getCelebrationState(true, 0, BIRTHDAY_CYCLE_MS - 1).visible).toBe(false);
    expect(getCelebrationState(true, 0, BIRTHDAY_CYCLE_MS).visible).toBe(true);
    expect(getCelebrationState(true, 0, BIRTHDAY_CYCLE_MS + BIRTHDAY_DANCE_MS).dancing).toBe(false);
  });

  it("clears both badge and dance when the birthday signal is false", () => {
    expect(getCelebrationState(false, 1000, 1000)).toEqual({ visible: false, dancing: false });
    expect(getCelebrationState(true, 2000, 1999)).toEqual({ visible: false, dancing: false });
  });
});
