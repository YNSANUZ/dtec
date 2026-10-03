import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("legacy DTEC event routes filter event IDs to DTEC", async () => {
  const list = await readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8");
  const item = await readFile(new URL("../app/api/events/[id]/route.ts", import.meta.url), "utf8");
  const interest = await readFile(new URL("../app/api/events/[id]/interest/route.ts", import.meta.url), "utf8");
  expect(list).toContain('listRoomEvents("dtec"');
  expect(list).toContain('createRoomEvent(request,"dtec")');
  expect(item).toContain('updateRoomEvent(request,"dtec"');
  const helper=await readFile(new URL("../lib/rooms/events-server.ts",import.meta.url),"utf8");
  expect(helper).toContain('.eq("room_slug", access.slug).eq("id", id)');
  expect(interest).toContain('.eq("room_slug", "dtec")');
});

test("event migration preserves DTEC records and restricts legacy managers", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610030010_scope_legacy_events.sql", import.meta.url), "utf8");
  expect(sql).toMatch(/room_slug text not null default 'dtec'/);
  expect(sql).toMatch(/room_slug = 'dtec'/);
  expect(sql).not.toMatch(/delete from public\.room_events|truncate public\.room_events/);
});
