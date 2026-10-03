-- Included inside the authorized migration transaction, not standalone.
-- Caller supplies temp expanded_reset_targets(user_id uuid,expected_display_name text).
-- Test-only DTEC seniority reference reset. NEVER accounts/content/roles reset.
do $$
declare reset_time timestamptz:=clock_timestamp(); target record; changed integer;
begin
  if current_user<>'postgres' then raise exception 'postgres required'; end if;
  if (select count(*) from expanded_reset_targets)<>3 then raise exception 'exactly three verified test targets required'; end if;
  perform 1 from public.rooms where slug='dtec' for update;
  if (select count(*) from public.room_memberships where room_slug='dtec')<>3 then raise exception 'DTEC participant inventory changed'; end if;
  if exists(select 1 from expanded_reset_targets t left join public.profiles p using(user_id) left join public.room_memberships m on m.user_id=t.user_id and m.room_slug='dtec' where p.display_name is distinct from t.expected_display_name or m.status is distinct from 'active' or m.joined_at_quality is distinct from 'legacy_unknown') then raise exception 'verified test targets changed or reset already performed'; end if;
  for target in select t.user_id,m.joined_at from expanded_reset_targets t join public.room_memberships m on m.user_id=t.user_id and m.room_slug='dtec' order by t.user_id loop
    insert into public.room_history(room_slug,event_kind,target_id,details) values('dtec','baseline',target.user_id,jsonb_build_object('reason','authorized_test_seniority_reset','originalJoinDate','unknown','previousImportedReference',target.joined_at,'joinedAt',reset_time,'tieBreak','stable_user_id_not_historical_order'));
  end loop;
  update public.room_memberships m set joined_at=reset_time,joined_at_quality='recorded' from expanded_reset_targets t where m.room_slug='dtec' and m.user_id=t.user_id;
  get diagnostics changed=row_count;
  if changed<>3 then raise exception 'unexpected reset count'; end if;
end; $$;
