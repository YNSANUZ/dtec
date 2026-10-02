import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const memberId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
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
  for (const file of ["202610010001_profiles.sql", "202610030006_rooms.sql", "202610030007_room_chat.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id) values ('${memberId}'), ('${otherId}');
    insert into public.profiles (user_id, display_name, avatar_id)
      values ('${memberId}', 'Ana Silva', 'a'), ('${otherId}', 'Beto Lima', 'c');
  `);
  return db;
}

afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("room chat migration", () => {
  it("reserves dtec and accepts only 3–20 lowercase letters or digits for new room IDs", async () => {
    const db = await makeDatabase();
    await db.exec("set role anon");
    const visible = await db.query<{ slug: string }>("select slug from public.rooms");
    expect(visible.rows).toEqual([{ slug: "dtec" }]);
    await expect(db.query("insert into public.rooms (slug, title, created_by) values ('abc', 'Sala ABC', $1)", [memberId])).rejects.toThrow();
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [memberId]);
    await db.exec("set role authenticated");
    await expect(db.query("insert into public.rooms (slug, title, created_by) values ('abc', 'Sala ABC', $1)", [otherId])).rejects.toThrow();
    await expect(db.query("insert into public.rooms (slug, title, created_by) values ('ab', 'Sala curta', $1)", [memberId])).rejects.toThrow();
    await expect(db.query("insert into public.rooms (slug, title, created_by) values ('sala.123', 'Sala com ponto', $1)", [memberId])).rejects.toThrow();
    await db.query("insert into public.rooms (slug, title, created_by) values ('sala123', 'Sala numérica', $1)", [memberId]);
    await db.query("insert into public.rooms (slug, title, created_by) values ('abc', 'Sala ABC', $1)", [memberId]);
  });

  it("shows messages to visitors but only lets members write as themselves", async () => {
    const db = await makeDatabase();
    await db.exec("set role anon");
    await expect(db.query("select * from public.room_chat_messages")).resolves.toBeDefined();
    await expect(db.query("insert into public.room_chat_messages (room_slug, author_id, content) values ('dtec', $1, 'Olá')", [memberId])).rejects.toThrow();
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [memberId]);
    await db.exec("set role authenticated");
    await expect(db.query("insert into public.room_chat_messages (room_slug, author_id, content) values ('dtec', $1, 'Olá')", [otherId])).rejects.toThrow();
    await db.query("insert into public.room_chat_messages (room_slug, author_id, content) values ('dtec', $1, 'Olá')", [memberId]);
    await expect(db.query("update public.room_chat_messages set content = 'Editada'")).rejects.toThrow();
    await expect(db.query("delete from public.room_chat_messages")).rejects.toThrow();
  });

  it("retains exactly the last five messages", async () => {
    const db = await makeDatabase();
    for (let index = 1; index <= 6; index++) {
      await db.query("insert into public.room_chat_messages (room_slug, author_id, content, created_at) values ('dtec', $1, $2, $3)",
        [memberId, `Mensagem ${index}`, `2026-10-02T10:00:0${index}Z`]);
    }
    const result = await db.query<{ content: string }>("select content from public.room_chat_messages order by created_at");
    expect(result.rows.map((row) => row.content)).toEqual(["Mensagem 2", "Mensagem 3", "Mensagem 4", "Mensagem 5", "Mensagem 6"]);
    await db.query("insert into public.rooms (slug, title) values ('abc', 'Sala ABC')");
    await db.query("insert into public.room_chat_messages (room_slug, author_id, content) values ('abc', $1, 'Outra sala')", [memberId]);
    const otherRoom = await db.query<{ content: string }>("select content from public.room_chat_messages where room_slug = 'abc'");
    expect(otherRoom.rows).toEqual([{ content: "Outra sala" }]);
    expect((await db.query("select id from public.room_chat_messages where room_slug = 'dtec'")).rows).toHaveLength(5);
  });
});
