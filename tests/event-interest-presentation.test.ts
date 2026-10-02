import { describe, expect, it } from "vitest";
import { toEventCardViewModel } from "@/lib/events/presentation";

const event = {
  id: "event-1",
  title: "Kart",
  description: "Vamos combinar uma data.",
  category: "kart",
  startsAt: null,
  location: "  ",
  interestCount: 1,
};

describe("event card view model", () => {
  it("provides concise fallback labels and singular interest count", () => {
    expect(toEventCardViewModel(event)).toMatchObject({
      whenLabel: "Data a combinar",
      whereLabel: "Local a combinar",
      interestLabel: "1 interessado",
    });
  });

  it("formats a valid date and pluralizes interest count", () => {
    const view = toEventCardViewModel({ ...event, startsAt: "2026-10-20T15:30:00.000Z", location: "Kartódromo", interestCount: 2 });
    expect(view.whenLabel).not.toBe("Data a combinar");
    expect(view.whereLabel).toBe("Kartódromo");
    expect(view.interestLabel).toBe("2 interessados");
  });
});
