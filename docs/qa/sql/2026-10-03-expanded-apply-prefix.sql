-- STAGING ONLY: dtec-staging / grbanfuzzrlyapxyhjzc, approved by human "confirmo".
-- Assemble PREFIX + exact migrations 017..021 + reset + SUFFIX in this order.
begin;
set local lock_timeout='10s';
create temp table expanded_before(table_name text primary key,row_count bigint,checksum text,columns jsonb) on commit drop;
do $$
declare t record; n bigint; digest text;
begin
  if current_user<>'postgres' then raise exception 'postgres required'; end if;
  if to_regclass('cubochat_before_expanded_20261003_db3f02d.manifest') is null then raise exception 'restricted snapshot required'; end if;
  if to_regclass('public.room_board_nodes') is not null or to_regclass('public.room_history') is not null then raise exception 'batch already applied'; end if;
  if (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r')<>16 then raise exception 'inventory changed'; end if;
  if exists(select 1 from public.room_staff where role='owner' group by room_slug having count(*)>1) then raise exception 'duplicate proprietors'; end if;
  for t in select table_name,columns from cubochat_before_expanded_20261003_db3f02d.manifest order by table_name loop
    execute format('lock table public.%I in share row exclusive mode',t.table_name);
  end loop;
  for t in select table_name,columns from cubochat_before_expanded_20261003_db3f02d.manifest order by table_name loop
    execute format('select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' order by to_jsonb(r)::text),'''')) from public.%I r',t.table_name) into n,digest;
    insert into expanded_before values(t.table_name,n,digest,t.columns);
  end loop;
end; $$;
-- Exact IDs read from staging profiles/presence (not Google credentials).
create temp table expanded_reset_targets(user_id uuid primary key,expected_display_name text) on commit drop;
insert into expanded_reset_targets values
('0a866dcd-ef98-46e4-a013-788c5cdcbf35','Gestor ADM'),
('922beedb-0c50-42ef-bad0-c99768dc39f5','Primus Df'),
('e03cf235-c943-420d-a65d-3cc6f00296fa','Nicole Leao');
