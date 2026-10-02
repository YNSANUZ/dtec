import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const adm = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const eventA = "33333333-3333-4333-8333-333333333333";
const eventB = "44444444-4444-4444-8444-444444444444";
const databases: PGlite[] = [];
async function database() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant usage on schema public to anon,authenticated;`);
  const apply = (file: string) => db.exec(readFileSync(join(process.cwd(),"supabase/migrations",file),"utf8"));
  for(const f of ["202610010001_profiles.sql","202610010003_room_directory.sql"]) await apply(f);
  await db.exec(`insert into auth.users values ('${adm}'),('${member}');
    insert into public.profiles(user_id,display_name,avatar_id) values ('${adm}','Ana Silva','a'),('${member}','Beto Lima','c');
    insert into public.room_roles(user_id,role) values ('${adm}','owner');
    insert into public.activity_interests(activity_key,user_id) values ('kart','${member}');`);
  for(const f of ["202610030001_room_events.sql","202610030006_rooms.sql","202610030010_scope_legacy_events.sql","202610030012_room_staff.sql"]) await apply(f);
  await db.exec(`insert into public.rooms(slug,title,created_by) values ('amigos','Amigos','${adm}'),('outra','Outra','${member}');
    insert into public.room_events(id,room_slug,title,created_by) values ('${eventA}','amigos','Evento A','${adm}'),('${eventB}','outra','Evento B','${member}');`);
  await apply("202610030014_room_events.sql"); return db;
}
async function actAs(db:PGlite,id:string,role="authenticated") {
  await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec(`set role ${role}`);
}
afterEach(async()=>Promise.all(databases.splice(0).map(db=>db.close())));
describe("room-scoped events RLS",()=>{
  it("preserves DTEC Kart and interests and restricts creation/editing to same-room ADM/MOD",async()=>{
    const db=await database();await actAs(db,adm);
    expect((await db.query("select title,room_slug from public.room_events where id='00000000-0000-4000-8000-000000000001'")).rows).toEqual([{title:"Kart",room_slug:"dtec"}]);
    expect((await db.query("select user_id from public.room_event_interests where event_id='00000000-0000-4000-8000-000000000001'")).rows).toEqual([{user_id:member}]);
    await db.query("insert into public.room_events(room_slug,title,created_by) values ('amigos','Novo',$1)",[adm]);
    await expect(db.query("insert into public.room_events(room_slug,title,created_by) values ('outra','Invadido',$1)",[adm])).rejects.toThrow();
    expect((await db.query("update public.room_events set status='closed' where id=$1 returning id",[eventB])).rows).toEqual([]);
    await expect(db.query("update public.room_events set room_slug='outra' where id=$1",[eventA])).rejects.toThrow();
    await expect(db.query("update public.room_events set created_by=$1 where id=$2",[member,eventA])).rejects.toThrow();
    await db.query("insert into public.room_staff(room_slug,user_id,role,appointed_by) values ('amigos',$1,'leader',$2)",[member,adm]);
    await actAs(db,member);
    expect((await db.query("update public.room_events set status='closed' where id=$1 returning id",[eventA])).rows).toHaveLength(1);
  });
  it("allows only the actor's interest in open events and rejects anonymous reading",async()=>{
    const db=await database();await actAs(db,member);
    await db.query("insert into public.room_event_interests(event_id,user_id) values ($1,$2)",[eventA,member]);
    await expect(db.query("insert into public.room_event_interests(event_id,user_id) values ($1,$2)",[eventA,adm])).rejects.toThrow();
    expect((await db.query("delete from public.room_event_interests where user_id=$1 returning user_id",[adm])).rows).toEqual([]);
    expect((await db.query("delete from public.room_event_interests where event_id=$1 and user_id=$2 returning user_id",[eventA,member])).rows).toHaveLength(1);
    await db.exec("reset role");await db.query("update public.room_events set status='closed' where id=$1",[eventA]);await actAs(db,member);
    await expect(db.query("insert into public.room_event_interests(event_id,user_id) values ($1,$2)",[eventA,member])).rejects.toThrow();
    await actAs(db,"","anon");await expect(db.query("select * from public.room_events")).rejects.toThrow();await expect(db.query("select * from public.room_event_interests")).rejects.toThrow();
  });
});
