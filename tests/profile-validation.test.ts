import { describe, expect, it } from "vitest";
import { normalizeProfile } from "@/lib/profile/validation";

describe("normalizeProfile", () => {
  it("trims the display name and limits it to 18 characters", () => {
    expect(normalizeProfile({ displayName: "  Maria de nome muito comprido  ", avatarId: "a" }))
      .toEqual({ displayName: "Maria de nome muit", avatarId: "a" });
  });

  it("rejects a blank display name", () => {
    expect(() => normalizeProfile({ displayName: "   ", avatarId: "a" })).toThrow("nome");
  });

  it.each(["a", "c", "f", "j", "n", "r"])("accepts avatar %s", (avatarId) => {
    expect(normalizeProfile({ displayName: "Colega", avatarId })).toEqual({
      displayName: "Colega",
      avatarId,
    });
  });

  it("rejects an unknown avatar", () => {
    expect(() => normalizeProfile({ displayName: "Colega", avatarId: "x" })).toThrow("personagem");
  });

  it("drops additional fields including a supplied user id", () => {
    expect(normalizeProfile({
      displayName: "Colega",
      avatarId: "r",
      user_id: "another-user",
      role: "admin",
    })).toEqual({ displayName: "Colega", avatarId: "r" });
  });
});
