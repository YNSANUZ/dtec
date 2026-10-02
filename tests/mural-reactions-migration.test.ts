import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const authorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
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
  for (const file of ["202610010001_profiles.sql", "202610010002_mural_messages.sql", "202610030002_mural_reactions.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id) values ('${authorId}'), ('${memberId}');
    insert into public.profiles (user_id, display_name, avatar_id)
      values ('${authorId}', 'Ana Silva', 'a'), ('${memberId}', 'Beto Lima', 'c');
    insert into public.mural_messages (id, author_id, content)
      values ('${messageId}', '${authorId}', 'Aviso de teste');
  `);
  return db;
}

async function assume(db: PGlite, role: "anon" | "authenticated", userId?: string) {
  await db.exec(`set role ${role}`);
  if (userId) await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

afterEach(async () => Promise.all(databases.splice(0).map((db) => db.close())));

describe("mural reaction migration", () => {
  it("allows authenticated reads but no anonymous or direct writes", async () => {
    const db = await makeDatabase();
    await assume(db, "anon");
    await expect(db.query("select * from public.mural_message_reactions")).rejects.toThrow();
    await expect(db.query(`select public.toggle_mural_reaction('${messageId}', 'like')`)).rejects.toThrow();
    await expect(db.query(`select public.get_mural_reaction_summary(array['${messageId}'::uuid])`)).rejects.toThrow();
    await db.exec("reset role");
    await assume(db, "authenticated", memberId);
    await expect(db.query(`insert into public.mural_message_reactions (message_id, user_id, reaction) values ('${messageId}', '${memberId}', 'like')`)).rejects.toThrow();
    await expect(db.query("select * from public.mural_message_reactions")).resolves.toBeDefined();
  });

  it("atomically adds, toggles off, and switches the caller's single reaction", async () => {
    const db = await makeDatabase();
    await assume(db, "authenticated", memberId);
    const call = (reaction: string) => db.query<{ result: string | null }>(
      `select public.toggle_mural_reaction($1::uuid, $2) as result`, [messageId, reaction],
    );
    expect((await call("like")).rows[0]?.result).toBe("like");
    expect((await call("dislike")).rows[0]?.result).toBe("dislike");
    expect((await call("dislike")).rows[0]?.result).toBeNull();
    const remaining = await db.query("select reaction from public.mural_message_reactions");
    expect(remaining.rows).toEqual([]);
    await expect(call("other")).rejects.toThrow();
    await expect(db.query("select public.toggle_mural_reaction($1::uuid, 'like')", ["99999999-9999-4999-8999-999999999999"])).rejects.toThrow();
    await call("like");
    const summary = await db.query<{ like_count: number; dislike_count: number; my_reaction: string }>(
      "select * from public.get_mural_reaction_summary($1::uuid[])", [[messageId]],
    );
    expect(summary.rows).toEqual([{ message_id: messageId, like_count: 1, dislike_count: 0, my_reaction: "like" }]);
    const cleared = await db.query<{ cleared: boolean }>(
      "select public.clear_mural_reaction($1::uuid) as cleared", [messageId],
    );
    expect(cleared.rows[0]?.cleared).toBe(true);
  });

  it("cascades reactions when a notice is deleted", async () => {
    const db = await makeDatabase();
    await assume(db, "authenticated", memberId);
    await db.query(`select public.toggle_mural_reaction($1::uuid, 'like')`, [messageId]);
    await db.exec("reset role");
    await db.query("delete from public.mural_messages where id = $1", [messageId]);
    const rows = await db.query("select * from public.mural_message_reactions");
    expect(rows.rows).toEqual([]);
  });
});
