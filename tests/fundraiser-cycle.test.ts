import { describe, expect, it } from "vitest";
import { getUpcomingDueDate } from "@/lib/fundraisers/cycle";

describe("getUpcomingDueDate in America/Sao_Paulo", () => {
  it("returns this month's day-one cycle before its local due date", () => {
    expect(getUpcomingDueDate(new Date("2026-09-30T12:00:00.000Z"), 1)).toBe("2026-10-01");
  });

  it("advances a month on the due-day boundary", () => {
    expect(getUpcomingDueDate(new Date("2026-10-02T12:00:00.000Z"), 2)).toBe("2026-11-02");
  });

  it("clamps day 31 to February's final day in a common year", () => {
    expect(getUpcomingDueDate(new Date("2027-02-10T12:00:00.000Z"), 31)).toBe("2027-02-28");
  });

  it("clamps day 31 to February 29 in a leap year", () => {
    expect(getUpcomingDueDate(new Date("2028-02-01T12:00:00.000Z"), 31)).toBe("2028-02-29");
  });

  it("rolls into the next year after the December due date", () => {
    expect(getUpcomingDueDate(new Date("2026-12-20T12:00:00.000Z"), 15)).toBe("2027-01-15");
  });

  it("uses Sao Paulo calendar day rather than UTC around midnight", () => {
    expect(getUpcomingDueDate(new Date("2026-10-02T02:59:00.000Z"), 2)).toBe("2026-10-02");
    expect(getUpcomingDueDate(new Date("2026-10-02T03:00:00.000Z"), 2)).toBe("2026-11-02");
  });

  it.each([0, 32])("rejects out-of-range due day %s", (dueDay) => {
    expect(() => getUpcomingDueDate(new Date("2026-10-01T12:00:00.000Z"), dueDay)).toThrow();
  });
});
