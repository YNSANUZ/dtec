import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("presence is keyed by room and user, while legacy DTEC positions are copied safely", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610030009_room_member_presence.sql", import.meta.url), "utf8");
  expect(sql).toMatch(/primary key \(room_slug, user_id\)/);
  expect(sql).toMatch(/room_slug text not null references public\.rooms\(slug\)/);
  expect(sql).toMatch(/with check \(\(select auth\.uid\(\)\) = user_id\)/);
  expect(sql).toMatch(/select 'dtec', user_id, x, z, action, last_seen from public\.room_presence/);
  expect(sql).toMatch(/on conflict \(room_slug, user_id\) do nothing/);
  expect(sql).not.toMatch(/drop table public\.room_presence|truncate public\.room_presence/);
});
