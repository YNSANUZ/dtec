import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const adm = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const noProfile = "44444444-4444-4444-8444-444444444444";
const legacy = "33333333-3333-4333-8333-333333333333";
const noticeA = "55555555-5555-4555-8555-555555555555";
const noticeB = "66666666-6666-4666-8666-666666666666";
const databases: PGlite[] = [];

async function makeDatabase() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant usage on schema public to anon, authenticated;`);
  for (const file of ["202610010001_profiles.sql", "202610010002_mural_messages.sql", "202610010003_room_directory.sql", "202610030002_mural_reactions.sql", "202610030006_rooms.sql", "202610030011_scope_legacy_mural.sql", "202610030012_room_staff.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
  }
  await db.exec(`insert into auth.users values ('${adm}'), ('${member}'), ('${noProfile}');
    insert into public.profiles(user_id,display_name,avatar_id) values ('${adm}','Ana Silva','a'),('${member}','Beto Lima','c');
    insert into public.rooms(slug,title,created_by) values ('amigos','Amigos','${adm}'),('outra','Outra','${member}');
    insert into public.mural_messages(id,author_id,content,room_slug) values
      ('${legacy}','${member}','Legado','dtec'), ('${noticeA}','${member}','Em A','amigos'), ('${noticeB}','${member}','Em B','outra');
    insert into public.mural_message_reactions(message_id,user_id,reaction) values ('${legacy}','${adm}','like');`);
  // Baseline migrations already exist; this assertion fails only when the new feature is absent.
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/202610030013_room_mural.sql"), "utf8");
  await db.exec(migration);
  return db;
}
async function actAs(db: PGlite, id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}
afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("room mural database boundaries", () => {
  it("preserves DTEC notices/reactions and denies anonymous or incomplete-profile reads", async () => {
    const db = await makeDatabase();
    await actAs(db, adm);
    expect((await db.query("select id, content, room_slug from public.mural_messages where id=$1", [legacy])).rows)
      .toEqual([{ id: legacy, content: "Legado", room_slug: "dtec" }]);
    expect((await db.query("select * from public.get_mural_reaction_summary($1::uuid[])", [[legacy, noticeA]])).rows)
      .toEqual([{ message_id: legacy, like_count: 1, dislike_count: 0, my_reaction: "like" }]);
    await actAs(db, noProfile);
    expect((await db.query("select id from public.mural_messages")).rows).toEqual([]);
    expect((await db.query("select message_id from public.mural_message_reactions")).rows).toEqual([]);
    await expect(db.query("select public.toggle_room_mural_reaction('amigos',$1,'like')", [noticeA])).rejects.toThrow();
    await actAs(db, "", "anon");
    await expect(db.query("select * from public.mural_messages")).rejects.toThrow();
    await expect(db.query("select public.toggle_room_mural_reaction('amigos',$1,'like')", [noticeA])).rejects.toThrow();
  });

  it("allows own unpinned edits and same-room moderation but keeps author and room immutable", async () => {
    const db = await makeDatabase(); await actAs(db, member);
    expect((await db.query("update public.mural_messages set content='Editado' where id=$1 returning content", [noticeA])).rows)
      .toEqual([{ content: "Editado" }]);
    await expect(db.query("update public.mural_messages set is_pinned=true where id=$1", [noticeA])).rejects.toThrow();
    await actAs(db, adm);
    expect((await db.query("update public.mural_messages set is_pinned=true where id=$1 returning id", [noticeA])).rows).toHaveLength(1);
    expect((await db.query("update public.mural_messages set content='Invadido' where id=$1 returning id", [noticeB])).rows).toEqual([]);
    await expect(db.query("update public.mural_messages set room_slug='outra' where id=$1", [noticeA])).rejects.toThrow();
    await expect(db.query("update public.mural_messages set author_id=$1 where id=$2", [adm, noticeA])).rejects.toThrow();
    await actAs(db, member);
    expect((await db.query("delete from public.mural_messages where id=$1 returning id", [noticeA])).rows).toEqual([]);
    await db.exec("reset role");
    await db.query("insert into public.room_staff(room_slug,user_id,role,appointed_by) values ('amigos',$1,'leader',$2)", [member, adm]);
    await actAs(db, member);
    expect((await db.query("update public.mural_messages set is_pinned=false where id=$1 returning id", [noticeA])).rows).toHaveLength(1);
    await db.query("insert into public.mural_messages(room_slug,author_id,content) values ('amigos',$1,'Novo')", [member]);
    await expect(db.query("insert into public.mural_messages(room_slug,author_id,content) values ('amigos',$1,'Forjado')", [adm])).rejects.toThrow();
  });

  it("scopes direct reaction mutations and summaries to their parent room", async () => {
    const db = await makeDatabase(); await actAs(db, adm);
    await expect(db.query("select public.toggle_room_mural_reaction('amigos',$1,'like')", [noticeB])).rejects.toThrow();
    await expect(db.query("select public.clear_room_mural_reaction('amigos',$1)", [noticeB])).rejects.toThrow();
    await expect(db.query("select public.toggle_mural_reaction($1,'like')", [noticeA])).rejects.toThrow();
    await db.query("select public.toggle_room_mural_reaction('amigos',$1,'like')", [noticeA]);
    await db.query("select public.toggle_room_mural_reaction('outra',$1,'dislike')", [noticeB]);
    expect((await db.query("select * from public.get_room_mural_reaction_summary('amigos',$1::uuid[])", [[noticeA, noticeB, legacy]])).rows)
      .toEqual([{ message_id: noticeA, like_count: 1, dislike_count: 0, my_reaction: "like" }]);
    await db.query("select public.toggle_room_mural_reaction('amigos',$1,'dislike')", [noticeA]);
    await db.query("select public.toggle_room_mural_reaction('amigos',$1,'dislike')", [noticeA]);
    expect((await db.query("select reaction from public.mural_message_reactions where message_id=$1", [noticeA])).rows).toEqual([]);
    await expect(db.query("select public.toggle_room_mural_reaction('amigos',$1,null)", [noticeA])).rejects.toThrow();
  });
});
