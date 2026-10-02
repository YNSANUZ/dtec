import { describe, expect, it } from "vitest";
import { normalizeRoomEvent } from "@/lib/events/validation";

describe("normalizeRoomEvent", () => {
  it("trims text and normalizes an offset timestamp to ISO", () => {
    expect(normalizeRoomEvent({
      title: "  Kart  ",
      description: "  Encontro da equipe  ",
      category: "kart",
      startsAt: "2026-11-12T18:30:00-03:00",
      location: "  Kartódromo  ",
    })).toEqual({
      title: "Kart",
      description: "Encontro da equipe",
      category: "kart",
      startsAt: "2026-11-12T21:30:00.000Z",
      location: "Kartódromo",
    });
  });

  it("requires a non-empty title", () => {
    expect(() => normalizeRoomEvent({ title: "   " })).toThrow();
    expect(() => normalizeRoomEvent({ description: "Sem título" })).toThrow();
  });

  it("enforces the title, description, and location limits", () => {
    expect(() => normalizeRoomEvent({ title: "t".repeat(81) })).toThrow();
    expect(() => normalizeRoomEvent({ title: "Título", description: "d".repeat(1001) })).toThrow();
    expect(() => normalizeRoomEvent({ title: "Título", location: "l".repeat(161) })).toThrow();
  });

  it("accepts known categories and defaults optional fields", () => {
    expect(normalizeRoomEvent({ title: "  Futebol  ", category: "futebol" })).toEqual({
      title: "Futebol",
      description: "",
      category: "futebol",
      startsAt: null,
      location: "",
    });
    expect(normalizeRoomEvent({ title: "Outro", category: "outro" }).category).toBe("outro");
  });

  it("rejects unsupported categories and malformed dates or payloads", () => {
    expect(() => normalizeRoomEvent({ title: "Evento", category: "passeio" })).toThrow();
    expect(() => normalizeRoomEvent({ title: "Evento", startsAt: "2026-02-30T12:00:00Z" })).toThrow();
    expect(() => normalizeRoomEvent(null)).toThrow();
  });
});
