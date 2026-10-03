-- STAGING ONLY. No identity impersonation or persistent fixtures.
begin;
set local role anon;
do $$
begin
  begin perform 1 from public.room_board_nodes limit 1; raise exception 'anon panel unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.room_history limit 1; raise exception 'anon history unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin perform public.get_room_member_since('dtec','0a866dcd-ef98-46e4-a013-788c5cdcbf35'); raise exception 'anon private date unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin perform public.issue_room_invite('dtec'); raise exception 'anon invitation unexpectedly allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
do $$
begin
  if exists(select 1 from public.room_board_nodes) or exists(select 1 from public.room_history) or exists(select 1 from public.get_room_member_since('dtec','0a866dcd-ef98-46e4-a013-788c5cdcbf35')) then raise exception 'unidentified visitor reads private room'; end if;
end; $$;
reset role;
rollback;
select 'anonymous_and_unidentified_visitor_denied' as result,3 as dtec_test_members,
  (select count(*) from public.room_history where details->>'reason'='authorized_test_seniority_reset') as reset_history_rows;
