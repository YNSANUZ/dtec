import { describe, expect, it } from "vitest";
import { canModerateMember, canReadNote, hasPermission, roleIdentity, roomPermissions, type CuboRole } from "@/lib/rooms/permissions";
describe("CuboChat permission ceilings", () => {
  for (const role of ["owner", "leader", "member", "visitor"] as CuboRole[]) {
    for (const rule of roomPermissions) {
      it(`${role}: ${rule.id}`, () => expect(hasPermission(role, rule.id)).toBe((rule.roles as readonly CuboRole[]).includes(role)));
    }
  }
  it("only the proprietor removes panels and grants roles", () => {
    expect(hasPermission("owner", "removePanel")).toBe(true);
    expect(hasPermission("leader", "removePanel")).toBe(false);
    expect(hasPermission("leader", "appoint")).toBe(false);
    expect(hasPermission(null, "createNote")).toBe(false);
  });
  it("does not mistake titles or emojis for roles", () => {
    expect(roleIdentity.leader).toBe("🛡️ MOD");
    expect(hasPermission("DEV" as CuboRole, "createPanel")).toBe(false);
    expect(hasPermission("👑 ADM" as CuboRole, "appoint")).toBe(false);
  });
  it("never moderates another staff member or a visitor as if they were members", () => {
    expect(canModerateMember("leader", "member")).toBe(true);
    for (const target of ["leader", "owner", "visitor"] as CuboRole[]) expect(canModerateMember("leader", target)).toBe(false);
    expect(canModerateMember("member", "member")).toBe(false);
  });
  it("private notes do not become readable merely because the reader manages the room", () => {
    expect(canReadNote("admin", "author", "private", true, true)).toBe(false);
    expect(canReadNote("author", "author", "private", true, true)).toBe(true);
    expect(canReadNote(null, "author", "team", false, true)).toBe(false);
    expect(canReadNote(null, "author", "public", false, true)).toBe(false);
    expect(hasPermission("visitor", "readPublic")).toBe(false);
    expect(canReadNote(null, "author", "public", false, false)).toBe(false);
  });
});
