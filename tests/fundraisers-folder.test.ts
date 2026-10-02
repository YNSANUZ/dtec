import { describe, expect, it } from "vitest";
import { canChangeFundraiserPayment, fundraiserFolderState, toFundraiserCardViewModel } from "@/lib/fundraisers/presentation";

const campaign = {
  id: "campaign-1",
  title: "Passeio da equipe",
  description: "Contribuição mensal.",
  monthlyAmountCents: 2500,
  dueDay: 10,
  pixKey: "chave-pix",
  paymentInstructions: "Pague até o vencimento.",
  currentCycleDueDate: "2026-10-10",
  isParticipant: true,
  paid: [{ userId: "u1", name: "Ana Silva", avatar: "a", title: "ADM", markedAt: "2026-10-01T12:00:00Z" }],
  pending: [{ userId: "u2", name: "Beto Lima", avatar: "c", title: "", markedAt: null }],
};

describe("fundraiser folder presentation", () => {
  it("formats fixed per-person amount and due information without an aggregate", () => {
    const view = toFundraiserCardViewModel(campaign);
    expect(view.monthlyAmountLabel).toBe("R$ 25,00");
    expect(view.dueDayLabel).toBe("Vence todo dia 10");
    expect(view.currentCycleDueDateLabel).toBe("10 de out. de 2026");
    expect(view.pixKey).toBe("chave-pix");
    expect(Object.keys(view)).not.toContain("totalCollected");
    expect(Object.keys(view)).not.toContain("remainingAmount");
  });

  it("keeps paid and pending people in their separate lists", () => {
    const view = toFundraiserCardViewModel({ ...campaign, paid: [...campaign.paid, { ...campaign.paid[0]!, userId: "u3", name: "Zeca Alves" }] });
    expect(view.paid.map((person) => person.name)).toEqual(["Ana Silva", "Zeca Alves"]);
    expect(view.pending.map((person) => person.name)).toEqual(["Beto Lima"]);
    expect(view.pending[0]?.markedAt).toBeNull();
  });

  it("permits a person to mark only their own payment unless they are ADM/MOD", () => {
    expect(canChangeFundraiserPayment("u1", false, "u1")).toBe(true);
    expect(canChangeFundraiserPayment("u1", false, "u2")).toBe(false);
    expect(canChangeFundraiserPayment("u1", true, "u2")).toBe(true);
    expect(canChangeFundraiserPayment(null, true, "u2")).toBe(false);
  });

  it("distinguishes login-required, loading, empty, error, and ready states", () => {
    expect(fundraiserFolderState({ currentUserId: null, loading: true, error: "", count: 0 })).toBe("auth-required");
    expect(fundraiserFolderState({ currentUserId: "u1", loading: true, error: "", count: 0 })).toBe("loading");
    expect(fundraiserFolderState({ currentUserId: "u1", loading: false, error: "", count: 0 })).toBe("empty");
    expect(fundraiserFolderState({ currentUserId: "u1", loading: false, error: "offline", count: 1 })).toBe("error");
    expect(fundraiserFolderState({ currentUserId: "u1", loading: false, error: "", count: 1 })).toBe("ready");
  });
});
