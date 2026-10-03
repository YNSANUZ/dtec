-- READ ONLY. UI must show dtec-staging / grbanfuzzrlyapxyhjzc.
-- Never run against production dbgtkjteqhdktwgruetx.
select 'expanded_preflight' as item,current_database() as database,current_user as actor,
  to_regclass('public.room_board_nodes') is not null as migration017_present,
  to_regclass('public.room_memberships') is not null as migration018_present,
  to_regclass('public.room_join_requests') is not null as migration019_present,
  to_regclass('public.room_invites') is not null as migration020_present,
  to_regclass('public.room_history') is not null as migration021_present;
select c.relname as table_name,c.relrowsecurity as rls,pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
select s.room_slug,s.user_id,p.display_name,s.role
from public.room_staff s join public.profiles p using(user_id) order by s.room_slug,s.role,s.user_id;
select 'dtec' as room_slug,p.user_id,p.display_name,
  (select count(*) from public.room_presence r where r.user_id=p.user_id) as legacy_presence_rows,
  (select count(*) from public.room_member_presence r where r.room_slug='dtec' and r.user_id=p.user_id) as generic_presence_rows
from public.profiles p where exists(select 1 from public.room_presence r where r.user_id=p.user_id)
  or exists(select 1 from public.room_member_presence r where r.room_slug='dtec' and r.user_id=p.user_id)
  or exists(select 1 from public.room_staff s where s.room_slug='dtec' and s.user_id=p.user_id)
order by p.display_name;
select room_slug,count(*) as owners from public.room_staff where role='owner'
group by room_slug having count(*)<>1;
select 'profiles' as item,count(*) as rows from public.profiles
union all select 'rooms',count(*) from public.rooms
union all select 'chat',count(*) from public.room_chat_messages
union all select 'notes',count(*) from public.mural_messages
union all select 'events',count(*) from public.room_events
union all select 'fundraisers',count(*) from public.fundraisers
union all select 'contributions',count(*) from public.fundraiser_contributions
union all select 'payment_audit',count(*) from public.fundraiser_payment_audit;
-- A single final result makes the gate and exact targets visible in SQL Editor.
select 'gate' as item,jsonb_build_object('actor',current_user,
  '017',to_regclass('public.room_board_nodes') is not null,
  '018',to_regclass('public.room_memberships') is not null,
  '019',to_regclass('public.room_join_requests') is not null,
  '020',to_regclass('public.room_invites') is not null,
  '021',to_regclass('public.room_history') is not null,
  'duplicateOwners',(select count(*) from(select room_slug from public.room_staff where role='owner' group by room_slug having count(*)>1)s))::text as detail
union all select 'table:'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner))::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all select 'staff:'||s.room_slug,jsonb_build_object('id',s.user_id,'name',p.display_name,'role',s.role)::text
from public.room_staff s join public.profiles p using(user_id)
union all select 'testmember:dtec',jsonb_build_object('id',p.user_id,'name',p.display_name)::text
from public.profiles p where exists(select 1 from public.room_presence r where r.user_id=p.user_id)
  or exists(select 1 from public.room_member_presence r where r.room_slug='dtec' and r.user_id=p.user_id)
  or exists(select 1 from public.room_staff s where s.room_slug='dtec' and s.user_id=p.user_id);
