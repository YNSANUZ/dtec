import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const moderatorId = "44444444-4444-4444-8444-444444444444";
const eventId = "00000000-0000-4000-8000-000000000001";
const footballEventId = "33333333-3333-4333-8333-333333333333";
const databases: PGlite[] = [];
const migrationPath = join(process.cwd(), "supabase/migrations/202610030001_room_events.sql");

async function makeDatabase() {
  const db = new PGlite();
  databases.push(db);
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/202610010001_profiles.sql"), "utf8"));
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/202610010003_room_directory.sql"), "utf8"));
  await db.exec(`
    insert into auth.users (id) values ('${ownerId}'), ('${memberId}'), ('${moderatorId}');
    insert into public.profiles (user_id, display_name, avatar_id)
      values ('${ownerId}', 'Ana Silva', 'a'), ('${memberId}', 'Beto Lima', 'c'), ('${moderatorId}', 'Carla Souza', 'f');
    insert into public.room_roles (user_id, role) values ('${ownerId}', 'owner');
    insert into public.room_roles (user_id, role, appointed_by) values ('${moderatorId}', 'leader', '${ownerId}');
    insert into public.activity_interests (activity_key, user_id)
      values ('kart', '${memberId}');
  `);
  await db.exec(readFileSync(migrationPath, "utf8"));
  return db;
}

async function assume(db: PGlite, role: "anon" | "authenticated", userId?: string) {
  await db.exec(`set role ${role};`);
  if (userId) await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("room events migration against Postgres", () => {
  it("creates the Kart event and copies legacy interest without deleting the old record", async () => {
    const db = await makeDatabase();
    const events = await db.query<{ id: string; title: string; category: string }>(
      "select id, title, category from public.room_events where id = $1",
      [eventId],
    );
    const copied = await db.query<{ user_id: string }>(
      "select user_id from public.room_event_interests where event_id = $1",
      [eventId],
    );
    const legacy = await db.query<{ count: string }>(
      "select count(*)::text as count from public.activity_interests where activity_key = 'kart' and user_id = $1",
      [memberId],
    );
    expect(events.rows).toEqual([{ id: eventId, title: "Kart", category: "kart" }]);
    expect(copied.rows).toEqual([{ user_id: memberId }]);
    expect(legacy.rows[0]?.count).toBe("1");
    await db.exec(readFileSync(migrationPath, "utf8"));
    const counts = await db.query<{ count: string }>("select count(*)::text as count from public.room_events where category = 'kart'");
    expect(counts.rows[0]?.count).toBe("1");
  });

  it("denies anonymous access to event data, interests, and moderator checks", async () => {
    const db = await makeDatabase();
    await assume(db, "anon");
    await expect(db.query("select * from public.room_events")).rejects.toThrow();
    await expect(db.query("select * from public.room_event_interests")).rejects.toThrow();
    await expect(db.query("select public.is_room_moderator()")).rejects.toThrow();
  });

  it("lets a member read events and add only their own interest once", async () => {
    const db = await makeDatabase();
    await assume(db, "authenticated", ownerId);
    await db.query(
      "insert into public.room_events (id, title, category, created_by) values ($1, 'Futebol', 'futebol', $2)",
      [footballEventId, ownerId],
    );
    await db.exec("reset role;");
    await assume(db, "authenticated", memberId);
    const visible = await db.query<{ id: string }>("select id from public.room_events where id = $1", [eventId]);
    expect(visible.rows).toEqual([{ id: eventId }]);
    await db.query("insert into public.room_event_interests (event_id, user_id) values ($1, $2)", [footballEventId, memberId]);
    await expect(db.query("insert into public.room_event_interests (event_id, user_id) values ($1, $2)", [footballEventId, ownerId])).rejects.toThrow();
    await expect(db.query("insert into public.room_event_interests (event_id, user_id) values ($1, $2)", [footballEventId, memberId])).rejects.toThrow();
  });

  it("allows ADM/MOD to manage events, rejects ordinary member writes, and blocks interest in a closed event", async () => {
    const db = await makeDatabase();
    await assume(db, "authenticated", memberId);
    await expect(db.query(
      "insert into public.room_events (title, category, created_by) values ('Futebol', 'futebol', $1)",
      [memberId],
    )).rejects.toThrow();
    await db.exec("reset role;");
    await assume(db, "authenticated", moderatorId);
    await db.query(
      "insert into public.room_events (title, category, created_by) values ('Paintball', 'paintball', $1)",
      [moderatorId],
    );
    await db.exec("reset role;");
    await assume(db, "authenticated", ownerId);
    await db.query("update public.room_events set status = 'closed' where id = $1", [eventId]);
    await db.exec("reset role;");
    await assume(db, "authenticated", memberId);
    await expect(db.query("insert into public.room_event_interests (event_id, user_id) values ($1, $2)", [eventId, memberId])).rejects.toThrow();
  });
});
