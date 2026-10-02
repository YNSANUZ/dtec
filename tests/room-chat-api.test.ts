import { beforeEach, describe, expect, it, vi } from "vitest";

const memberId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  authorized: true,
  readSlug: "",
  saved: [] as Array<{ room_slug: string; author_id: string; content: string }>,
  rows: [
    { id: "old", author_id: "11111111-1111-4111-8111-111111111111", content: "Primeira", created_at: "2026-10-02T10:00:00Z" },
    { id: "new", author_id: "22222222-2222-4222-8222-222222222222", content: "Segunda", created_at: "2026-10-02T10:00:01Z" },
  ],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from(table: string) {
      let row: { room_slug: string; author_id: string; content: string } | null = null;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((field: string, value: string) => { if (field === "room_slug") state.readSlug = value; return chain; }),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({ data: [...state.rows].reverse(), error: null })),
        in: vi.fn(async () => ({ data: [
          { user_id: "11111111-1111-4111-8111-111111111111", display_name: "Ana Silva" },
          { user_id: "22222222-2222-4222-8222-222222222222", display_name: "Beto Lima" },
        ], error: null })),
        insert: vi.fn((value: { room_slug: string; author_id: string; content: string }) => { row = value; return chain; }),
        single: vi.fn(async () => {
          if (table !== "room_chat_messages" || !row) return { data: null, error: { message: "bad insert" } };
          state.saved.push(row);
          return { data: { id: "sent", ...row, created_at: "2026-10-02T10:00:02Z" }, error: null };
        }),
      };
      return chain;
    },
  })),
}));

vi.mock("@/lib/mural-server", async () => {
  const server = await import("@/lib/supabase/server");
  return { getMuralUserContext: vi.fn(async () => state.authorized ? {
    supabase: await server.createServerSupabaseClient(), userId: memberId, displayName: "Ana Silva",
  } : null) };
});

import { GET, POST } from "@/app/api/room/chat/route";
import { GET as GET_ROOM, POST as POST_ROOM } from "@/app/api/rooms/[slug]/chat/route";

const request = (text: unknown) => new Request("https://dtec.test/api/room/chat", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
});

describe("room chat API", () => {
  beforeEach(() => { state.authorized = true; state.saved = []; state.readSlug = ""; });

  it("returns the last messages oldest-first with current public names", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json() as { messages: Array<{ id: string; name: string }> };
    expect(body.messages.map((message) => [message.id, message.name])).toEqual([
      ["old", "Ana Silva"], ["new", "Beto Lima"],
    ]);
  });

  it("rejects anonymous and invalid messages", async () => {
    state.authorized = false;
    expect((await POST(request("Olá"))).status).toBe(401);
    state.authorized = true;
    expect((await POST(request(" "))).status).toBe(400);
    expect((await POST(request("x".repeat(101)))).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("stores only the signed-in member's trimmed message", async () => {
    const response = await POST(request(" Olá, equipe! "));
    expect(response.status).toBe(201);
    expect(state.saved).toEqual([{ room_slug: "dtec", author_id: memberId, content: "Olá, equipe!" }]);
    const body = await response.json() as { message: { authorId: string; name: string; text: string } };
    expect(body.message).toMatchObject({ authorId: memberId, name: "Ana Silva", text: "Olá, equipe!" });
  });

  it("uses the requested room for reads and writes without falling back to DTEC", async () => {
    const params = Promise.resolve({ slug: "amigos" });
    expect((await GET_ROOM(new Request("https://cubo.test/api/rooms/amigos/chat"), { params })).status).toBe(200);
    expect(state.readSlug).toBe("amigos");
    expect((await POST_ROOM(request("Oi"), { params })).status).toBe(201);
    expect(state.saved).toEqual([{ room_slug: "amigos", author_id: memberId, content: "Oi" }]);
    expect((await GET_ROOM(new Request("https://cubo.test/api/rooms/dtec.1/chat"), { params: Promise.resolve({ slug: "dtec.1" }) })).status).toBe(400);
  });
});
