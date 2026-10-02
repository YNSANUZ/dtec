import { describe, expect, it } from "vitest";
import { normalizeMuralMessage, normalizeMuralMessageId } from "@/lib/mural-validation";

describe("normalizeMuralMessage", () => {
  it("trims and accepts valid recados", () => {
    expect(normalizeMuralMessage({ content: "  Reunião às 14h  ", ignored: true })).toEqual({ content: "Reunião às 14h" });
  });

  it("rejects empty and overlong recados", () => {
    expect(() => normalizeMuralMessage({ content: "   " })).toThrow("Escreva um recado.");
    expect(() => normalizeMuralMessage({ content: "a".repeat(1001) })).toThrow("até 1000 caracteres");
  });

  it("accepts only UUID message identifiers", () => {
    expect(normalizeMuralMessageId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(() => normalizeMuralMessageId("not-a-uuid")).toThrow("Recado não encontrado.");
  });
});
