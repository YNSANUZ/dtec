-- Authorized staging batch only: UI dtec-staging / grbanfuzzrlyapxyhjzc.
-- Restricted application snapshot, NOT a full backup; excludes auth.users/secrets.
begin;
set local lock_timeout='10s';
do $$
declare t record; n bigint; digest text; copied text;
begin
  if current_user<>'postgres' then raise exception 'postgres required'; end if;
  if to_regclass('public.room_memberships') is not null or to_regclass('public.room_board_nodes') is not null then raise exception 'expanded schema already present'; end if;
  if (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r')<>16 then raise exception 'unexpected preflight inventory'; end if;
  -- No IF NOT EXISTS: never overwrite an earlier recoverable snapshot.
  create schema cubochat_before_expanded_20261003_db3f02d authorization postgres;
  revoke all on schema cubochat_before_expanded_20261003_db3f02d from public,anon,authenticated;
  create table cubochat_before_expanded_20261003_db3f02d.manifest(table_name text primary key,row_count bigint,checksum text,columns jsonb);
  create table cubochat_before_expanded_20261003_db3f02d.metadata(kind text,identity text,definition jsonb);
  -- Hold a consistent application snapshot, never lock or copy auth tables.
  for t in select c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' order by c.relname loop
    execute format('lock table public.%I in share mode',t.relname);
  end loop;
  for t in select c.relname,c.oid,c.relowner,c.relacl,c.relrowsecurity from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' order by c.relname loop
    execute format('create table cubochat_before_expanded_20261003_db3f02d.%I as table public.%I',t.relname,t.relname);
    execute format('select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' order by to_jsonb(r)::text),'''')) from public.%I r',t.relname) into n,digest;
    execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' order by to_jsonb(r)::text),'''')) from cubochat_before_expanded_20261003_db3f02d.%I r',t.relname) into copied;
    if digest<>copied then raise exception 'snapshot checksum mismatch: %',t.relname; end if;
    insert into cubochat_before_expanded_20261003_db3f02d.manifest values(t.relname,n,digest,(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped));
    insert into cubochat_before_expanded_20261003_db3f02d.metadata values('table',t.relname,jsonb_build_object('owner',pg_get_userbyid(t.relowner),'acl',t.relacl,'rls',t.relrowsecurity));
  end loop;
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'column',c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid))
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace s on s.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where s.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped;
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'constraint',c.relname||'.'||k.conname,to_jsonb(pg_get_constraintdef(k.oid,true)) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public';
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'index',indexname,to_jsonb(indexdef) from pg_indexes where schemaname='public';
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'policy',tablename||'.'||policyname,to_jsonb(p) from pg_policies p where schemaname='public';
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'function',p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prokind='f';
  insert into cubochat_before_expanded_20261003_db3f02d.metadata
  select 'trigger',c.relname||'.'||tr.tgname,to_jsonb(pg_get_triggerdef(tr.oid,true)) from pg_trigger tr join pg_class c on c.oid=tr.tgrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and not tr.tgisinternal;
  revoke all on all tables in schema cubochat_before_expanded_20261003_db3f02d from public,anon,authenticated;
  if has_schema_privilege('anon','cubochat_before_expanded_20261003_db3f02d','USAGE') or has_schema_privilege('authenticated','cubochat_before_expanded_20261003_db3f02d','USAGE') then raise exception 'snapshot exposed'; end if;
end; $$;
commit;
select 'snapshot_verified' as result,count(*) as tables,sum(row_count) as application_rows from cubochat_before_expanded_20261003_db3f02d.manifest;
