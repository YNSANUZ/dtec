import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ context: null as { supabase: unknown; userId: string; displayName: string } | null }));

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => authState.context),
}));

import { DELETE, GET, POST } from "@/app/api/events/[id]/interest/route";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

type EventRow = { id: string; status: string };
type PersonRow = { user_id: string; display_name: string; avatar_id: string; title: string };

function makeSupabase(event: EventRow | null, people: PersonRow[] = [], existing: string[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const deleted: Record<string, unknown> = {};
  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode = "select";
      let insertRow: Record<string, unknown> = {};
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        in(column: string, values: unknown[]) { filters[column] = values; return chain; },
        order() { return chain; },
        insert(row: Record<string, unknown>) { mode = "insert"; insertRow = row; return chain; },
        delete() { mode = "delete"; return chain; },
        maybeSingle: async () => ({ data: table === "room_events" ? event : null, error: null }),
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (mode === "insert") {
            inserted.push(insertRow);
            const duplicate = existing.includes(String(insertRow.user_id));
            return Promise.resolve({ data: null, error: duplicate ? { code: "23505" } : null }).then(resolve, reject);
          }
          if (mode === "delete") {
            Object.assign(deleted, filters);
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          if (table === "room_event_interests") {
            const ids = Array.isArray(filters.user_id) ? filters.user_id : existing;
            return Promise.resolve({ data: ids.map((id) => ({ user_id: id })), error: null }).then(resolve, reject);
          }
          if (table === "profiles") {
            const ids = Array.isArray(filters.user_id) ? filters.user_id : [];
            return Promise.resolve({ data: people.filter((person) => ids.includes(person.user_id)), error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return { supabase, inserted, deleted };
}

function setContext(event: EventRow | null = { id: eventId, status: "open" }, people: PersonRow[] = [], existing: string[] = []) {
  const state = makeSupabase(event, people, existing);
  authState.context = { supabase: state.supabase, userId, displayName: "Ana Silva" };
  return state;
}

const routeContext = { params: Promise.resolve({ id: eventId }) };
const request = (method: string, body?: unknown) => new Request(`https://dtec.test/api/events/${eventId}/interest`, {
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("event interest API contract", () => {
  beforeEach(() => { authState.context = null; });

  it("requires a completed Google-authenticated profile and reveals no roster to anonymous visitors", async () => {
    const response = await GET(request("GET"), routeContext);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects adding interest for a closed event", async () => {
    const { inserted } = setContext({ id: eventId, status: "closed" });
    const response = await POST(request("POST"), routeContext);
    expect(response.status).toBe(409);
    expect(inserted).toHaveLength(0);
  });

  it("derives interest identity from the session, ignoring a tampered user id", async () => {
    const { inserted } = setContext();
    const response = await POST(request("POST", { userId: "99999999-9999-4999-8999-999999999999" }), routeContext);
    expect(response.status).toBe(200);
    expect(inserted).toEqual([{ event_id: eventId, user_id: userId }]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("treats a duplicate add as successful and idempotent", async () => {
    const { inserted } = setContext({ id: eventId, status: "open" }, [], [userId]);
    const response = await POST(request("POST"), routeContext);
    expect(response.status).toBe(200);
    expect(inserted).toHaveLength(1);
  });

  it("returns only display data for roster members, plus the current user's interest state", async () => {
    setContext({ id: eventId, status: "open" }, [{ user_id: userId, display_name: "Ana Silva", avatar_id: "a", title: "Analista" }], [userId]);
    const response = await GET(request("GET"), routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ interested: [{ userId, name: "Ana Silva", avatar: "a", title: "Analista" }], isInterested: true });
  });

  it("deletes only the current user's interest", async () => {
    const { deleted } = setContext();
    const response = await DELETE(request("DELETE"), routeContext);
    expect(response.status).toBe(200);
    expect(deleted).toEqual({ event_id: eventId, user_id: userId });
  });
});
