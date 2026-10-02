import { describe, expect, it } from "vitest";
import { canAppointModerator, roleLabel } from "@/lib/room/roles";

describe("room role presentation and capability", () => {
  it("uses ADM and MOD labels while members have no badge", () => {
    expect(roleLabel("owner")).toBe("ADM");
    expect(roleLabel("leader")).toBe("MOD");
    expect(roleLabel("member")).toBe("");
  });

  it("only lets the ADM appoint moderators", () => {
    expect(canAppointModerator("owner")).toBe(true);
    expect(canAppointModerator("leader")).toBe(false);
    expect(canAppointModerator("member")).toBe(false);
  });
});
