import { describe, expect, it } from "vitest";
import { isBirthdayToday } from "@/lib/birthdays/celebration-date";

describe("isBirthdayToday", () => {
  it("matches normal month/day birthdays", () => {
    expect(isBirthdayToday("10-02", new Date("2026-10-02T15:00:00.000Z"))).toBe(true);
    expect(isBirthdayToday("10-01", new Date("2026-10-02T15:00:00.000Z"))).toBe(false);
  });

  it("handles leap-day birthdays only on Feb 29", () => {
    expect(isBirthdayToday("02-29", new Date("2028-02-29T16:00:00.000Z"))).toBe(true);
    expect(isBirthdayToday("02-29", new Date("2027-03-01T16:00:00.000Z"))).toBe(false);
  });

  it("uses the Sao Paulo day at either side of midnight", () => {
    expect(isBirthdayToday("12-31", new Date("2026-01-01T02:59:59.000Z"))).toBe(true);
    expect(isBirthdayToday("01-01", new Date("2026-01-01T02:59:59.000Z"))).toBe(false);
    expect(isBirthdayToday("01-01", new Date("2026-01-01T03:00:00.000Z"))).toBe(true);
  });

  it("returns false for missing or malformed dates", () => {
    expect(isBirthdayToday(null, new Date("2026-10-02T15:00:00.000Z"))).toBe(false);
    expect(isBirthdayToday("02-31", new Date("2026-10-02T15:00:00.000Z"))).toBe(false);
    expect(isBirthdayToday("10/02", new Date("2026-10-02T15:00:00.000Z"))).toBe(false);
  });
});
