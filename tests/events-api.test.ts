import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ context: null as { supabase: unknown; userId: string; displayName: string } | null }));

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => authState.context),
}));

import { GET, POST } from "@/app/api/events/route";
import { PATCH } from "@/app/api/events/[id]/route";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

type EventRow = {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  starts_at?: string | null;
  location?: string;
  status?: string;
  created_by?: string;
};
type InterestRow = { event_id: string };
type FakeResult = { data: unknown; error: null };
type FakeQuery = {
  select: (...columns: string[]) => FakeQuery;
  eq: (column: string, value: unknown) => FakeQuery;
  in: (column: string, values: unknown[]) => FakeQuery;
  order: (column: string, options?: unknown) => FakeQuery;
  insert: (row: EventRow) => FakeQuery;
  update: (row: Record<string, unknown>) => FakeQuery;
  maybeSingle: () => Promise<FakeResult>;
  single: () => Promise<FakeResult>;
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeSupabase(role: string | null, events: EventRow[] = [], interests: InterestRow[] = []) {
  const inserted: Record<string, unknown>[] = [];
  let updated: Record<string, unknown> | null = null;
  const supabase = {
    from(table: string) {
      let mode = "select";
      let mutation: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const chain: FakeQuery = {
        select() { return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        in(column: string, values: unknown[]) { filters[column] = values; return chain; },
        order() { return chain; },
        insert(row: EventRow) { mode = "insert"; mutation = row; return chain; },
        update(row: Record<string, unknown>) { mode = "update"; mutation = row; return chain; },
        maybeSingle() {
          if (table === "room_roles") return Promise.resolve({ data: role ? { role } : null, error: null });
          if (table === "room_events" && mode === "update") {
            updated = { id: filters.id, ...mutation };
          }
          return Promise.resolve({ data: updated, error: null });
        },
        single() {
          const row = { id: eventId, status: "open", ...mutation };
          inserted.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === "room_events" && mode === "select") {
            const rows = events.filter((event) => !filters.status || event.status === filters.status);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
          if (table === "room_event_interests") {
            const ids = Array.isArray(filters.event_id) ? filters.event_id : [];
            return Promise.resolve({ data: interests.filter((row) => ids.includes(row.event_id)), error: null }).then(resolve, reject);
          }
          if (table === "room_events" && mode === "update") {
            updated = { id: filters.id, ...mutation };
            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return { supabase, inserted };
}

function setContext(role: string | null, events: EventRow[] = [], interests: InterestRow[] = []) {
  const state = makeSupabase(role, events, interests);
  authState.context = { supabase: state.supabase, userId, displayName: "Ana Silva" };
  return state;
}

function request(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return new Request(`https://dtec.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("event API access and identity", () => {
  beforeEach(() => { authState.context = null; });

  it("rejects anonymous requests without returning event data", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects event writes from a regular member", async () => {
    setContext("member");
    const createResponse = await POST(request("/api/events", { title: "Kart", category: "kart" }));
    const patchResponse = await PATCH(request("/api/events/22222222-2222-4222-8222-222222222222", { status: "closed" }, "PATCH"), { params: Promise.resolve({ id: eventId }) });
    expect(createResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
  });

  it("returns only open events and interest counts to an authenticated profile", async () => {
    setContext("owner", [
      { id: eventId, title: "Kart", description: "", category: "kart", starts_at: null, location: "", status: "open" },
      { id: "33333333-3333-4333-8333-333333333333", title: "Closed", status: "closed" },
    ], [{ event_id: eventId }, { event_id: eventId }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [{
      id: eventId,
      title: "Kart",
      description: "",
      category: "kart",
      startsAt: null,
      location: "",
      status: "open",
      interestCount: 2,
    }] });
  });

  it("derives the creator from the session and ignores a submitted created_by", async () => {
    const { inserted } = setContext("leader");
    const response = await POST(request("/api/events", { title: "Kart", category: "kart", created_by: "99999999-9999-4999-8999-999999999999" }));
    expect(response.status).toBe(201);
    expect(inserted[0].created_by).toBe(userId);
    expect(inserted[0].created_by).not.toBe("99999999-9999-4999-8999-999999999999");
  });

  it("allows ADM or MOD to close an event", async () => {
    setContext("leader");
    const response = await PATCH(request(`/api/events/${eventId}`, { status: "closed" }, "PATCH"), { params: Promise.resolve({ id: eventId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ event: { id: eventId, status: "closed" } });
  });
});
