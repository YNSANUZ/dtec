import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  authenticated: true,
  events: [] as Row[],
  interests: [] as Row[],
  fundraisers: [] as Row[],
  participants: [] as Row[],
  messages: [] as Row[],
  reactions: [] as Row[],
  profiles: [] as Row[],
  photos: [] as Row[],
  photoLookupFails: false,
}));

vi.mock("@/lib/mural-server", () => ({
  getMuralUserContext: vi.fn(async () => state.authenticated ? {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Ana Silva",
    supabase: fakeSupabase(),
  } : null),
}));

function fakeSupabase() {
  const tables: Record<string, Row[]> = {
    room_events: state.events,
    room_event_interests: state.interests,
    fundraisers: state.fundraisers,
    fundraiser_participants: state.participants,
    mural_messages: state.messages,
    mural_message_reactions: state.reactions,
    profiles: state.profiles,
  };
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters.push((row: Row) => row[column] === value); return query; },
        in(column: string, values: unknown[]) { filters.push((row: Row) => values.includes(row[column])); return query; },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, params: { p_user_ids: string[] }) {
      if (name !== "room_google_photos") throw new Error(`Unexpected RPC ${name}`);
      if (state.photoLookupFails) return { data: null, error: { message: "function missing" } };
      return { data: state.photos.filter((row) => params.p_user_ids.includes(String(row.user_id))), error: null };
    },
  };
}

import { GET } from "@/app/api/mural/participation/route";

const ana = "11111111-1111-4111-8111-111111111111";
const beto = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const closedEventId = "44444444-4444-4444-8444-444444444444";
const fundraiserId = "55555555-5555-4555-8555-555555555555";

function request(mural: string, folder?: string) {
  const url = new URL("https://dtec.test/api/mural/participation");
  url.searchParams.set("mural", mural);
  if (folder) url.searchParams.set("folder", folder);
  return new Request(url);
}

describe("mural participation overview and details", () => {
  beforeEach(() => {
    state.authenticated = true;
    state.events = [
      { id: eventId, category: "kart", status: "open" },
      { id: closedEventId, category: "kart", status: "closed" },
    ];
    state.interests = [
      { event_id: eventId, user_id: ana },
      { event_id: eventId, user_id: beto },
      { event_id: closedEventId, user_id: beto },
    ];
    state.fundraisers = [{ id: fundraiserId, status: "open" }];
    state.participants = [
      { fundraiser_id: fundraiserId, user_id: ana, active: true },
      { fundraiser_id: fundraiserId, user_id: beto, active: false },
    ];
    state.messages = [{ id: "66666666-6666-4666-8666-666666666666", author_id: ana }];
    state.reactions = [{ message_id: "66666666-6666-4666-8666-666666666666", user_id: beto, reaction: "like" }];
    state.profiles = [
      { user_id: ana, display_name: "Ana Silva", title: "Gestora", avatar_id: "a" },
      { user_id: beto, display_name: "Beto Lima", title: "", avatar_id: "c" },
    ];
    state.photos = [
      { user_id: ana, photo_url: "https://lh3.googleusercontent.com/ana" },
      { user_id: beto, photo_url: "https://evil.example/beto" },
    ];
    state.photoLookupFails = false;
  });

  it("hides identities in folder previews and counts unique members", async () => {
    const response = await GET(request("information"));
    expect(response.status).toBe(200);
    const body = await response.json() as { folders: Record<string, { count: number; photos: Array<{ photoUrl: string | null }> }> };
    expect(body.folders.recados).toEqual({ count: 2, photos: [
      { photoUrl: "https://lh3.googleusercontent.com/ana" }, { photoUrl: null },
    ] });
    expect(body.folders.vaquinhas).toEqual({ count: 1, photos: [{ photoUrl: "https://lh3.googleusercontent.com/ana" }] });
    expect(body.folders.comunicados).toEqual({ count: 0, photos: [] });
    expect(JSON.stringify(body)).not.toContain("Ana Silva");
    expect(JSON.stringify(body)).not.toContain("Beto Lima");
  });

  it("shows names only after requesting one folder and excludes closed events", async () => {
    const preview = await GET(request("leisure"));
    const summary = await preview.json() as { folders: Record<string, { count: number }> };
    expect(summary.folders.kart.count).toBe(2);
    expect(summary.folders.futebol.count).toBe(0);
    expect(JSON.stringify(summary)).not.toContain("Ana Silva");

    const detail = await GET(request("leisure", "kart"));
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({ people: [
      { userId: ana, name: "Ana Silva", title: "Gestora", photoUrl: "https://lh3.googleusercontent.com/ana" },
      { userId: beto, name: "Beto Lima", title: "", photoUrl: null },
    ] });
  });

  it("rejects anonymous and unknown folder requests", async () => {
    state.authenticated = false;
    expect((await GET(request("information"))).status).toBe(401);
    state.authenticated = true;
    expect((await GET(request("leisure", "unknown"))).status).toBe(400);
    expect((await GET(request("unknown"))).status).toBe(400);
  });

  it("still shows participation counts with neutral photos when the photo lookup is unavailable", async () => {
    state.photoLookupFails = true;
    const response = await GET(request("information"));
    expect(response.status).toBe(200);
    const body = await response.json() as { folders: Record<string, { count: number; photos: Array<{ photoUrl: string | null }> }> };
    expect(body.folders.recados.count).toBe(2);
    expect(body.folders.recados.photos).toEqual([{ photoUrl: null }, { photoUrl: null }]);
  });
});
