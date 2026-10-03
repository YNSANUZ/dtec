import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { getUpcomingDueDate } from "@/lib/fundraisers/cycle";
const adm="11111111-1111-4111-8111-111111111111", member="22222222-2222-4222-8222-222222222222", mod="33333333-3333-4333-8333-333333333333", otherAdm="44444444-4444-4444-8444-444444444444";
const legacy="55555555-5555-4555-8555-555555555555", campaignA="66666666-6666-4666-8666-666666666666", campaignB="77777777-7777-4777-8777-777777777777", auditId="88888888-8888-4888-8888-888888888888";
const databases:PGlite[]=[];
async function database(frozenTime?:string){
  const db=new PGlite();databases.push(db);
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;grant usage on schema public to anon,authenticated;`);
  // Only the clock is substituted in the real migration/RPC SQL; no calendar,
  // authorization, locking, contribution or audit logic is mocked.
  if(frozenTime){
    await db.exec(`create function public.fundraiser_test_now() returns timestamptz language sql stable as $$
      select current_setting('test.fundraiser_now')::timestamptz $$;`);
    await db.query("select set_config('test.fundraiser_now',$1,false)",[frozenTime]);
  }
  const apply=(f:string)=>{
    const sql=readFileSync(join(process.cwd(),"supabase/migrations",f),"utf8");
    return db.exec(frozenTime?sql.replaceAll("statement_timestamp()","public.fundraiser_test_now()"):sql);
  };
  for(const f of ["202610010001_profiles.sql","202610010003_room_directory.sql","202610030001_room_events.sql","202610030003_monthly_fundraisers.sql","202610030006_rooms.sql","202610030012_room_staff.sql"])await apply(f);
  await db.exec(`insert into auth.users values ('${adm}'),('${member}'),('${mod}'),('${otherAdm}');
    insert into public.profiles(user_id,display_name,avatar_id) values ('${adm}','Ana Silva','a'),('${member}','Beto Lima','c'),('${mod}','Carla Melo','f'),('${otherAdm}','Davi Lima','j');
    insert into public.room_staff(room_slug,user_id,role) values ('dtec','${adm}','owner');
    insert into public.rooms(slug,title,created_by) values ('amigos','Amigos','${adm}'),('outra','Outra','${otherAdm}');
    insert into public.room_staff(room_slug,user_id,role,appointed_by) values ('amigos','${mod}','leader','${adm}');
    insert into public.fundraisers(id,title,monthly_amount_cents,due_day,created_by) values ('${legacy}','Legado',2500,10,'${adm}');
    insert into public.fundraiser_participants(fundraiser_id,user_id) values ('${legacy}','${member}');
    insert into public.fundraiser_contributions(fundraiser_id,user_id,cycle_due_date,status,marked_by,marked_at) values ('${legacy}','${member}','2000-01-10','paid','${member}','2000-01-09');
    insert into public.fundraiser_payment_audit(id,fundraiser_id,participant_id,cycle_due_date,previous_status,new_status,actor_id,source) values ('${auditId}','${legacy}','${member}','2000-01-10','pending','paid','${member}','self');`);
  await apply("202610030015_room_fundraisers.sql");
  await apply("202610030016_fundraiser_cycle_boundary.sql");
  await db.exec(`insert into public.fundraisers(id,room_slug,title,monthly_amount_cents,due_day,created_by) values ('${campaignA}','amigos','A',2500,10,'${adm}'),('${campaignB}','outra','B',1000,15,'${otherAdm}');
    insert into public.fundraiser_participants(fundraiser_id,user_id) values ('${campaignA}','${member}'),('${campaignA}','${mod}'),('${campaignB}','${member}');`);
  return db;
}
async function actAs(db:PGlite,id:string,role="authenticated"){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function cycle(db:PGlite,room:string,id:string){return (await db.query<{due:string}>("select public.ensure_room_fundraiser_current_cycle($1,$2)::text as due",[room,id])).rows[0].due;}
afterEach(async()=>Promise.all(databases.splice(0).map(db=>db.close())));
describe("room fundraiser storage and payments",()=>{
  it("preserves restricted execution grants and rejects invalid dates",async()=>{
    const db=await database();await actAs(db,member);
    for(const args of [[0,"2026-10-02"],[32,"2026-10-02"],[null,"2026-10-02"],[2,null]]){
      await expect(db.query("select public.fundraiser_cycle_due_date($1,$2)",args)).rejects.toThrow("invalid cycle date");
    }
    await actAs(db,"","anon");
    await expect(db.query("select public.fundraiser_cycle_due_date(2,'2026-10-02')")).rejects.toMatchObject({code:"42501"});
  });
  it.each([
    ["2026-10-01T12:00:00Z",2,"2026-10-02"],
    ["2026-10-02T12:00:00Z",2,"2026-11-02"],
    ["2026-10-02T02:59:00Z",2,"2026-10-02"],
    ["2026-10-02T03:00:00Z",2,"2026-11-02"],
    ["2027-02-28T12:00:00Z",31,"2027-03-31"],
    ["2028-02-29T12:00:00Z",31,"2028-03-31"],
    ["2026-12-31T12:00:00Z",31,"2027-01-31"],
  ])("matches the UI calendar at %s with due day %i",async(now,day,expected)=>{
    const db=await database();await actAs(db,member);
    const result=await db.query<{due:string}>(
      "select public.fundraiser_cycle_due_date($1,($2::timestamptz at time zone 'America/Sao_Paulo')::date)::text as due",
      [day,now],
    );
    expect(result.rows[0].due).toBe(expected);
    expect(result.rows[0].due).toBe(getUpcomingDueDate(new Date(now),day));
  });
  it.each([
    ["amigos",campaignA],
    ["dtec",legacy],
  ])("starts a pending cycle on the due date in %s without changing history or accepting the old cycle",async(room,id)=>{
    const db=await database("2026-10-09T12:00:00Z");await actAs(db,member);
    const oldDue=await cycle(db,room,id);
    expect(oldDue).toBe("2026-10-10");
    const mark=(due:string)=>db.query<{changed:boolean}>(
      "select public.set_room_fundraiser_payment($1,$2,$3,$4,true) as changed",[room,id,due,member],
    );
    await mark(oldDue);
    await db.query("select set_config('test.fundraiser_now',$1,false)",["2026-10-10T03:00:00Z"]);
    const newDue=await cycle(db,room,id);
    expect(newDue).toBe("2026-11-10");
    if(room==="dtec"){
      expect((await db.query<{due:string}>("select public.ensure_fundraiser_current_cycle($1)::text as due",[id])).rows[0].due).toBe(newDue);
      await expect(db.query("select public.set_fundraiser_payment($1,$2,$3,false)",[id,oldDue,member])).rejects.toMatchObject({code:"22023"});
    }
    await expect(mark(oldDue)).rejects.toMatchObject({code:"22023"});
    expect((await db.query("select cycle_due_date::text,status from public.fundraiser_contributions where fundraiser_id=$1 and user_id=$2 and cycle_due_date >= '2026-10-10' order by cycle_due_date",[id,member])).rows).toEqual([
      {cycle_due_date:oldDue,status:"paid"},{cycle_due_date:newDue,status:"pending"},
    ]);
    await actAs(db,adm);
    expect((await db.query("select count(*)::int as count from public.fundraiser_payment_audit where fundraiser_id=$1 and cycle_due_date >= '2026-10-10'",[id])).rows).toEqual([{count:1}]);
    await actAs(db,member);
    expect((await mark(newDue)).rows[0].changed).toBe(true);
    expect((await mark(newDue)).rows[0].changed).toBe(false);
    await actAs(db,adm);
    expect((await db.query("select count(*)::int as count from public.fundraiser_payment_audit where fundraiser_id=$1 and cycle_due_date >= '2026-10-10'",[id])).rows).toEqual([{count:2}]);
  });
  it("preserves legacy campaign/participant/payment/audit records and rejects anonymous reading",async()=>{
    const db=await database();await actAs(db,adm);
    expect((await db.query("select id,room_slug from public.fundraisers where id=$1",[legacy])).rows).toEqual([{id:legacy,room_slug:"dtec"}]);
    expect((await db.query("select user_id,active from public.fundraiser_participants where fundraiser_id=$1",[legacy])).rows).toEqual([{user_id:member,active:true}]);
    expect((await db.query("select status,marked_by,cycle_due_date::text from public.fundraiser_contributions where fundraiser_id=$1",[legacy])).rows).toEqual([{status:"paid",marked_by:member,cycle_due_date:"2000-01-10"}]);
    expect((await db.query("select id,source from public.fundraiser_payment_audit where fundraiser_id=$1",[legacy])).rows).toEqual([{id:auditId,source:"self"}]);
    expect((await db.query("select id from public.fundraisers where room_slug='outra' and id=$1",[campaignA])).rows).toEqual([]);
    await actAs(db,"","anon");
    for(const table of ["fundraisers","fundraiser_participants","fundraiser_contributions","fundraiser_payment_audit"])await expect(db.query(`select * from public.${table}`)).rejects.toThrow();
  });
  it("enforces same-room campaign administration and immutable room/creator",async()=>{
    const db=await database();await actAs(db,adm);
    expect((await db.query("update public.fundraisers set title='Editado' where id=$1 returning id",[campaignA])).rows).toHaveLength(1);
    expect((await db.query("update public.fundraisers set title='Invadido' where id=$1 returning id",[campaignB])).rows).toEqual([]);
    await expect(db.query("update public.fundraisers set room_slug='outra' where id=$1",[campaignA])).rejects.toThrow();
    await expect(db.query("insert into public.fundraisers(room_slug,title,monthly_amount_cents,due_day,created_by) values ('outra','Forjado',1000,5,$1)",[adm])).rejects.toThrow();
    await expect(db.query("insert into public.fundraiser_participants(fundraiser_id,user_id) values ($1,$2)",[campaignB,mod])).rejects.toThrow();
    await expect(cycle(db,"amigos",campaignB)).rejects.toThrow();
    await expect(db.query("select public.ensure_fundraiser_current_cycle($1)",[campaignA])).rejects.toThrow();
  });
  it("marks only self or same-room participants and scopes audit to own-room staff",async()=>{
    const db=await database();await actAs(db,member);const due=await cycle(db,"amigos",campaignA);
    await expect(db.query("select public.set_room_fundraiser_payment('amigos',$1,$2,$3,true)",[campaignA,due,mod])).rejects.toThrow();
    await db.query("select public.set_room_fundraiser_payment('amigos',$1,$2,$3,true)",[campaignA,due,member]);
    expect((await db.query("select id from public.fundraiser_payment_audit")).rows).toEqual([]);
    await actAs(db,adm);const dueB=await cycle(db,"outra",campaignB);
    await expect(db.query("select public.set_room_fundraiser_payment('outra',$1,$2,$3,true)",[campaignB,dueB,member])).rejects.toThrow();
    await expect(db.query("select public.set_room_fundraiser_payment('amigos',$1,$2,$3,true)",[campaignB,dueB,member])).rejects.toThrow();
    await actAs(db,mod);
    await db.query("select public.set_room_fundraiser_payment('amigos',$1,$2,$3,false)",[campaignA,due,member]);
    await actAs(db,adm);
    await db.query("select public.set_room_fundraiser_payment('amigos',$1,$2,$3,true)",[campaignA,due,member]);
    expect((await db.query("select source,new_status from public.fundraiser_payment_audit where fundraiser_id=$1 order by created_at",[campaignA])).rows).toEqual([{source:"self",new_status:"paid"},{source:"mod",new_status:"pending"},{source:"adm",new_status:"paid"}]);
    await actAs(db,otherAdm);
    expect((await db.query("select id from public.fundraiser_payment_audit where fundraiser_id=$1",[campaignA])).rows).toEqual([]);
    await expect(db.query("update public.fundraiser_contributions set status='pending' where fundraiser_id=$1",[campaignA])).rejects.toThrow();
  });
  it("keeps old cycles unchanged and makes repeated queued marks idempotent with one audit",async()=>{
    const db=await database();await actAs(db,member);const due=await cycle(db,"dtec",legacy);
    await expect(db.query("select public.set_room_fundraiser_payment('dtec',$1,'2000-01-10',$2,false)",[legacy,member])).rejects.toThrow();
    const mark=()=>db.query<{changed:boolean}>("select public.set_room_fundraiser_payment('dtec',$1,$2,$3,true) as changed",[legacy,due,member]);
    const results=await Promise.all([mark(),mark()]);
    expect(results.map(r=>r.rows[0].changed)).toEqual([true,false]);
    await actAs(db,adm);
    expect((await db.query("select count(*)::int as count from public.fundraiser_payment_audit where fundraiser_id=$1 and cycle_due_date=$2",[legacy,due])).rows).toEqual([{count:1}]);
    expect((await db.query("select status from public.fundraiser_contributions where fundraiser_id=$1 and cycle_due_date='2000-01-10'",[legacy])).rows).toEqual([{status:"paid"}]);
    await db.query("update public.fundraiser_participants set active=false,ended_at=now() where fundraiser_id=$1 and user_id=$2",[legacy,member]);
    await actAs(db,member);
    await expect(db.query("select public.set_room_fundraiser_payment('dtec',$1,$2,$3,false)",[legacy,due,member])).rejects.toThrow();
  });
});
