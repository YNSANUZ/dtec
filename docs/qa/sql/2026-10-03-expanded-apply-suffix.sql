-- Verification is inside the same transaction: any mismatch rolls back 017..021/reset.
do $$
declare t record; names text; n bigint; digest text; signature text;
begin
  for t in select * from expanded_before order by table_name loop
    select string_agg(format('%I',value),',') into names from jsonb_array_elements_text(t.columns);
    execute format('select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' order by to_jsonb(r)::text),'''')) from (select %s from public.%I) r',names,t.table_name) into n,digest;
    if n<>t.row_count or digest<>t.checksum then raise exception 'existing application data changed: %',t.table_name; end if;
  end loop;
  if (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r')<>24 then raise exception 'unexpected expanded table count'; end if;
  if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and (not c.relrowsecurity or pg_get_userbyid(c.relowner)<>'postgres')) then raise exception 'RLS/owner gate failed'; end if;
  if exists(select 1 from public.room_staff where role='owner' group by room_slug having count(*)>1) then raise exception 'owner uniqueness failed'; end if;
  if has_table_privilege('authenticated','public.room_staff','INSERT') or has_table_privilege('authenticated','public.room_staff','DELETE') or has_any_column_privilege('authenticated','public.room_staff','INSERT') then raise exception 'unsafe direct staff write'; end if;
  if has_column_privilege('authenticated','public.room_memberships','joined_at','SELECT') or has_column_privilege('anon','public.room_memberships','joined_at','SELECT') then raise exception 'private date exposed'; end if;
  if has_table_privilege('anon','public.room_board_nodes','SELECT') or has_table_privilege('anon','public.room_history','SELECT') or has_schema_privilege('authenticated','cubochat_before_expanded_20261003_db3f02d','USAGE') then raise exception 'private content/snapshot exposed'; end if;
  foreach signature in array array['public.get_room_member_since(text,uuid)','public.join_content_room(text)','public.leave_content_room(text)','public.issue_room_invite(text)','public.redeem_room_invite(text,text)','public.set_room_moderator(text,uuid,boolean)'] loop
    if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'RPC grant mismatch: %',signature; end if;
  end loop;
  if (select count(*) from public.room_history where room_slug='dtec' and details->>'reason'='authorized_test_seniority_reset')<>3 or (select count(distinct joined_at) from public.room_memberships where room_slug='dtec')<>1 then raise exception 'test reference reset failed'; end if;
  if exists(select 1 from public.room_memberships where room_slug<>'dtec' and joined_at_quality<>'legacy_unknown') then raise exception 'unapproved legacy reset'; end if;
end; $$;
create table cubochat_before_expanded_20261003_db3f02d.batch_verification as
select clock_timestamp() as verified_at,'017-021'::text as migrations,'preserved_all_16_original_table_columns'::text as data_result,3 as reset_test_references;
revoke all on cubochat_before_expanded_20261003_db3f02d.batch_verification from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
select 'expanded_batch_verified' as result,24 as tables_with_rls,3 as reset_test_references,
  (select count(*) from public.profiles) as profiles,(select count(*) from public.room_chat_messages) as messages,
  (select count(*) from public.room_staff where room_slug='dtec' and role='owner') as dtec_owners_preserved;
