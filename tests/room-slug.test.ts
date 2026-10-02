import { describe, expect, it } from "vitest";
import { normalizeRoomSlug } from "@/lib/rooms/slug";

describe("room IDs", () => {
  it("normalizes uppercase letters and accepts digits in a 3–20 character ID", () => {
    expect(normalizeRoomSlug("Sala2026")).toBe("sala2026");
    expect(normalizeRoomSlug("a12")).toBe("a12");
    expect(normalizeRoomSlug("abc12345678901234567")).toBe("abc12345678901234567");
  });

  it.each(["ab", "abc123456789012345678", " DTEC ", "minha sala", "café", "sala.nome", "sala_nome", "api", "AUTH", "www"])(
    "rejects an invalid or reserved ID: %s", (input) => {
      expect(() => normalizeRoomSlug(input)).toThrow();
    },
  );
});
