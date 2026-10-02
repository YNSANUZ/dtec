import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  authenticated: true,
  reaction: null as string | null,
  messages: [{ id: "33333333-3333-4333-8333-333333333333", room_slug: "dtec", author_id: "11111111-1111-4111-8111-111111111111", content: "Aviso", is_pinned: false, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" }],
  profiles: [
    { user_id: "11111111-1111-4111-8111-111111111111", display_name: "Ana Silva", avatar_id: "a" },
    { user_id: "22222222-2222-4222-8222-222222222222", display_name: "Beto Lima", avatar_id: "c" },
  ],
}));

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => state.authenticated ? { userId: state.userId, displayName: "Ana Silva", supabase: fakeSupabase() } : null),
}));

function fakeSupabase() {
  const dataFor = (table: string) => table === "mural_messages" ? state.messages
    : table === "profiles" ? state.profiles
    : table === "mural_message_reactions" ? (state.reaction ? [{ message_id: state.messages[0]?.id, user_id: "11111111-1111-4111-8111-111111111111", reaction: state.reaction }] : [])
    : [];
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { filters[field] = value; return query; },
        in(field: string, value: unknown[]) { filters[field] = value; return query; },
        order() { return query; },
        limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: dataFor(table).find((row) => Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)) ?? null, error: null }); },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = dataFor(table).filter((row) => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes((row as Record<string, unknown>)[key]) : (row as Record<string, unknown>)[key] === value));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string) {
      if (name === "toggle_mural_reaction") state.reaction = state.reaction === "like" ? null : "like";
      if (name === "clear_mural_reaction") state.reaction = null;
      const summary = [{ message_id: state.messages[0]?.id, like_count: state.reaction === "like" ? 1 : 0, dislike_count: state.reaction === "dislike" ? 1 : 0, my_reaction: state.reaction }];
      return { data: name === "get_mural_reaction_summary" ? summary : state.reaction, error: null };
    },
  };
}

import { GET as getMessages } from "@/app/api/mural/messages/route";
import { DELETE, GET, PUT } from "@/app/api/mural/messages/[id]/reactions/route";

const messageId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: messageId }) };
const request = (url: string, body?: unknown, method = body === undefined ? "GET" : "PUT") => new Request(url, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe("mural reaction APIs", () => {
  beforeEach(() => { state.authenticated = true; state.reaction = null; });

  it("denies anonymous access to counts, reaction lists, and mutations", async () => {
    state.authenticated = false;
    expect((await getMessages()).status).toBe(401);
    expect((await GET(request(`https://dtec.test/api/mural/messages/${messageId}/reactions?type=like`), context)).status).toBe(401);
    expect((await PUT(request(`https://dtec.test/api/mural/messages/${messageId}/reactions`, { reaction: "like" }), context)).status).toBe(401);
  });

  it("returns only the requested type's people in the separate list endpoint", async () => {
    state.reaction = "like";
    const response = await GET(request(`https://dtec.test/api/mural/messages/${messageId}/reactions?type=like`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ people: [{ userId: state.userId, name: "Ana Silva", avatar: "a" }], count: 1 });
    expect((await GET(request(`https://dtec.test/api/mural/messages/${messageId}/reactions?type=all`), context)).status).toBe(400);
    state.reaction = "dislike";
    const dislikes = await GET(request(`https://dtec.test/api/mural/messages/${messageId}/reactions?type=dislike`), context);
    expect(await dislikes.json()).toMatchObject({ people: [{ userId: state.userId, name: "Ana Silva" }], count: 1 });
  });

  it("adds only counts and caller state to cards, never names lists; toggle responds with current state", async () => {
    const feed = await getMessages();
    const feedBody = await feed.json() as { messages: Array<Record<string, unknown>> };
    expect(feedBody.messages[0]).toMatchObject({ likeCount: 0, dislikeCount: 0, myReaction: null });
    expect(feedBody.messages[0]).not.toHaveProperty("people");
    const updated = await PUT(request(`https://dtec.test/api/mural/messages/${messageId}/reactions`, { reaction: "like" }), context);
    expect(await updated.json()).toMatchObject({ likeCount: 1, dislikeCount: 0, myReaction: "like" });
    expect((await PUT(request(`https://dtec.test/api/mural/messages/${messageId}/reactions`, { reaction: "other" }), context)).status).toBe(400);
    const cleared = await DELETE(request(`https://dtec.test/api/mural/messages/${messageId}/reactions`, undefined, "DELETE"), context);
    expect(await cleared.json()).toMatchObject({ likeCount: 0, dislikeCount: 0, myReaction: null });
  });

  it("rejects malformed message ids before querying storage", async () => {
    const malformed = { params: Promise.resolve({ id: "not-a-uuid" }) };
    expect((await GET(request("https://dtec.test/api/mural/messages/not-a-uuid/reactions?type=like"), malformed)).status).toBe(400);
  });
});
