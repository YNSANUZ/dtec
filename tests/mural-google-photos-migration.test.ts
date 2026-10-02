import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const ana = "11111111-1111-4111-8111-111111111111";
const beto = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const databases: PGlite[] = [];
const migrations = join(process.cwd(), "supabase/migrations");

async function database() {
  const db = new PGlite();
  databases.push(db);
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table auth.identities (
      user_id uuid not null references auth.users(id),
      provider text not null,
      identity_data jsonb not null,
      created_at timestamptz not null default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(readFileSync(join(migrations, "202610010001_profiles.sql"), "utf8"));
  await db.exec(readFileSync(join(migrations, "202610010003_room_directory.sql"), "utf8"));
  await db.exec(`
    insert into auth.users (id) values ('${ana}'), ('${beto}'), ('${outsider}');
    insert into public.profiles (user_id, display_name, avatar_id)
      values ('${ana}', 'Ana Silva', 'a'), ('${beto}', 'Beto Lima', 'c');
    insert into auth.identities (user_id, provider, identity_data) values
      ('${ana}', 'google', '{"avatar_url":"https://lh3.googleusercontent.com/ana"}'),
      ('${beto}', 'google', '{"picture":"https://evil.example/beto"}');
  `);
  await db.exec(readFileSync(join(migrations, "202610030005_room_google_photos.sql"), "utf8"));
  return db;
}

afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("Google photo lookup for the mural", () => {
  it("returns only safe provider photos to a completed member", async () => {
    const db = await database();
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ana]);
    const result = await db.query<{ user_id: string; photo_url: string | null }>(
      "select * from public.room_google_photos($1::uuid[])", [[ana, beto]],
    );
    expect(result.rows).toEqual([
      { user_id: ana, photo_url: "https://lh3.googleusercontent.com/ana" },
      { user_id: beto, photo_url: null },
    ]);
  });

  it("denies visitors and logged-in users without a completed profile", async () => {
    const db = await database();
    await db.exec("set role anon");
    await expect(db.query("select * from public.room_google_photos($1::uuid[])", [[ana]])).rejects.toThrow();
    await db.exec("reset role");
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [outsider]);
    const result = await db.query("select * from public.room_google_photos($1::uuid[])", [[ana]]);
    expect(result.rows).toEqual([]);
  });
});
