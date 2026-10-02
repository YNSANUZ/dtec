import { describe, expect, it } from "vitest";
import { normalizeProfile } from "@/lib/profile/validation";

describe("normalizeProfile", () => {
  it("normalizes first and last names, optional details, and Brazilian WhatsApp", () => {
    expect(normalizeProfile({ displayName: "  Bruno   Leão  ", avatarId: "a", title: "  Infraestrutura ", whatsapp: "(61) 99999-0000" }))
      .toEqual({ displayName: "Bruno Leão", avatarId: "a", title: "Infraestrutura", bio: "", birthDayMonth: null, whatsapp: "5561999990000" });
  });

  it("requires exactly two names", () => {
    expect(() => normalizeProfile({ displayName: "Bruno", avatarId: "a" })).toThrow("dois nomes");
    expect(() => normalizeProfile({ displayName: "Bruno Leão Dias", avatarId: "a" })).toThrow("dois nomes");
  });

  it.each(["a", "c", "f", "j", "n", "r"])("accepts avatar %s", (avatarId) => {
    expect(normalizeProfile({ displayName: "Helio Filho", avatarId })).toMatchObject({ displayName: "Helio Filho", avatarId });
  });

  it("rejects an unknown avatar", () => {
    expect(() => normalizeProfile({ displayName: "Bruno Leão", avatarId: "x" })).toThrow("personagem");
  });

  it("stores birthday as month and day only, allowing leap day", () => {
    expect(normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", birthDayMonth: "05/10" }).birthDayMonth).toBe("10-05");
    expect(normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", birthDayMonth: "29/02" }).birthDayMonth).toBe("02-29");
    expect(() => normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", birthDayMonth: "31/04" })).toThrow("dia e mês válidos");
    expect(() => normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", birthDayMonth: "01/13" })).toThrow("dia e mês válidos");
    expect(() => normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", birthDayMonth: "2000-02-01" })).toThrow("DD/MM");
  });

  it("rejects invalid phone numbers", () => {
    expect(() => normalizeProfile({ displayName: "Bruno Leão", avatarId: "a", whatsapp: "123" })).toThrow("WhatsApp");
  });

  it("drops privileged fields sent by a client", () => {
    expect(normalizeProfile({ displayName: "Bruno Leão", avatarId: "r", user_id: "another-user", role: "owner", isLeader: true }))
      .toEqual({ displayName: "Bruno Leão", avatarId: "r", title: "", bio: "", birthDayMonth: null, whatsapp: "" });
  });
});
