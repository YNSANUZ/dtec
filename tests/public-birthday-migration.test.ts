import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const userId = "11111111-1111-4111-8111-111111111111";
const databases: PGlite[] = [];
const migrationDir = join(process.cwd(), "supabase/migrations");

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
  for (const file of ["202610010001_profiles.sql", "202610010003_room_directory.sql", "202610020001_public_room_characters.sql", "202610030004_public_birthday_signal.sql"]) {
    await db.exec(readFileSync(join(migrationDir, file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id) values ('${userId}');
    insert into public.profiles (user_id, display_name, avatar_id, birth_day_month)
      values ('${userId}', 'Ana Silva', 'a', to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD'));
  `);
  return db;
}

afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("public birthday signal migration", () => {
  it("lets an anonymous room query identify today's birthdays without reading exact profile dates", async () => {
    const db = await makeDatabase();
    await db.exec("set role anon");
    await expect(db.query("select birth_day_month from public.profiles")).rejects.toThrow();
    const publicCards = await db.query("select user_id, display_name, avatar_id from public.profiles");
    expect(publicCards.rows).toEqual([{ user_id: userId, display_name: "Ana Silva", avatar_id: "a" }]);
    const birthdays = await db.query<{ user_id: string }>("select * from public.birthday_today_user_ids()");
    expect(birthdays.rows).toEqual([{ user_id: userId }]);
  });

  it("does not allow untrusted roles to replace the resolver", async () => {
    const db = await makeDatabase();
    await db.exec("set role anon");
    await expect(db.exec("create or replace function public.birthday_today_user_ids() returns table(user_id uuid) language sql as $$ select null::uuid $$")).rejects.toThrow();
  });
});
