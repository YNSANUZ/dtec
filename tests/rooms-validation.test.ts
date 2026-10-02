import { describe, expect, it } from "vitest";
import { normalizeNewRoom } from "@/lib/rooms/validation";

describe("new room validation", () => {
  it("normalizes a public room", () => {
    expect(normalizeNewRoom({ slug: "MinhaSala2", title: "  Minha sala ", description: "  Amigos  ", created_by: "forged" }))
      .toEqual({ slug: "minhasala2", title: "Minha sala", description: "Amigos" });
  });

  it("rejects invalid names and room IDs", () => {
    expect(() => normalizeNewRoom({ slug: "x1", title: "Sala" })).toThrow("ID");
    expect(() => normalizeNewRoom({ slug: "minhasala", title: "x" })).toThrow("nome");
  });
});
