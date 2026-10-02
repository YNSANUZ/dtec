import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  role: "member" as string | null,
  fundraisers: [] as Row[],
  participants: [] as Row[],
  contributions: [] as Row[],
  profiles: [] as Row[],
  calls: [] as Array<{ method: string; table: string; row?: Row; filters: Row }>,
}));

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => ({ supabase: makeSupabase(), userId: state.userId, displayName: "Ana Silva" })),
}));

function matches(row: Row, filters: Row) {
  return Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
}

function makeSupabase() {
  return {
    from(table: string) {
      const filters: Row = {};
      let mode = "select";
      let payload: Row = {};
      const rows = table === "fundraisers" ? state.fundraisers
        : table === "fundraiser_participants" ? state.participants
        : table === "fundraiser_contributions" ? state.contributions
        : table === "profiles" ? state.profiles : [];
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        in(column: string, values: unknown[]) { filters[column] = values; return chain; },
        order() { return chain; },
        insert(row: Row) { mode = "insert"; payload = row; return chain; },
        update(row: Row) { mode = "update"; payload = row; return chain; },
        upsert(row: Row) { mode = "upsert"; payload = row; return chain; },
        maybeSingle(): Promise<{ data: Row | null; error: null }> {
          if (table === "rooms") return Promise.resolve({ data: filters.slug === "dtec" ? { slug: "dtec" } : null, error: null });
          if (table === "room_staff") return Promise.resolve({ data: filters.room_slug === "dtec" && state.role ? { role: state.role } : null, error: null });
          return Promise.resolve({ data: rows.find((row) => matches(row, filters)) ?? null, error: null });
        },
        single(): Promise<{ data: Row; error: null }> {
          const row = { id: "33333333-3333-4333-8333-333333333333", status: "open", created_by: state.userId, ...payload };
          if (table === "fundraisers") state.fundraisers.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          let result: unknown = { data: rows.filter((row) => matches(row, filters)), error: null };
          if (mode === "insert") {
            state.calls.push({ method: mode, table, row: payload, filters });
            if (table === "fundraiser_participants") state.participants.push({ active: true, ...payload });
            result = { data: null, error: null };
          } else if (mode === "upsert") {
            state.calls.push({ method: mode, table, row: payload, filters });
            result = { data: null, error: null };
          } else if (mode === "update") {
            state.calls.push({ method: mode, table, row: payload, filters });
            for (const row of rows.filter((item) => matches(item, filters))) Object.assign(row, payload);
            result = { data: rows.filter((row) => matches(row, filters)), error: null };
          } else {
            state.calls.push({ method: mode, table, filters });
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
    async rpc(name: string, params: Row) {
      state.calls.push({ method: name, table: "rpc", row: params, filters: {} });
      if (name === "ensure_room_fundraiser_current_cycle") return { data: "2026-10-10", error: null };
      if (name === "set_room_fundraiser_payment") return { data: true, error: null };
      return { data: null, error: null };
    },
  };
}

import { GET, POST } from "@/app/api/fundraisers/route";
import { PATCH } from "@/app/api/fundraisers/[id]/route";
import { POST as join, DELETE as leave } from "@/app/api/fundraisers/[id]/participants/route";
import { POST as setPayment } from "@/app/api/fundraisers/[id]/contributions/[userId]/route";

const fundraiserId = "22222222-2222-4222-8222-222222222222";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const baseFundraiser = { id: fundraiserId, room_slug: "dtec", title: "Passeio", description: "", monthly_amount_cents: 2500, due_day: 10, pix_key: "pix-private", payment_instructions: "Pague até o dia 10", status: "open" };
const request = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => new Request(`https://dtec.test${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const idContext = { params: Promise.resolve({ id: fundraiserId }) };
const paymentContext = { params: Promise.resolve({ id: fundraiserId, userId: otherUserId }) };

describe("fundraiser APIs", () => {
  beforeEach(() => {
    state.role = "member";
    state.fundraisers = [{ ...baseFundraiser }];
    state.participants = [{ fundraiser_id: fundraiserId, user_id: state.userId, active: true }, { fundraiser_id: fundraiserId, user_id: otherUserId, active: true }];
    state.contributions = [
      { fundraiser_id: fundraiserId, user_id: state.userId, cycle_due_date: "2026-10-10", status: "paid", marked_at: "2026-10-01T12:00:00Z" },
      { fundraiser_id: fundraiserId, user_id: otherUserId, cycle_due_date: "2026-10-10", status: "pending", marked_at: null },
    ];
    state.profiles = [
      { user_id: state.userId, display_name: "Ana Silva", avatar_id: "a", title: "Analista" },
      { user_id: otherUserId, display_name: "Beto Lima", avatar_id: "c", title: "" },
    ];
    state.calls = [];
  });

  it("requires a completed authenticated profile for payment data", async () => {
    const { getMuralUserContext } = await import("@/lib/mural-server");
    vi.mocked(getMuralUserContext).mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("allows only ADM/MOD to create and edit campaigns and derives created_by", async () => {
    const denied = await POST(request("/api/fundraisers", { title: "Kart", monthlyAmountCents: 1000, dueDay: 8 }));
    expect(denied.status).toBe(403);
    state.role = "leader";
    const created = await POST(request("/api/fundraisers", { title: "Kart", monthlyAmountCents: 1000, dueDay: 8, created_by: otherUserId }));
    expect(created.status).toBe(201);
    expect(state.fundraisers.at(-1)?.created_by).toBe(state.userId);
    state.role = "member";
    const deniedEdit = await PATCH(request(`/api/fundraisers/${fundraiserId}`, { dueDay: 12 }, "PATCH"), idContext);
    expect(deniedEdit.status).toBe(403);
  });

  it("returns a paid-first/pending roster without aggregate money totals", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { fundraisers: Array<Record<string, unknown>> };
    expect(body.fundraisers[0]).toMatchObject({ monthlyAmountCents: 2500, dueDay: 10, pixKey: "pix-private", currentCycleDueDate: "2026-10-10" });
    expect(body.fundraisers[0]?.paid).toEqual([{ userId: state.userId, name: "Ana Silva", avatar: "a", title: "Analista", markedAt: "2026-10-01T12:00:00Z" }]);
    expect(body.fundraisers[0]?.pending).toEqual([{ userId: otherUserId, name: "Beto Lima", avatar: "c", title: "", markedAt: null }]);
    expect(Object.keys(body.fundraisers[0] ?? {})).not.toContain("totalCollected");
    expect(state.calls.some((call) => call.method === "ensure_room_fundraiser_current_cycle" && call.row?.p_room_slug === "dtec")).toBe(true);
  });

  it("lets a member join and leave only their own campaign participation", async () => {
    const joined = await join(request(`/api/fundraisers/${fundraiserId}/participants`), idContext);
    expect(joined.status).toBe(200);
    const denied = await join(request(`/api/fundraisers/${fundraiserId}/participants`, { userId: otherUserId }), idContext);
    expect(denied.status).toBe(403);
    const left = await leave(request(`/api/fundraisers/${fundraiserId}/participants`, undefined, "DELETE"), idContext);
    expect(left.status).toBe(200);
    expect(state.calls.some((call) => call.method === "update" && call.table === "fundraiser_participants" && call.filters.user_id === state.userId)).toBe(true);
  });

  it("lets members mark themselves, denies cross-member marks, and allows ADM/MOD override", async () => {
    const ownContext = { params: Promise.resolve({ id: fundraiserId, userId: state.userId }) };
    const own = await setPayment(request(`/api/fundraisers/${fundraiserId}/contributions/${state.userId}`, { paid: true }), ownContext);
    expect(own.status).toBe(200);
    expect(state.calls.some((call) => call.method === "set_room_fundraiser_payment" && call.row?.p_room_slug === "dtec" && call.row?.p_participant_id === state.userId)).toBe(true);
    const denied = await setPayment(request(`/api/fundraisers/${fundraiserId}/contributions/${otherUserId}`, { paid: true }), paymentContext);
    expect(denied.status).toBe(403);
    state.role = "leader";
    const moderator = await setPayment(request(`/api/fundraisers/${fundraiserId}/contributions/${otherUserId}`, { paid: true }), paymentContext);
    expect(moderator.status).toBe(200);
  });
});
