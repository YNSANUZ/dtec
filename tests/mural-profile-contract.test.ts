import { beforeEach, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const userId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  configured: true, authenticated: true, claimsError: false, profileError: false,
  profile: null as Row | null,
  reads: [] as string[], selections: [] as string[], filters: [] as Row[], writes: [] as Row[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => state.configured ? {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: state.authenticated ? { sub: userId } : null },
        error: state.claimsError ? { message: "invalid session" } : null,
      })),
    },
    from(table: string) {
      state.reads.push(table);
      let fields = "";
      const filters: Row = {};
      const project = (row: Row) => Object.fromEntries(fields.split(",").map((field) => [field.trim(), row[field.trim()]]));
      const query = {
        select(value: string) { fields = value; state.selections.push(value); return query; },
        eq(key: string, value: unknown) { filters[key] = value; state.filters.push({ table, key, value }); return query; },
        order() { return query; }, limit() { return query; },
        insert(payload: Row) { state.writes.push({ table, ...payload }); return query; },
        async maybeSingle() {
          const row = table === "profiles" ? state.profile : table==="room_memberships"?{status:"active"}:{ slug: filters.slug };
          return { data: row ? project(row) : null, error: table === "profiles" && state.profileError ? { message: "failed" } : null };
        },
        async single() { return { data: { id: "message", author_id: userId, content: "QA", created_at: "2026-10-03T00:00:00Z" }, error: null }; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return query;
    },
  } : null),
}));

import { getMuralUserContext } from "@/lib/mural-server";
import { GET as readProfile } from "@/app/api/profile/route";
import { GET as readFundraisers } from "@/app/api/rooms/[slug]/fundraisers/route";
import { GET as readDtecFundraisers } from "@/app/api/fundraisers/route";
import { GET as readChat, POST as sendChat } from "@/app/api/rooms/[slug]/chat/route";
import { POST as sendNotice } from "@/app/api/rooms/[slug]/mural/messages/route";

const context = { params: Promise.resolve({ slug: "amigos" }) };
const request = (body?: unknown) => new Request("https://qa.invalid/api/rooms/amigos/fundraisers", {
  method: body ? "POST" : "GET",
  ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
});
const read = () => readFundraisers(request(), context);

beforeEach(() => {
  state.configured = state.authenticated = true;
  state.claimsError = state.profileError = false;
  state.profile = { user_id: userId, display_name: "Ana Silva", avatar_id: "a", title: "", bio: "", birth_day_month: null, whatsapp: "", instagram: "" };
  state.reads = []; state.selections = []; state.filters = []; state.writes = [];
});

it("uses the onboarding decision for an incomplete legacy profile on generic and DTEC routes", async () => {
  state.profile!.display_name = "Ana";
  expect(await (await readProfile()).json()).toEqual({ profile: null });
  expect((await read()).status).toBe(401);
  expect((await readDtecFundraisers()).status).toBe(401);
  expect(state.reads.every((table) => table === "profiles")).toBe(true);
});

it.each([
  { display_name: "Ana Maria Silva" }, { display_name: "A Silva" }, { display_name: "Ana S" },
  { avatar_id: "unknown" }, { birth_day_month: "02-31" }, { whatsapp: "123" }, { instagram: "bad handle" },
])("rejects the same malformed profile fields as onboarding: %j", async (patch) => {
  Object.assign(state.profile!, patch);
  expect(await (await readProfile()).json()).toEqual({ profile: null });
  expect(await getMuralUserContext()).toBeNull();
});

it("denies chat and notice writes before parsing or inserting when onboarding is required", async () => {
  state.profile!.display_name = "Ana";
  expect((await sendChat(request({ text: "QA" }), context)).status).toBe(401);
  expect((await sendNotice(request({ content: "QA" }), context)).status).toBe(401);
  expect(state.writes).toEqual([]);
});

it("keeps valid profiles, authenticated identity and minimal returned context", async () => {
  const access = await getMuralUserContext();
  expect(access).toMatchObject({ userId, displayName: "Ana Silva" });
  expect(Object.keys(access!)).toEqual(["supabase", "userId", "displayName"]);
  expect(state.filters).toContainEqual({ table: "profiles", key: "user_id", value: userId });
  expect(state.selections).not.toContain("*");
  expect((await read()).status).toBe(200);
  expect((await readDtecFundraisers()).status).toBe(200);
});

it("allows absent optional fields and a leap-day birthday just like onboarding", async () => {
  state.profile = { user_id: userId, display_name: "Ana Silva", avatar_id: "r", birth_day_month: "02-29" };
  expect((await readProfile()).status).toBe(200);
  expect(await getMuralUserContext()).not.toBeNull();
});

it.each(["anonymous", "claimsError", "unconfigured", "missingProfile", "profileError"])("fails closed for %s", async (failure) => {
  if (failure === "anonymous") state.authenticated = false;
  if (failure === "claimsError") state.claimsError = true;
  if (failure === "unconfigured") state.configured = false;
  if (failure === "missingProfile") state.profile = null;
  if (failure === "profileError") state.profileError = true;
  expect(await getMuralUserContext()).toBeNull();
  expect((await read()).status).toBe(401);
  expect(state.writes).toEqual([]);
});

it("does not change the public chat GET when the visitor has no completed profile", async () => {
  state.authenticated = false; state.profile = null;
  expect((await readChat(request(), context)).status).toBe(200);
  expect(state.reads).toEqual(["room_chat_messages"]);
  expect(state.writes).toEqual([]);
});
