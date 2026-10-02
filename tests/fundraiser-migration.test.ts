import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const modId = "44444444-4444-4444-8444-444444444444";
const fundraiserId = "55555555-5555-4555-8555-555555555555";
const databases: PGlite[] = [];
const migrations = join(process.cwd(), "supabase/migrations");

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
  await db.exec(readFileSync(join(migrations, "202610010001_profiles.sql"), "utf8"));
  await db.exec(readFileSync(join(migrations, "202610010003_room_directory.sql"), "utf8"));
  await db.exec(`
    insert into auth.users (id) values ('${ownerId}'), ('${memberId}'), ('${modId}');
    insert into public.profiles (user_id, display_name, avatar_id)
      values ('${ownerId}', 'Ana Silva', 'a'), ('${memberId}', 'Beto Lima', 'c'), ('${modId}', 'Carla Souza', 'f');
    insert into public.room_roles (user_id, role) values ('${ownerId}', 'owner');
    insert into public.room_roles (user_id, role, appointed_by) values ('${modId}', 'leader', '${ownerId}');
  `);
  await db.exec(readFileSync(join(migrations, "202610030001_room_events.sql"), "utf8"));
  await db.exec(readFileSync(join(migrations, "202610030003_monthly_fundraisers.sql"), "utf8"));
  return db;
}

async function assume(db: PGlite, role: "anon" | "authenticated", userId?: string) {
  await db.exec(`set role ${role};`);
  if (userId) await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function seedFundraiser(db: PGlite, withParticipants = true) {
  await db.exec("reset role;");
  await db.query(
    "insert into public.fundraisers (id, title, monthly_amount_cents, due_day, created_by, pix_key) values ($1, 'Confraternização', 2500, 10, $2, 'pix-teste')",
    [fundraiserId, ownerId],
  );
  if (withParticipants) {
    await db.query("insert into public.fundraiser_participants (fundraiser_id, user_id) values ($1, $2), ($1, $3)", [fundraiserId, memberId, modId]);
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("monthly fundraiser schema and payment audit", () => {
  it("clamps monthly cycles and treats the due date as the new cycle start", async () => {
    const db = await makeDatabase();
    const dates = await db.query<{ due: string }>(
      "select public.fundraiser_cycle_due_date(31, '2028-02-29'::date)::text as due",
    );
    const afterDue = await db.query<{ due: string }>(
      "select public.fundraiser_cycle_due_date(31, '2028-03-01'::date)::text as due",
    );
    expect(dates.rows[0]?.due).toBe("2028-02-29");
    expect(afterDue.rows[0]?.due).toBe("2028-03-31");
  });

  it("denies anon access to campaigns, participants, payments, and audit", async () => {
    const db = await makeDatabase();
    await assume(db, "anon");
    for (const table of ["fundraisers", "fundraiser_participants", "fundraiser_contributions", "fundraiser_payment_audit"]) {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow();
    }
    await expect(db.query(`select public.ensure_fundraiser_current_cycle('${fundraiserId}')`)).rejects.toThrow();
  });

  it("lets complete members join and read a fixed per-person amount without any aggregate field", async () => {
    const db = await makeDatabase();
    await seedFundraiser(db, false);
    await assume(db, "authenticated", memberId);
    const campaign = await db.query<{ monthly_amount_cents: string; due_day: number }>(
      "select monthly_amount_cents::text, due_day from public.fundraisers where id = $1",
      [fundraiserId],
    );
    expect(campaign.rows).toEqual([{ monthly_amount_cents: "2500", due_day: 10 }]);
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'fundraisers'",
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("total_collected");
    await db.query("insert into public.fundraiser_participants (fundraiser_id, user_id) values ($1, $2)", [fundraiserId, memberId]);
    await expect(db.query("insert into public.fundraiser_participants (fundraiser_id, user_id) values ($1, $2)", [fundraiserId, ownerId])).rejects.toThrow();
  });

  it("restricts campaign administration and payment writes to authorized roles", async () => {
    const db = await makeDatabase();
    await assume(db, "authenticated", memberId);
    await expect(db.query("insert into public.fundraisers (title, monthly_amount_cents, due_day, created_by) values ('Teste', 1000, 5, $1)", [memberId])).rejects.toThrow();
    await db.exec("reset role;");
    await assume(db, "authenticated", ownerId);
    await db.query("insert into public.fundraisers (title, monthly_amount_cents, due_day, created_by) values ('Teste', 1000, 5, $1)", [ownerId]);
    await seedFundraiser(db);
    await db.exec("reset role;");
    await assume(db, "authenticated", memberId);
    const cycle = await db.query<{ ensure_fundraiser_current_cycle: string }>("select public.ensure_fundraiser_current_cycle($1)::text", [fundraiserId]);
    const dueDate = cycle.rows[0]?.ensure_fundraiser_current_cycle;
    await expect(db.query("select public.set_fundraiser_payment($1, $2, $3, true)", [fundraiserId, dueDate, modId])).rejects.toThrow();
    const selfUpdate = await db.query<{ set_fundraiser_payment: boolean }>("select public.set_fundraiser_payment($1, $2, $3, true)", [fundraiserId, dueDate, memberId]);
    expect(selfUpdate.rows[0]?.set_fundraiser_payment).toBe(true);
    const repeated = await db.query<{ set_fundraiser_payment: boolean }>("select public.set_fundraiser_payment($1, $2, $3, true)", [fundraiserId, dueDate, memberId]);
    expect(repeated.rows[0]?.set_fundraiser_payment).toBe(false);
    await expect(db.query("update public.fundraiser_contributions set status = 'paid' where user_id = $1", [modId])).rejects.toThrow();
    await expect(db.query("insert into public.fundraiser_payment_audit (fundraiser_id, participant_id, cycle_due_date, new_status, actor_id, source) values ($1, $2, $3, 'paid', $4, 'self')", [fundraiserId, memberId, dueDate, memberId])).rejects.toThrow();
    const hiddenAudit = await db.query<{ id: string }>("select id from public.fundraiser_payment_audit where participant_id = $1", [memberId]);
    expect(hiddenAudit.rows).toEqual([]);
    await db.exec("reset role;");
    await assume(db, "authenticated", modId);
    const audit = await db.query<{ source: string; new_status: string }>("select source, new_status from public.fundraiser_payment_audit where participant_id = $1", [memberId]);
    expect(audit.rows).toEqual([{ source: "self", new_status: "paid" }]);
  });

  it("allows ADM/MOD to mark any active participant and records one audit per state change", async () => {
    const db = await makeDatabase();
    await seedFundraiser(db);
    await assume(db, "authenticated", modId);
    const cycle = await db.query<{ due_date: string }>("select public.ensure_fundraiser_current_cycle($1)::text as due_date", [fundraiserId]);
    const date = cycle.rows[0]?.due_date;
    const first = await db.query<{ set_fundraiser_payment: boolean }>("select public.set_fundraiser_payment($1, $2, $3, true)", [fundraiserId, date, memberId]);
    expect(first.rows[0]?.set_fundraiser_payment).toBe(true);
    const reset = await db.query<{ set_fundraiser_payment: boolean }>("select public.set_fundraiser_payment($1, $2, $3, false)", [fundraiserId, date, memberId]);
    expect(reset.rows[0]?.set_fundraiser_payment).toBe(true);
    const audit = await db.query<{ previous_status: string; new_status: string; source: string }>(
      "select previous_status, new_status, source from public.fundraiser_payment_audit where participant_id = $1 order by created_at",
      [memberId],
    );
    expect(audit.rows).toEqual([
      { previous_status: "pending", new_status: "paid", source: "mod" },
      { previous_status: "paid", new_status: "pending", source: "mod" },
    ]);
  });
});
