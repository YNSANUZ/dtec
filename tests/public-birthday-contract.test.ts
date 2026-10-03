import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profiles: [
    { user_id: "11111111-1111-4111-8111-111111111111", display_name: "Ana Silva", avatar_id: "a", birth_day_month: "10-02" },
    { user_id: "22222222-2222-4222-8222-222222222222", display_name: "Beto Lima", avatar_id: "c", birth_day_month: null },
  ],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: {} } })) },
    from(table: string) {
      const query = {
        select() { return query; },
        eq(){return query;},in(){return query;},
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const data = table === "profiles" ? state.profiles : table==="room_memberships"?state.profiles.map(row=>({room_slug:"dtec",user_id:row.user_id,status:"active"})):[];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: vi.fn(async () => ({ data: [{ user_id: state.profiles[0]?.user_id }], error: null })),
  })),
}));

import { GET } from "@/app/api/room/characters/route";

describe("public birthday character contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only a boolean birthday signal to anonymous visitors", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { users: Array<Record<string, unknown>> };
    expect(body.users[0]).toMatchObject({ birthdayToday: true });
    expect(body.users[1]).toMatchObject({ birthdayToday: false });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("birth_day_month");
    expect(serialized).not.toContain("10-02");
    expect(body.users[0]).not.toHaveProperty("birthday");
  });
});
