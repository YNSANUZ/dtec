import { beforeEach, expect, it, vi } from "vitest";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const state = vi.hoisted(() => ({ authenticated: true, complete: true, fail: "", actorPatch: {} as Record<string, unknown>, reads: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: state.authenticated ? ids[0] : undefined } }, error: null }) },
  from(table: string) {
    state.reads.push(table);
    let fields = "";
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const rows: Record<string, unknown>[] = table === "rooms" ? [{ slug: "amigos" }, { slug: "outra" }]
      : table === "room_member_presence" ? [{ room_slug: "amigos", user_id: ids[0] }, { room_slug: "amigos", user_id: ids[1] }, { room_slug: "outra", user_id: ids[2] }]
      : table === "room_staff" ? [{ room_slug: "amigos", user_id: ids[0], role: "owner" }, { room_slug: "outra", user_id: ids[1], role: "leader" }]
      : ids.filter((id) => state.complete || id !== ids[0]).map((id, i) => ({ user_id: id, display_name: ["Ana Silva", "Bruno Lima", "Eva Souza"][i], avatar_id: "a", title: "Infra", bio: "Biografia privada", birth_day_month: "10-02", whatsapp: "5561999999999", instagram: "ana.silva", email: "never@example.test", ...(id === ids[0] ? state.actorPatch : {}) }));
    const result = (single = false) => {
      const projected = rows.filter((r) => filters.every((f) => f(r))).map((r) => Object.fromEntries(fields.split(",").map((f) => [f.trim(), r[f.trim()]])));
      return { data: single ? projected[0] ?? null : projected, error: state.fail === table ? { message: "database failed" } : null };
    };
    const chain = {
      select(value: string) { fields = value; return chain; },
      eq(key: string, value: unknown) { filters.push((r) => r[key] === value); return chain; },
      in(key: string, values: unknown[]) { filters.push((r) => values.includes(r[key])); return chain; },
      maybeSingle: async () => result(true),
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return chain;
  },
}) }));

beforeEach(() => { state.authenticated = true; state.complete = true; state.fail = ""; state.actorPatch = {}; state.reads = []; });
const request = new Request("https://cubo.test/api/rooms/amigos/users");
async function list(slug = "amigos") {
  const { GET } = await import("@/app/api/rooms/[slug]/users/route");
  return GET(request, { params: Promise.resolve({ slug }) });
}
async function detail(id = ids[1], slug = "amigos") {
  const { GET } = await import("@/app/api/rooms/[slug]/users/[id]/route");
  return GET(request, { params: Promise.resolve({ slug, id }) });
}

it("lists only this room's members and roles, without contact or biography", async () => {
  const response = await list();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ users: [
    { userId: ids[0], name: "Ana Silva", avatar: "a", title: "Infra", role: "owner" },
    { userId: ids[1], name: "Bruno Lima", avatar: "a", title: "Infra", role: "member" },
  ] });
});
it("returns the clicked member's optional profile but not roles from another room or email", async () => {
  const response = await detail();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ user: { userId: ids[1], name: "Bruno Lima", avatar: "a", title: "Infra", role: "member", bio: "Biografia privada", birthDayMonth: "02/10", whatsapp: "5561999999999", instagram: "ana.silva" } });
});
it("does not disclose a global profile absent from the requested room", async () => {
  expect((await detail(ids[2])).status).toBe(404);
});
it("requires Google authentication and completed profile for both endpoints", async () => {
  state.authenticated = false;
  expect((await list()).status).toBe(401);
  expect((await detail()).status).toBe(401);
  expect(state.reads).toEqual([]);
  state.authenticated = true; state.complete = false;
  expect((await list()).status).toBe(401);
  expect((await detail()).status).toBe(401);
});
it("validates room and target identity and handles unavailable databases without profile data", async () => {
  expect((await list("doesnotexist")).status).toBe(404);
  expect((await list("bad.room")).status).toBe(400);
  expect((await detail("not-a-user")).status).toBe(400);
  for (const table of ["room_member_presence", "room_staff", "profiles"]) {
    state.fail = table;
    const response = await detail();
    expect(response.status).toBe(table === "profiles" ? 401 : 500);
    expect(await response.json()).not.toHaveProperty("user");
  }
});

it("denies legacy profiles that still need onboarding according to the global profile validator", async () => {
  for (const patch of [{ display_name: "Ana" }, { display_name: "A Silva" }, { avatar_id: "bad" }, { birth_day_month: "02-31" }]) {
    state.actorPatch = patch;
    expect((await list()).status).toBe(401);
    expect((await detail()).status).toBe(401);
  }
});
