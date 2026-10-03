import { describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const recent = new Date().toISOString();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: ownerId } }, error: null })) },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const rows = table === "profiles"
        ? [{ user_id: ownerId, display_name: "Ana Silva", avatar_id: "a", title: "ADM" }]
        : table === "room_memberships" ? [{room_slug:"dtec",user_id:ownerId,status:"active"}]
        : table === "room_presence"
          ? [{ user_id: ownerId, x: 0, z: 5, action: "idle", last_seen: recent }]
          : table === "room_staff"
            ? [{ room_slug: "dtec", user_id: ownerId, role: "owner" }, { room_slug: "outra", user_id: ownerId, role: "leader" }]
            : [];
      const chain = {
        select: () => chain,
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        in(column: string, values: unknown[]) { filters[column] = values; return chain; },
        gt() { return chain; },
        maybeSingle: async () => ({data: rows.find(row => Object.entries(filters).every(([key,value]) => row[key as keyof typeof row]===value))??null,error:null}),
        then(resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows.filter((row) => Object.entries(filters).every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key as keyof typeof row]) : row[key as keyof typeof row] === value)), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  })),
}));

import { GET as characters } from "@/app/api/room/characters/route";
import { GET as presence } from "@/app/api/room/presence/route";

describe("DTEC room role reads", () => {
  it("shows only the DTEC role on the character and online lists", async () => {
    const characterResponse = await characters();
    expect(characterResponse.status).toBe(200);
    expect(((await characterResponse.json()) as { users: Array<{ role: string }> }).users[0].role).toBe("owner");
    const presenceResponse = await presence();
    expect(presenceResponse.status).toBe(200);
    expect(((await presenceResponse.json()) as { users: Array<{ role: string }> }).users[0].role).toBe("owner");
  });
});
