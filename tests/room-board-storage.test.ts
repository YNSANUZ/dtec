import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111", member="22222222-2222-4222-8222-222222222222", other="33333333-3333-4333-8333-333333333333";
const databases:PGlite[]=[];
async function database(explicitMembership=false,admissions=false,invites=false,succession=false,beforeExpanded?:(db:PGlite)=>Promise<void>){
  const db=new PGlite();databases.push(db);
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant usage on schema public to anon,authenticated;`);
  const apply=async(file:string)=>{
    const source=readFileSync(join(process.cwd(),"supabase/migrations",file),"utf8");
    try {await db.exec(source);}catch(reason){
      const error=reason as Error&{position?:string;internalPosition?:string;internalQuery?:string};
      const query=error.internalQuery??source,position=Number(error.internalPosition??error.position);
      throw new Error(`${file}: ${error.message}\n${query.slice(Math.max(0,position-120),position+120)}`);
    }
  };
  for(const f of ["202610010001_profiles.sql","202610010002_mural_messages.sql","202610010003_room_directory.sql","202610030001_room_events.sql","202610030002_mural_reactions.sql","202610030003_monthly_fundraisers.sql","202610030006_rooms.sql","202610030007_room_chat.sql","202610030009_room_member_presence.sql","202610030010_scope_legacy_events.sql","202610030011_scope_legacy_mural.sql","202610030012_room_staff.sql","202610030013_room_mural.sql","202610030014_room_events.sql","202610030015_room_fundraisers.sql","202610030016_fundraiser_cycle_boundary.sql"])await apply(f);
  await db.exec(`insert into auth.users values('${owner}'),('${member}'),('${other}');insert into public.profiles(user_id,display_name,avatar_id)values('${owner}','Ana Silva','a'),('${member}','Beto Lima','c'),('${other}','Carla Melo','f');
    insert into public.room_staff(room_slug,user_id,role)values('dtec','${owner}','owner');
    insert into public.rooms(slug,title,created_by)values('amigos','Amigos','${owner}'),('outra','Outra','${other}');
    insert into public.room_member_presence(room_slug,user_id)values('amigos','${member}');
    insert into public.mural_messages(author_id,content,room_slug)values('${member}','Nota anterior','amigos');`);
  if(beforeExpanded)await beforeExpanded(db);
  await apply("202610030017_organizable_room_boards.sql");
  if(explicitMembership)await apply("202610030018_explicit_room_membership.sql");
  if(admissions)await apply("202610030019_room_admission_requests.sql");
  if(invites)await apply("202610030020_reusable_room_invites.sql");
  if(succession)await apply("202610030021_room_history_and_owner_succession.sql");
  return db;
}
async function act(db:PGlite,id:string,role="authenticated"){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
afterEach(async()=>Promise.all(databases.splice(0).map(db=>db.close())));
describe("authorized staging snapshot and bounded seniority reset",()=>{
  it("installs all membership gates when existing routine bodies use Windows CRLF",async()=>{
    const db=await database(true,true,true,true,async(db)=>{
      await db.exec(`do $$ declare signature text; definition text; begin
        foreach signature in array array['public.toggle_room_mural_reaction(text,uuid,text)','public.clear_room_mural_reaction(text,uuid)','public.ensure_room_fundraiser_current_cycle(text,uuid)','public.set_room_fundraiser_payment(text,uuid,date,uuid,boolean)'] loop
          definition:=replace(replace(pg_get_functiondef(signature::regprocedure),chr(13)||chr(10),chr(10)),chr(10),chr(13)||chr(10));execute definition;
        end loop;end;$$;`);
    });
    expect((await db.query<{gate:boolean}>("select position('active room membership required' in pg_get_functiondef('public.toggle_room_mural_reaction(text,uuid,text)'::regprocedure))>0 gate")).rows).toEqual([{gate:true}]);
    await act(db,other);
    await expect(db.query("select toggle_room_mural_reaction('amigos',gen_random_uuid(),'like')")).rejects.toThrow('active room membership required');
  });
  it("captures sixteen tables plus rollback metadata privately; resets only three verified DTEC test references once",async()=>{
    const db=await database(true,true,true,true,async(db)=>{
      await db.exec(`insert into room_presence(user_id)values('${owner}'),('${member}'),('${other}');`);
      await db.exec(readFileSync(join(process.cwd(),"docs/qa/sql/2026-10-03-expanded-snapshot.sql"),"utf8"));
      expect((await db.query("select count(*)::int n from cubochat_before_expanded_20261003_db3f02d.manifest")).rows).toEqual([{n:16}]);
      expect((await db.query<{kind:string}>("select distinct kind from cubochat_before_expanded_20261003_db3f02d.metadata order by kind")).rows.map(r=>r.kind)).toEqual(['column','constraint','function','index','policy','table','trigger']);
      const prefix=readFileSync(join(process.cwd(),"docs/qa/sql/2026-10-03-expanded-apply-prefix.sql"),"utf8")
        .replaceAll('0a866dcd-ef98-46e4-a013-788c5cdcbf35',owner).replaceAll('922beedb-0c50-42ef-bad0-c99768dc39f5',member).replaceAll('e03cf235-c943-420d-a65d-3cc6f00296fa',other)
        .replaceAll('Gestor ADM','Ana Silva').replaceAll('Primus Df','Beto Lima').replaceAll('Nicole Leao','Carla Melo');
      await db.exec(prefix);
    });
    const staffBefore=(await db.query("select * from room_staff order by room_slug,user_id")).rows;
    const otherBefore=(await db.query("select * from room_memberships where room_slug<>'dtec' order by room_slug,user_id")).rows;
    const notesBefore=(await db.query("select * from mural_messages")).rows;
    const reset=readFileSync(join(process.cwd(),"docs/qa/sql/2026-10-03-expanded-reset-seniority.sql"),"utf8");
    await db.exec(reset);
    await db.exec(readFileSync(join(process.cwd(),"docs/qa/sql/2026-10-03-expanded-apply-suffix.sql"),"utf8"));
    expect((await db.query("select count(distinct joined_at)::int dates,bool_and(joined_at_quality='recorded') recorded from room_memberships where room_slug='dtec'")).rows).toEqual([{dates:1,recorded:true}]);
    expect((await db.query("select count(*)::int n from room_history where details->>'reason'='authorized_test_seniority_reset'")).rows).toEqual([{n:3}]);
    expect((await db.query("select * from room_staff order by room_slug,user_id")).rows).toEqual(staffBefore);
    expect((await db.query("select * from room_memberships where room_slug<>'dtec' order by room_slug,user_id")).rows).toEqual(otherBefore);
    expect((await db.query("select * from mural_messages")).rows).toEqual(notesBefore);
    await db.exec(`create temp table expanded_reset_targets(user_id uuid primary key,expected_display_name text);insert into expanded_reset_targets values('${owner}','Ana Silva'),('${member}','Beto Lima'),('${other}','Carla Melo');`);
    await expect(db.exec(reset)).rejects.toThrow('reset already performed');
    await act(db,member);
    await expect(db.query("select * from cubochat_before_expanded_20261003_db3f02d.profiles")).rejects.toThrow();
    await act(db,'','anon');
    await expect(db.query("select * from cubochat_before_expanded_20261003_db3f02d.manifest")).rejects.toThrow();
  });
});
describe("organizable room boards in Postgres",()=>{
  it("seeds one generic panel, four DTEC panels and preserves old content",async()=>{
    const db=await database();expect((await db.query("select room_slug,count(*)::int n from room_board_nodes where kind='panel' group by room_slug order by room_slug")).rows).toEqual([{room_slug:"amigos",n:1},{room_slug:"dtec",n:4},{room_slug:"outra",n:1}]);
    expect((await db.query("select content,board_node_id is not null linked from mural_messages")).rows).toEqual([{content:"Nota anterior",linked:true}]);
  });
  it("lets members create and remove their own content without managing someone else's or another room",async()=>{
    const db=await database();await act(db,member);
    const event=(await db.query<{id:string}>("insert into room_events(room_slug,title,created_by)values('amigos','Evento fictício',$1)returning id",[member])).rows[0].id;
    await expect(db.query("insert into room_events(room_slug,title,created_by)values('outra','Intruso',$1)",[member])).rejects.toThrow();
    await expect(db.query("insert into room_events(room_slug,title,created_by)values('amigos','Autor falso',$1)",[owner])).rejects.toThrow();
    await expect(db.query("insert into room_board_nodes(room_slug,title,kind,created_by)values('amigos','Não posso','panel',$1)",[member])).rejects.toThrow();
    await act(db,owner);await db.query("update room_events set title='Moderado' where id=$1",[event]);
    await act(db,other);expect((await db.query("update room_events set title='Invasão' where id=$1 returning id",[event])).rows).toEqual([]);
    await act(db,member);expect((await db.query("update room_events set deleted_at=now(),status='cancelled' where id=$1 returning id",[event])).rows).toHaveLength(1);
    await expect(db.query("delete from room_events where id=$1",[event])).rejects.toThrow();
  });
  it("guards folder type, parent room, cycles, and deletion of occupied folders",async()=>{
    const db=await database();await act(db,owner);
    const root=(await db.query<{id:string}>("select id from room_board_nodes where room_slug='amigos' and kind='panel'")).rows[0].id;
    const folder=(await db.query<{id:string}>("insert into room_board_nodes(room_slug,parent_id,title,kind,created_by)values('amigos',$1,'Equipamentos','folder',$2)returning id",[root,owner])).rows[0].id;
    await expect(db.query("update room_board_nodes set parent_id=$1 where id=$1",[folder])).rejects.toThrow();
    const noteFolder=(await db.query<{id:string}>("select id from room_board_nodes where room_slug='amigos' and legacy_key='recados'")).rows[0].id;
    await expect(db.query("update room_board_nodes set archived=true where id=$1",[noteFolder])).rejects.toThrow();
    await expect(db.query("insert into room_events(room_slug,title,created_by,board_node_id)values('amigos','Tipo errado',$1,$2)",[owner,noteFolder])).rejects.toThrow();
    const foreign=(await db.query<{id:string}>("select id from room_board_nodes where room_slug='outra' and content_kind='events'")).rows[0].id;
    await expect(db.query("insert into room_events(room_slug,title,created_by,board_node_id)values('amigos','Pasta estrangeira',$1,$2)",[owner,foreign])).rejects.toThrow();
    await db.query("update room_board_nodes set title='Novo nome' where id=$1",[noteFolder]);
    expect((await db.query("select content from mural_messages where board_node_id=$1",[noteFolder])).rows).toEqual([{content:"Nota anterior"}]);
  });
  it("keeps fundraiser contributions/audit while removing the campaign from active use",async()=>{
    const db=await database();await act(db,member);
    const id=(await db.query<{id:string}>("insert into fundraisers(room_slug,title,monthly_amount_cents,due_day,created_by)values('amigos','Sem Pix real',1000,10,$1)returning id",[member])).rows[0].id;
    await db.query("insert into fundraiser_participants(fundraiser_id,user_id)values($1,$2)",[id,member]);
    const cycle=(await db.query<{d:string}>("select ensure_room_fundraiser_current_cycle('amigos',$1)::text d",[id])).rows[0].d;
    await db.query("select set_room_fundraiser_payment('amigos',$1,$2,$3,true)",[id,cycle,member]);
    await db.query("update fundraisers set status='cancelled',deleted_at=now() where id=$1",[id]);
    await act(db,owner);expect((await db.query<{n:number}>("select count(*)::int n from fundraiser_payment_audit where fundraiser_id=$1",[id])).rows[0].n).toBe(1);
    expect((await db.query<{status:string}>("select status from fundraiser_contributions where fundraiser_id=$1",[id])).rows[0].status).toBe("paid");
  });
  it("leaves only the own membership and re-enters without deleting profiles or notices; anon cannot write",async()=>{
    const db=await database();await act(db,member);await db.query("select leave_content_room('amigos')");
    expect((await db.query("select user_id from room_member_presence where room_slug='amigos'")).rows).toEqual([]);
    expect((await db.query("select content from mural_messages")).rows).toHaveLength(1);
    await expect(db.query("insert into room_events(room_slug,title,created_by)values('amigos','Já saí',$1)",[member])).rejects.toThrow();
    await db.query("insert into room_member_presence(room_slug,user_id)values('amigos',$1)",[member]);
    expect((await db.query<{member:boolean}>("select is_content_room_member('amigos') member")).rows[0].member).toBe(true);
    await act(db,"","anon");await expect(db.query("select * from room_board_nodes")).rejects.toThrow();await expect(db.query("select leave_content_room('amigos')")).rejects.toThrow();
  });
  it("lets MOD organize but reserves panel removal to ADM even through SQL",async()=>{
    const db=await database();await act(db,owner);
    await db.query("insert into room_staff(room_slug,user_id,role,appointed_by)values('amigos',$1,'leader',$2)",[member,owner]);
    await act(db,member);
    const panel=(await db.query<{id:string}>("insert into room_board_nodes(room_slug,title,kind,created_by)values('amigos','Painel MOD','panel',$1)returning id",[member])).rows[0].id;
    await db.query("update room_board_nodes set title='Renomeado por MOD' where id=$1",[panel]);
    await expect(db.query("update room_board_nodes set archived=true where id=$1",[panel])).rejects.toThrow();
    await act(db,owner);expect((await db.query("update room_board_nodes set archived=true where id=$1 returning id",[panel])).rows).toHaveLength(1);
  });
  it("links legacy publication automatically instead of losing it outside folders",async()=>{
    const db=await database();await act(db,member);
    const rows=(await db.query<{board_node_id:string|null}>("insert into room_events(room_slug,title,created_by)values('amigos','Legado',$1)returning board_node_id",[member])).rows;
    expect(rows[0].board_node_id).not.toBeNull();
  });
  it("separates membership from presence: offline stays a member, leave survives stale heartbeats",async()=>{
    const db=await database(true);await act(db,member);
    expect((await db.query<{value:boolean}>("select is_content_room_member('amigos') value")).rows[0].value).toBe(true);
    await db.query("update room_member_presence set last_seen='1970-01-01',x=4,z=6 where room_slug='amigos' and user_id=$1",[member]);
    expect((await db.query<{value:boolean}>("select is_content_room_member('amigos') value")).rows[0].value).toBe(true);
    await db.query("select leave_content_room('amigos')");
    await expect(db.query("insert into room_member_presence(room_slug,user_id)values('amigos',$1)on conflict(room_slug,user_id)do update set last_seen=now()",[member])).rejects.toThrow();
    await expect(db.query("insert into room_chat_messages(room_slug,author_id,content)values('amigos',$1,'Saiu')",[member])).rejects.toThrow();
    await db.query("select join_content_room('amigos')");
    expect((await db.query<{x:number;z:number}>("select x,z from room_member_presence where room_slug='amigos' and user_id=$1",[member])).rows[0]).toEqual({x:4,z:6});
  });
  it("allows one Google identity in multiple groups without carrying its powers across them",async()=>{
    const db=await database(true);await act(db,member);
    await expect(db.query("insert into room_member_presence(room_slug,user_id)values('outra',$1)",[member])).rejects.toThrow();
    await db.query("select join_content_room('outra')");
    expect((await db.query<{value:boolean}>("select is_content_room_member('amigos') and is_content_room_member('outra') value")).rows[0].value).toBe(true);
    expect((await db.query<{value:boolean}>("select has_room_role('outra',array['owner','leader']) value")).rows[0].value).toBe(false);
    await db.query("select leave_content_room('outra')");
    expect((await db.query<{value:boolean}>("select is_content_room_member('amigos') value")).rows[0].value).toBe(true);
  });
  it("does not let self-service joining bypass a ban or an owner abandon the group",async()=>{
    const db=await database(true);await act(db,owner);
    await expect(db.query("select leave_content_room('amigos')")).rejects.toThrow();
    await db.exec("reset role");await db.query("update room_memberships set status='banned' where room_slug='amigos' and user_id=$1",[member]);
    await act(db,member);
    await expect(db.query("update room_memberships set status='active' where room_slug='amigos' and user_id=$1",[member])).rejects.toThrow();
    await expect(db.query("select join_content_room('amigos')")).rejects.toThrow();
    await db.query("select leave_content_room('amigos')");
    expect((await db.query<{status:string}>("select status from room_memberships where room_slug='amigos' and user_id=$1",[member])).rows[0].status).toBe("banned");
  });
  it("adds the creator of a new room as a member and proprietor atomically",async()=>{
    const db=await database(true);await act(db,member);
    await db.query("insert into rooms(slug,title,created_by)values('novo','Novo grupo',$1)",[member]);
    expect((await db.query<{value:boolean}>("select is_content_room_member('novo') and has_room_role('novo',array['owner']) value")).rows[0].value).toBe(true);
    await act(db,"","anon");await expect(db.query("select join_content_room('novo')")).rejects.toThrow();
    expect((await db.query("select room_slug,user_id,status from room_memberships where room_slug='novo'")).rows).toHaveLength(1);
  });
});
describe("admission instead of self-activation",()=>{
  it("requests admission without gaining panel access, then accepts only through own-room staff",async()=>{
    const db=await database(true,true);await act(db,other);
    const root=(await db.query("select id from room_board_nodes where room_slug='amigos'")).rows;
    expect(root).toEqual([]);
    expect((await db.query("select content from mural_messages where room_slug='amigos'")).rows).toEqual([]);
    await db.query("select join_content_room('amigos')");
    expect((await db.query<{value:boolean}>("select is_content_room_member('amigos') value")).rows[0].value).toBe(false);
    expect((await db.query("select status from room_join_requests where room_slug='amigos'")).rows).toEqual([{status:"pending"}]);
    await expect(db.query("select review_room_join_request('amigos',$1,true)",[other])).rejects.toThrow();
    await expect(db.query("insert into room_events(room_slug,title,created_by)values('amigos','Tentativa',$1)",[other])).rejects.toThrow();
    await act(db,owner);
    expect((await db.query<{accepted:boolean}>("select review_room_join_request('amigos',$1,true) accepted",[other])).rows[0].accepted).toBe(true);
    expect((await db.query<{accepted:boolean}>("select review_room_join_request('amigos',$1,true) accepted",[other])).rows[0].accepted).toBe(false);
    await act(db,other);expect((await db.query("select id from room_board_nodes where room_slug='amigos'")).rows.length).toBeGreaterThan(0);
  });
  it("keeps requests private, rejects bans and does not turn ordinary members into approvers",async()=>{
    const db=await database(true,true);await act(db,other);await db.query("select join_content_room('amigos')");
    await act(db,member);expect((await db.query("select * from room_join_requests")).rows).toEqual([]);
    await expect(db.query("select review_room_join_request('amigos',$1,true)",[other])).rejects.toThrow();
    await db.exec("reset role");await db.query("insert into room_memberships(room_slug,user_id,status)values('amigos',$1,'banned')",[other]);
    await act(db,owner);await expect(db.query("select review_room_join_request('amigos',$1,true)",[other])).rejects.toThrow();
    await act(db,other);await expect(db.query("select join_content_room('amigos')")).rejects.toThrow();
    await act(db,"","anon");await expect(db.query("select * from room_join_requests")).rejects.toThrow();
    await expect(db.query("select review_room_join_request('amigos',$1,true)",[other])).rejects.toThrow();
  });
  it("blocks direct definer RPCs and their legacy wrappers before private rows or payment writes",async()=>{
    const db=await database(true,true);await act(db,owner);
    const note=(await db.query<{id:string}>("select id from mural_messages where room_slug='amigos'")).rows[0].id;
    const fund=(await db.query<{id:string}>("insert into fundraisers(room_slug,title,monthly_amount_cents,due_day,created_by)values('amigos','Fictícia sem Pix',1000,10,$1)returning id",[owner])).rows[0].id;
    await act(db,other);
    await expect(db.query("select toggle_room_mural_reaction('amigos',$1,'like')",[note])).rejects.toThrow();
    await expect(db.query("select clear_room_mural_reaction('amigos',$1)",[note])).rejects.toThrow();
    expect((await db.query("select * from get_room_mural_reaction_summary('amigos',array[$1::uuid])",[note])).rows).toEqual([]);
    await expect(db.query("select ensure_room_fundraiser_current_cycle('amigos',$1)",[fund])).rejects.toThrow();
    await expect(db.query("select set_room_fundraiser_payment('amigos',$1,current_date,$2,true)",[fund,other])).rejects.toThrow();
    await db.query("select leave_content_room('dtec')");
    await expect(db.query("select ensure_fundraiser_current_cycle($1)",[fund])).rejects.toThrow();
    await expect(db.query("select toggle_mural_reaction($1,'like')",[note])).rejects.toThrow();
  });
});
describe("private original room membership dates",()=>{
  it("returns recorded dates only inside the shared room, never import timestamps or public roster columns",async()=>{
    const db=await database(true,true,true,true);
    await act(db,owner);
    expect((await db.query("select * from get_room_member_since('amigos',$1)",[member])).rows).toEqual([{joined_at:null,joined_at_quality:"legacy_unknown"}]);
    await expect(db.query("select joined_at,joined_at_quality from room_memberships where room_slug='amigos'")).rejects.toThrow();
    await act(db,other);
    expect((await db.query("select * from get_room_member_since('amigos',$1)",[member])).rows).toEqual([]);
    await db.query("select join_content_room('amigos')");
    await db.exec("reset role");
    await db.query("update room_memberships set joined_at='2025-10-03T15:00:00Z' where room_slug='amigos' and user_id=$1",[other]);
    await act(db,owner);
    expect((await db.query<{v:boolean}>("select joined_at='2025-10-03T15:00:00Z'::timestamptz v from get_room_member_since('amigos',$1)",[other])).rows[0].v).toBe(true);
    expect((await db.query("select * from get_room_member_since('outra',$1)",[other])).rows).toEqual([]);
    await act(db,other);await db.query("select leave_content_room('amigos')");
    await act(db,owner);expect((await db.query("select * from get_room_member_since('amigos',$1)",[other])).rows).toEqual([]);
    await act(db,other);await db.query("select join_content_room('amigos')");
    expect((await db.query<{v:boolean}>("select joined_at='2025-10-03T15:00:00Z'::timestamptz v from get_room_member_since('amigos',$1)",[other])).rows[0].v).toBe(true);
    await act(db,owner);
    expect((await db.query<{v:boolean}>("select (details->>'joinedAt')::timestamptz='2025-10-03T15:00:00Z'::timestamptz v from room_history where room_slug='amigos' and target_id=$1 and details->>'status'='active' order by happened_at desc limit 1",[other])).rows[0].v).toBe(true);
    await act(db,"","anon");await expect(db.query("select * from get_room_member_since('amigos',$1)",[member])).rejects.toThrow();
  });
});
describe("short room invitations with public entry as default",()=>{
  it("defaults to public entry but requires explicit Google membership, never anonymous admission",async()=>{
    const db=await database(true,true,true);await act(db,other);
    expect((await db.query<{v:boolean}>("select is_content_room_member('amigos') v")).rows[0].v).toBe(false);
    expect((await db.query("select id from room_board_nodes where room_slug='amigos'")).rows).toEqual([]);
    await db.query("select join_content_room('amigos')");
    expect((await db.query<{v:boolean}>("select is_content_room_member('amigos') v")).rows[0].v).toBe(true);
    await expect(db.query("select set_room_entry_mode('amigos','protected','10m')")).rejects.toThrow();
    await act(db,"","anon");await expect(db.query("select join_content_room('amigos')")).rejects.toThrow();
  });
  it.each([["10m","10 minutes"],["1h","1 hour"],["1d","1 day"],["1mo","1 month"]])("uses the dashboard lifetime %s, grants MOD admission settings but not foreign-room settings",async(lifetime,interval)=>{
    const db=await database(true,true,true);await act(db,owner);
    await db.query("insert into room_staff(room_slug,user_id,role,appointed_by)values('amigos',$1,'leader',$2)",[member,owner]);
    await act(db,member);await db.query("select set_room_entry_mode('amigos','protected',$1)",[lifetime]);
    await expect(db.query("select set_room_entry_mode('outra','public',$1)",[lifetime])).rejects.toThrow();
    const code=(await db.query<{code:string}>("select issue_room_invite('amigos') code")).rows[0].code;
    expect(code).toMatch(/^[a-z]{2}[0-9]{2}$/);
    await expect(db.query("select token_hash,salt from room_invites")).rejects.toThrow();
    await db.exec("reset role");
    expect((await db.query<{v:boolean}>("select expires_at between clock_timestamp()+$1::interval-interval '5 seconds' and clock_timestamp()+$1::interval+interval '5 seconds' v from room_invites",[interval])).rows[0].v).toBe(true);
  });
  it("resets a reusable token without changing members, rejects the old code and admits distinct people and reentries until it expires",async()=>{
    const db=await database(true,true,true);await act(db,owner);await db.query("select set_room_entry_mode('amigos','protected','1mo')");
    const first=(await db.query<{v:string}>("select issue_room_invite('amigos') v")).rows[0].v;
    const second=(await db.query<{v:string}>("select issue_room_invite('amigos') v")).rows[0].v;
    expect(second).not.toBe(first);
    await act(db,other);expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[first])).rows[0].v).toBe(false);
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[second])).rows[0].v).toBe(true);
    await act(db,member);await db.query("select leave_content_room('amigos')");
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[second])).rows[0].v).toBe(true);
    await act(db,other);
    await db.query("select leave_content_room('amigos')");
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[second])).rows[0].v).toBe(true);
    await db.exec("reset role");await db.query("update room_invites set expires_at='1970-01-01' where revoked_at is null");
    await act(db,other);await db.query("select leave_content_room('amigos')");
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[second])).rows[0].v).toBe(false);
    await act(db,owner);expect((await db.query<{n:number}>("select count(*)::int n from mural_messages where room_slug='amigos'")).rows[0].n).toBe(1);
  });
  it("commits failed attempts, blocks the sixth per account and invalidates a token after twenty lifetime failures",async()=>{
    const db=await database(true,true,true);await act(db,owner);await db.query("select set_room_entry_mode('amigos','protected','1mo')");
    const code=(await db.query<{v:string}>("select issue_room_invite('amigos') v")).rows[0].v;
    await act(db,other);
    for(let i=0;i<5;i++)expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos','INVALID') v")).rows[0].v).toBe(false);
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[code])).rows[0].v).toBe(false);
    await db.exec("reset role");expect((await db.query<{n:number}>("select count(*)::int n from room_invite_attempts")).rows[0].n).toBe(5);
    await db.query("update room_invite_attempts set attempted_at=clock_timestamp()-interval '20 minutes'");
    await db.query("update room_invites set failed_attempts=19");
    await act(db,other);await db.query("select redeem_room_invite('amigos','INVALID')");
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[code])).rows[0].v).toBe(false);
    await db.exec("reset role");expect((await db.query<{v:boolean}>("select revoked_at is not null and failed_attempts=20 v from room_invites")).rows[0].v).toBe(true);
  });
  it("does not let expiration, public mode or tokens bypass bans",async()=>{
    const db=await database(true,true,true);await act(db,owner);await db.query("select set_room_entry_mode('amigos','protected','10m')");
    const code=(await db.query<{v:string}>("select issue_room_invite('amigos') v")).rows[0].v;
    await db.exec("reset role");await db.query("update room_invites set expires_at='1970-01-01'");
    await act(db,other);expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[code])).rows[0].v).toBe(false);
    await db.exec("reset role");await db.query("insert into room_memberships(room_slug,user_id,status)values('amigos',$1,'banned')",[other]);
    await act(db,owner);await db.query("select set_room_entry_mode('amigos','public','1d')");
    await act(db,other);await expect(db.query("select join_content_room('amigos')")).rejects.toThrow();
    expect((await db.query<{v:boolean}>("select redeem_room_invite('amigos',$1) v",[code])).rows[0].v).toBe(false);
    await act(db,"","anon");await expect(db.query("select redeem_room_invite('amigos',$1)",[code])).rejects.toThrow();
  });
});
describe("definitive owner succession and administrative history",()=>{
  it("chooses the oldest active MOD before an older ordinary member; retry is idempotent",async()=>{
    const db=await database(true,true,true,true);
    await db.query("insert into room_memberships(room_slug,user_id,joined_at)values('amigos',$1,'2024-01-01')",[other]);
    await db.query("update room_memberships set joined_at='2025-01-01',joined_at_quality='recorded' where room_slug='amigos' and user_id=$1",[member]);
    await act(db,owner);await db.query("select set_room_moderator('amigos',$1,true)",[member]);
    await db.query("select leave_content_room('amigos')");
    await db.query("select leave_content_room('amigos')");
    await db.exec("reset role");
    expect((await db.query("select user_id,role from room_staff where room_slug='amigos'")).rows).toEqual([{user_id:member,role:"owner"}]);
    expect((await db.query("select target_id from room_history where room_slug='amigos' and event_kind='ownership'")).rows).toEqual([{target_id:member}]);
    expect((await db.query("select status from room_memberships where room_slug='amigos' and user_id=$1",[owner])).rows).toEqual([{status:"left"}]);
    expect((await db.query("select content from mural_messages where room_slug='amigos'")).rows).toHaveLength(1);
    await act(db,owner);await expect(db.query("select set_room_entry_mode('amigos','protected','10m')")).rejects.toThrow();
    await act(db,member);await db.query("select set_room_entry_mode('amigos','protected','10m')");
    await expect(db.query("insert into room_staff(room_slug,user_id,role,appointed_by)values('amigos',$1,'leader',$2)",[other,member])).rejects.toThrow();
  });
  it("chooses the oldest of two MODs by original membership date, not appointment date",async()=>{
    const db=await database(true,true,true,true);
    await db.query("insert into room_memberships(room_slug,user_id,joined_at)values('amigos',$1,'2024-01-01')",[other]);
    await db.query("update room_memberships set joined_at='2025-01-01' where room_slug='amigos' and user_id=$1",[member]);
    await act(db,owner);
    await db.query("select set_room_moderator('amigos',$1,true)",[member]);
    await db.query("select set_room_moderator('amigos',$1,true)",[other]);
    await db.query("select leave_content_room('amigos')");
    await db.exec("reset role");
    expect((await db.query("select user_id from room_staff where room_slug='amigos' and role='owner'")).rows).toEqual([{user_id:other}]);
  });
  it("falls back to the oldest member and excludes left, banned, visitors and foreign MODs",async()=>{
    const db=await database(true,true,true,true);
    await db.query("insert into room_memberships(room_slug,user_id,status,joined_at)values('amigos',$1,'left','2020-01-01')",[other]);
    await act(db,owner);await db.query("select leave_content_room('amigos')");
    await db.exec("reset role");
    expect((await db.query("select user_id from room_staff where room_slug='amigos' and role='owner'")).rows).toEqual([{user_id:member}]);
    await db.query("update room_memberships set status='banned' where room_slug='amigos' and user_id=$1",[other]);
    await act(db,member);await db.query("select leave_content_room('amigos')");
    await db.exec("reset role");
    expect((await db.query("select user_id from room_staff where room_slug='amigos'")).rows).toEqual([]);
    expect((await db.query("select target_id from room_history where room_slug='amigos' and event_kind='ownership' order by happened_at")).rows).toEqual([{target_id:member},{target_id:null}]);
    await act(db,other);await expect(db.query("select join_content_room('amigos')")).rejects.toThrow();
  });
  it("never transfers on an offline heartbeat, enforces one proprietor, preserves original date on rejoining",async()=>{
    const db=await database(true,true,true,true);
    await act(db,owner);
    await db.query("insert into room_member_presence(room_slug,user_id)values('amigos',$1)",[owner]);
    await db.query("update room_member_presence set last_seen='1970-01-01',action='idle' where room_slug='amigos' and user_id=$1",[owner]);
    expect((await db.query("select user_id from room_staff where room_slug='amigos' and role='owner'")).rows).toEqual([{user_id:owner}]);
    expect((await db.query("select id from room_history where event_kind='ownership'")).rows).toEqual([]);
    await db.exec("reset role");
    await db.query("update room_memberships set joined_at='2024-03-01',joined_at_quality='recorded' where room_slug='amigos' and user_id=$1",[member]);
    await act(db,member);await db.query("update room_member_presence set last_seen='1970-01-01' where room_slug='amigos' and user_id=$1",[member]);
    await db.query("select leave_content_room('amigos')");await db.query("select join_content_room('amigos')");
    await db.exec("reset role");
    expect((await db.query("select user_id from room_staff where room_slug='amigos' and role='owner'")).rows).toEqual([{user_id:owner}]);
    expect((await db.query("select id from room_history where event_kind='ownership'")).rows).toEqual([]);
    expect((await db.query<{v:string}>("select joined_at::date::text v from room_memberships where room_slug='amigos' and user_id=$1",[member])).rows[0].v).toBe("2024-03-01");
    await expect(db.query("insert into room_staff(room_slug,user_id,role)values('amigos',$1,'owner')",[member])).rejects.toThrow();
    await act(db,"","anon");await expect(db.query("select leave_content_room('amigos')")).rejects.toThrow();
  });
  it("limits history and identity editing to active staff of that room without altering room id",async()=>{
    const db=await database(true,true,true,true);await act(db,member);
    expect((await db.query("select id from room_history where room_slug='amigos'")).rows).toEqual([]);
    await expect(db.query("select edit_room_identity('amigos','Intrusão','')")).rejects.toThrow();
    await act(db,owner);await db.query("select set_room_moderator('amigos',$1,true)",[member]);
    await act(db,member);
    await expect(db.query("select edit_room_identity('outra','Intrusão','')")).rejects.toThrow();
    await expect(db.query("select edit_room_identity('amigos','X','')")).rejects.toThrow();
    await db.query("select edit_room_identity('amigos',' Novo grupo ',' Descrição nova ')");
    await db.query("select edit_room_identity('amigos','Novo grupo','Descrição nova')");
    expect((await db.query("select slug,title,description from rooms where slug='amigos'")).rows).toEqual([{slug:"amigos",title:"Novo grupo",description:"Descrição nova"}]);
    expect((await db.query("select id from room_history where room_slug='amigos' and event_kind='identity'")).rows).toHaveLength(1);
    await expect(db.query("insert into room_history(room_slug,event_kind)values('amigos','ownership')")).rejects.toThrow();
  });
});
