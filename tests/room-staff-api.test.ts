import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const leaderId = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  authenticated: true,
  actorId: "11111111-1111-4111-8111-111111111111",
  staff: [] as Array<{ room_slug: string; user_id: string; role: string; appointed_by?: string }>,
  profiles: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
}));

function client() {
  return {
    async rpc(name:string,args:{p_room_slug:string;p_user_id:string;p_enabled:boolean}){
      expect(name).toBe("set_room_moderator");
      if(args.p_enabled)state.staff.push({room_slug:args.p_room_slug,user_id:args.p_user_id,role:"leader",appointed_by:state.actorId});
      else state.staff=state.staff.filter(row=>!(row.room_slug===args.p_room_slug&&row.user_id===args.p_user_id&&row.role==="leader"));
      return {error:null};
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode = "select";
      let payload: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        insert(row: Record<string, unknown>) { mode = "insert"; payload = row; return chain; },
        delete() { mode = "delete"; return chain; },
        async maybeSingle() {
          if (table === "room_memberships") return {data:{status:"active"},error:null};
          if (table === "profiles") return { data: state.profiles.includes(String(filters.user_id)) ? { user_id: filters.user_id } : null, error: null };
          if (table === "rooms") return { data: ["dtec", "amigos", "outra"].includes(String(filters.slug)) ? { slug: filters.slug } : null, error: null };
          const found = state.staff.find((row) => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value));
          return { data: found ?? null, error: null };
        },
        then(resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === "room_staff" && mode === "insert") {
            state.staff.push(payload as (typeof state.staff)[number]);
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          if (table === "room_staff" && mode === "delete") {
            state.staff = state.staff.filter((row) => !Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value));
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: state.staff.filter((row) => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value)), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => state.authenticated ? { supabase: client(), userId: state.actorId, displayName: "Ana Silva" } : null),
}));

const request = (room: string, userId: string, method: "POST" | "DELETE") => new Request(`https://cubo.test/api/rooms/${room}/staff`, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId }),
});

describe("room staff API", () => {
  beforeEach(() => {
    state.authenticated = true;
    state.actorId = ownerId;
    state.staff = [{ room_slug: "amigos", user_id: ownerId, role: "owner" }];
  });

  it("appoints and removes a MOD only in the ADM's own room", async () => {
    const { POST, DELETE } = await import("@/app/api/rooms/[slug]/staff/route");
    const context = { params: Promise.resolve({ slug: "amigos" }) };
    expect((await POST(request("amigos", leaderId, "POST"), context)).status).toBe(200);
    expect(state.staff).toContainEqual({ room_slug: "amigos", user_id: leaderId, role: "leader", appointed_by: ownerId });
    expect((await DELETE(request("amigos", leaderId, "DELETE"), context)).status).toBe(200);
    expect(state.staff).toEqual([{ room_slug: "amigos", user_id: ownerId, role: "owner" }]);
  });

  it("returns only the actor's capabilities in the requested room", async () => {
    const { GET } = await import("@/app/api/rooms/[slug]/staff/route");
    const get = (slug: string) => GET(new Request(`https://cubo.test/api/rooms/${slug}/staff`), { params: Promise.resolve({ slug }) });
    expect(await (await get("amigos")).json()).toEqual({ role: "owner", canManage: true });
    expect(await (await get("outra")).json()).toEqual({ role: null, canManage: false });
    state.authenticated = false;
    expect((await get("amigos")).status).toBe(401);
  });

  it("rejects an ADM of another room and preserves its staff", async () => {
    const { POST } = await import("@/app/api/rooms/[slug]/staff/route");
    const result = await POST(request("outra", leaderId, "POST"), { params: Promise.resolve({ slug: "outra" }) });
    expect(result.status).toBe(403);
    expect(state.staff).toEqual([{ room_slug: "amigos", user_id: ownerId, role: "owner" }]);
  });

  it("does not let a visitor appoint a MOD or an owner be removed", async () => {
    const { POST, DELETE } = await import("@/app/api/rooms/[slug]/staff/route");
    const context = { params: Promise.resolve({ slug: "amigos" }) };
    state.authenticated = false;
    expect((await POST(request("amigos", leaderId, "POST"), context)).status).toBe(401);
    state.authenticated = true;
    expect((await DELETE(request("amigos", ownerId, "DELETE"), context)).status).toBe(403);
    expect(state.staff).toHaveLength(1);
  });
});
