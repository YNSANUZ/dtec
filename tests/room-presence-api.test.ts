import { beforeEach, describe, expect, it, vi } from "vitest";

const memberId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  signedIn: true,
  lastSeenAge: 0,
  queried: [] as string[],
  saved: [] as Array<{ room_slug: string; user_id: string; x: number; z: number; action: string }>,
  birthdayIds: [] as string[], birthdayError: false, birthdayCalls: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: async () => ({ data: { claims: state.signedIn ? { sub: memberId } : {} }, error: null }) },
    rpc: async (name: string) => { expect(name).toBe("birthday_today_user_ids"); state.birthdayCalls++; return { data: state.birthdayIds.map(user_id => ({ user_id })), error: state.birthdayError ? { message: "Unavailable" } : null }; },
    from(table: string) {
      const filters:Record<string,unknown>={};
      const run=()=>{
        const rows:Record<string,unknown>[]=table==="room_member_presence"?[{room_slug:"amigos",user_id:memberId,x:2,z:3,action:"walk",last_seen:new Date(Date.now()-state.lastSeenAge).toISOString()}]:table==="room_memberships"?[{room_slug:"amigos",user_id:memberId,status:"active"}]:table==="profiles"?[{user_id:memberId,display_name:"Ana Silva",avatar_id:"a"}]:[];
        return {data:rows.filter(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):value===row[key])),error:null};
      };
      const query={
        select:()=>query,
        eq(field:string,value:unknown){filters[field]=value;if(table==="room_member_presence"&&field==="room_slug")state.queried.push(String(value));return query;},
        in(field:string,value:unknown[]){filters[field]=value;return query;},
        then(resolve:(value:unknown)=>unknown,reject?:(reason:unknown)=>unknown){return Promise.resolve(run()).then(resolve,reject);},
        async upsert(row:{room_slug:string;user_id:string;x:number;z:number;action:string}){if(table==="room_member_presence")state.saved.push(row);return{error:null};}
      };return query;
    },
  })),
}));

import { GET, POST } from "@/app/api/rooms/[slug]/presence/route";

const context = (slug: string) => ({ params: Promise.resolve({ slug }) });
const post = (body: unknown) => new Request("https://cubo.test/api/rooms/amigos/presence", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("room-specific presence API", () => {
  beforeEach(() => { state.signedIn = true; state.lastSeenAge = 0; state.queried = []; state.saved = []; state.birthdayIds = []; state.birthdayError = false; state.birthdayCalls = 0; });

  it("gives anonymous visitors only a birthday boolean for persisted members in this room, even offline", async () => {
    state.signedIn = false; state.lastSeenAge = 86400000; state.birthdayIds = [memberId, "foreign-member"];
    const response = await GET(new Request("https://cubo.test/api/rooms/amigos/presence"), context("amigos"));
    const body = await response.json() as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(1); expect(body.users[0]).toMatchObject({ birthdayToday: true, online: false, action: "idle" });
    expect(JSON.stringify(body)).not.toMatch(/birth_day_month|birthDayMonth|foreign-member|whatsapp|email/);
    expect(state.saved).toEqual([]);
  });

  it("does not invent a negative signal on RPC failure and skips RPC for an empty room", async () => {
    state.birthdayError = true;
    expect((await GET(new Request("https://cubo.test/api/rooms/amigos/presence"), context("amigos"))).status).toBe(500);
    state.birthdayCalls = 0;
    expect(await (await GET(new Request("https://cubo.test/api/rooms/outra/presence"), context("outra"))).json()).toEqual({ users: [] });
    expect(state.birthdayCalls).toBe(0);
  });

  it("reads only the requested room and marks a recent character online", async () => {
    const response = await GET(new Request("https://cubo.test/api/rooms/amigos/presence"), context("amigos"));
    expect(response.status).toBe(200);
    expect(state.queried).toEqual(["amigos"]);
    const body = await response.json() as { users: Array<{ name: string; x: number; online: boolean }> };
    expect(body.users).toMatchObject([{ name: "Ana Silva", x: 2, online: true }]);
    const other = await GET(new Request("https://cubo.test/api/rooms/outra/presence"), context("outra"));
    expect((await other.json() as { users: unknown[] }).users).toEqual([]);
    expect(state.queried).toEqual(["amigos", "outra"]);
  });

  it("publishes only the authenticated user's position in the requested room", async () => {
    expect((await POST(post({ x: 4, z: 5, action: "sit", user_id: "forged", room_slug: "dtec" }), context("amigos"))).status).toBe(204);
    expect(state.saved).toMatchObject([{ room_slug: "amigos", user_id: memberId, x: 4, z: 5, action: "sit" }]);
    state.signedIn = false;
    expect((await POST(post({ x: 4, z: 5, action: "sit" }), context("amigos"))).status).toBe(401);
  });

  it("rejects invalid coordinates and IDs", async () => {
    expect((await POST(post({ x: 99, z: 5, action: "walk" }), context("amigos"))).status).toBe(400);
    expect((await GET(new Request("https://cubo.test/api/rooms/a1/presence"), context("a1"))).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("keeps an offline member's character and saved position visible to anonymous visitors", async () => {
    state.signedIn = false;
    state.lastSeenAge = 24 * 60 * 60 * 1000;
    const response = await GET(new Request("https://cubo.test/api/rooms/amigos/presence"), context("amigos"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [{ userId: memberId, name: "Ana Silva", avatar: "a", x: 2, z: 3, action: "idle", online: false, birthdayToday: false, message: "" }] });
    expect(state.saved).toEqual([]);
  });
});
