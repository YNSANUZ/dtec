import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "owner" as string | null, profileExists: true, inserted: [] as Record<string, unknown>[] }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } }, error: null })) },
    async rpc(name:string,args:{p_room_slug:string;p_user_id:string;p_enabled:boolean}){if(name==="get_room_member_since")return{data:[{joined_at:null,joined_at_quality:"legacy_unknown"}],error:null};expect(name).toBe("set_room_moderator");if(args.p_enabled)state.inserted.push({room_slug:args.p_room_slug,user_id:args.p_user_id,role:"leader",appointed_by:"11111111-1111-4111-8111-111111111111"});return{error:null};},
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let isInsert = false;
      let row: Record<string, unknown> = {};
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string, value: unknown) => { filters[column] = value; return chain; }),
        maybeSingle: vi.fn(async () => table==="rooms"?{data:{slug:"dtec"},error:null}:table==="room_memberships"?{data:{user_id:filters.user_id,status:"active"},error:null}:table === "room_staff"
          ? { data: filters.room_slug === "dtec" && state.role ? { role: state.role } : null, error: null }
          : { data: state.profileExists ? { user_id: filters.user_id, display_name: "Beto Lima", avatar_id: "c", title: "", bio: "", birth_day_month: null, whatsapp: "" } : null, error: null }),
        insert: vi.fn((value: Record<string, unknown>) => { isInsert = true; row = value; return chain; }),
        delete: vi.fn(() => chain),
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (isInsert) state.inserted.push(row);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  })),
}));

import { POST } from "@/app/api/room/users/[id]/leader/route";
import { GET as getProfile } from "@/app/api/room/users/[id]/route";

const targetId = "22222222-2222-4222-8222-222222222222";
const routeContext = { params: Promise.resolve({ id: targetId }) };
const makeRequest = (isLeader: boolean) => new Request(`https://dtec.test/api/room/users/${targetId}/leader`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ isLeader }),
});

describe("ADM moderator assignment API", () => {
  beforeEach(() => { state.role = "owner"; state.profileExists = true; state.inserted = []; });

  it("allows only ADM to assign MOD to an existing profile", async () => {
    const response = await POST(makeRequest(true), routeContext);
    expect(response.status).toBe(200);
    expect(state.inserted).toEqual([{ room_slug: "dtec", user_id: targetId, role: "leader", appointed_by: "11111111-1111-4111-8111-111111111111" }]);
  });

  it.each(["leader", null])("rejects appointment when actor role is %s", async (role) => {
    state.role = role;
    const response = await POST(makeRequest(true), routeContext);
    expect(response.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  it("does not attempt to grant MOD to a missing profile", async () => {
    state.profileExists = false;
    const response = await POST(makeRequest(true), routeContext);
    expect(response.status).toBe(404);
    expect(state.inserted).toHaveLength(0);
  });

  it("lets ADM revoke MOD from an existing profile", async () => {
    const response = await POST(makeRequest(false), routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, isLeader: false });
  });

  it("shows the DTEC role from room staff on a colleague profile", async () => {
    const response = await getProfile(new Request(`https://dtec.test/api/room/users/${targetId}`), routeContext);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { user: { role: string } }).user.role).toBe("owner");
  });
});
