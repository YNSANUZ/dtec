import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const ownerId = "11111111-1111-4111-8111-111111111111";
const leaderId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const databases: PGlite[] = [];

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
  for (const file of ["202610010001_profiles.sql", "202610010003_room_directory.sql", "202610030006_rooms.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id) values ('${ownerId}'), ('${leaderId}'), ('${otherId}');
    insert into public.profiles (user_id, display_name, avatar_id) values
      ('${ownerId}', 'Ana Silva', 'a'), ('${leaderId}', 'Beto Lima', 'c'), ('${otherId}', 'Caio Melo', 'f');
    insert into public.room_roles (user_id, role, appointed_by) values
      ('${ownerId}', 'owner', null), ('${leaderId}', 'leader', '${ownerId}');
  `);
  return db;
}

async function applyStaffMigration(db: PGlite) {
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/202610030012_room_staff.sql"), "utf8"));
}

async function actAs(db: PGlite, id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
}

afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("room staff migration", () => {
  it("backfills DTEC staff without granting staff roles in other rooms", async () => {
    const db = await makeDatabase();
    await applyStaffMigration(db);
    const rows = await db.query<{ room_slug: string; user_id: string; role: string }>(
      "select room_slug, user_id, role from public.room_staff order by role, user_id",
    );
    expect(rows.rows).toEqual([
      { room_slug: "dtec", user_id: leaderId, role: "leader" },
      { room_slug: "dtec", user_id: ownerId, role: "owner" },
    ]);
    await actAs(db, ownerId);
    expect((await db.query<{ allowed: boolean }>("select public.has_room_role('dtec', array['owner']) as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>("select public.has_room_role('amigos', array['owner']) as allowed")).rows[0].allowed).toBe(false);
  });

  it("atomically appoints the creator as owner and rejects forged or cross-room staff", async () => {
    const db = await makeDatabase();
    await applyStaffMigration(db);
    await actAs(db, ownerId);
    await db.query("insert into public.rooms (slug, title, created_by) values ('amigos', 'Sala Amigos', $1)", [ownerId]);
    expect((await db.query<{ role: string }>("select role from public.room_staff where room_slug = 'amigos' and user_id = $1", [ownerId])).rows)
      .toEqual([{ role: "owner" }]);
    await expect(db.query("insert into public.rooms (slug, title, created_by) values ('amigos', 'Sala Outra', $1)", [ownerId])).rejects.toThrow();
    expect((await db.query("select user_id from public.room_staff where room_slug = 'amigos' and role = 'owner'")).rows).toHaveLength(1);
    await expect(db.query("insert into public.room_staff (room_slug, user_id, role) values ('amigos', $1, 'owner')", [otherId])).rejects.toThrow();
    await expect(db.query("insert into public.room_staff (room_slug, user_id, role, appointed_by) values ('dtec', $1, 'leader', $2)", [otherId, ownerId])).resolves.toBeDefined();
    await actAs(db, otherId);
    await db.query("insert into public.rooms (slug, title, created_by) values ('outra', 'Sala Outra', $1)", [otherId]);
    await actAs(db, ownerId);
    await expect(db.query("insert into public.room_staff (room_slug, user_id, role, appointed_by) values ('outra', $1, 'leader', $2)", [leaderId, ownerId])).rejects.toThrow();
    expect((await db.query<{ allowed: boolean }>("select public.has_room_role('outra', array['owner']) as allowed")).rows[0].allowed).toBe(false);
  });
});
