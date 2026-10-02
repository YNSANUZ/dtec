import { describe, expect, it } from "vitest";
import { normalizeFundraiser } from "@/lib/fundraisers/validation";

describe("normalizeFundraiser", () => {
  it("trims text, defaults optional fields, and preserves a fixed amount in cents", () => {
    expect(normalizeFundraiser({ title: "  Aniversário  ", monthlyAmountCents: 2500, dueDay: 10, pixKey: "  chave-pix  " })).toEqual({
      title: "Aniversário",
      description: "",
      monthlyAmountCents: 2500,
      dueDay: 10,
      pixKey: "chave-pix",
      paymentInstructions: "",
    });
  });

  it("converts a blank Pix key to null without exposing it in error text", () => {
    expect(normalizeFundraiser({ title: "Evento", monthlyAmountCents: 1000, dueDay: 1, pixKey: "  " }).pixKey).toBeNull();
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents: -1000, dueDay: 1, pixKey: "private-key" })).toThrow("valor mensal fixo por pessoa");
  });

  it.each([0, -1, 1.5, "1000", Number.MAX_SAFE_INTEGER + 1])("rejects invalid monthly amount %s", (monthlyAmountCents) => {
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents, dueDay: 1 })).toThrow();
  });

  it.each([0, 32, 1.5, "5"]) ("rejects invalid due day %s", (dueDay) => {
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents: 1000, dueDay })).toThrow("dia de vencimento");
  });

  it("rejects missing title and text fields over their bounds", () => {
    expect(() => normalizeFundraiser({ monthlyAmountCents: 1000, dueDay: 5 })).toThrow();
    expect(() => normalizeFundraiser({ title: "x".repeat(101), monthlyAmountCents: 1000, dueDay: 5 })).toThrow();
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents: 1000, dueDay: 5, description: "x".repeat(1501) })).toThrow();
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents: 1000, dueDay: 5, pixKey: "x".repeat(201) })).toThrow();
    expect(() => normalizeFundraiser({ title: "Evento", monthlyAmountCents: 1000, dueDay: 5, paymentInstructions: "x".repeat(1001) })).toThrow();
  });
});
