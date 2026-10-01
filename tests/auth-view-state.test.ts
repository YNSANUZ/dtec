import { describe, expect, it } from "vitest";
import { resolveAuthViewState } from "@/lib/auth/view-state";

describe("resolveAuthViewState", () => {
  it("keeps private controls hidden while the session is loading", () => {
    expect(resolveAuthViewState({ loading: true, authenticated: false, hasProfile: false }))
      .toBe("loading");
  });

  it("keeps anonymous visitors in observation mode even if stale local profile data exists", () => {
    const staleLocalProfile = { name: "Antigo", avatar: "r" };
    expect(staleLocalProfile.name).toBe("Antigo");
    expect(resolveAuthViewState({ loading: false, authenticated: false, hasProfile: true }))
      .toBe("anonymous");
  });

  it("opens onboarding only for an authenticated account without a profile", () => {
    expect(resolveAuthViewState({ loading: false, authenticated: true, hasProfile: false }))
      .toBe("authenticated-needs-profile");
  });

  it("enables room interaction for an authenticated account with a profile", () => {
    expect(resolveAuthViewState({ loading: false, authenticated: true, hasProfile: true }))
      .toBe("ready");
  });

  it("returns to anonymous after logout clears authentication", () => {
    expect(resolveAuthViewState({ loading: false, authenticated: false, hasProfile: false }))
      .toBe("anonymous");
  });
});
