-- LOCAL DRAFT: no offline event transfers ownership. Only explicit departure does.
create unique index one_proprietor_per_room on public.room_staff(room_slug) where role='owner';
alter table public.room_memberships add column joined_at_quality text not null default 'recorded'
  check(joined_at_quality in('recorded','legacy_unknown'));
-- Existing rows lack a reliable original per-room join timestamp. Do not fabricate it.
update public.room_memberships set joined_at_quality='legacy_unknown';
-- Keep join timestamps private: the public roster never gains column access.
create function public.get_room_member_since(p_room_slug text,p_user_id uuid)
returns table(joined_at timestamptz,joined_at_quality text)
language sql stable security definer set search_path='' as $$
  select case when m.joined_at_quality='recorded' then m.joined_at else null end,m.joined_at_quality
  from public.room_memberships m
  where m.room_slug=p_room_slug and m.user_id=p_user_id and m.status='active'
    and public.is_content_room_member(p_room_slug);
$$;
revoke all on function public.get_room_member_since(text,uuid) from public,anon;
grant execute on function public.get_room_member_since(text,uuid) to authenticated;
create table public.room_history (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms(slug),
  event_kind text not null check(event_kind in('baseline','membership','ownership','identity','moderator')),
  actor_id uuid references public.profiles(user_id),
  target_id uuid references public.profiles(user_id),
  happened_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'
);
create index room_history_order on public.room_history(room_slug,happened_at,id);
alter table public.room_history enable row level security;
revoke all on public.room_history from public,anon,authenticated;
grant select on public.room_history to authenticated;
create policy "own room staff reads administrative history" on public.room_history for select to authenticated
using(public.has_room_role(room_slug,array['owner','leader']));
insert into public.room_history(room_slug,event_kind,target_id,details)
select room_slug,'baseline',user_id,jsonb_build_object('status',status,'originalJoinDate','unknown') from public.room_memberships;
create function public.log_room_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.room_history(room_slug,event_kind,actor_id,target_id,details)
    values(new.room_slug,'membership',auth.uid(),new.user_id,jsonb_build_object('status',new.status,'joinedAt',new.joined_at,'joinDateQuality',new.joined_at_quality));
  end if;
  return new;
end; $$;
revoke all on function public.log_room_membership() from public,anon,authenticated;
create trigger log_room_membership after insert or update of status on public.room_memberships
for each row execute function public.log_room_membership();

create or replace function public.leave_content_room(p_room_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); was_owner boolean; successor uuid; was_active text;
begin
  if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  -- Serializes departures and succession. The unique index is an independent guard.
  perform 1 from public.rooms where slug=p_room_slug for update;
  if not found then raise exception 'room not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  select status into was_active from public.room_memberships where room_slug=p_room_slug and user_id=actor for update;
  if was_active is distinct from 'active' then return; end if;
  was_owner:=public.has_room_role(p_room_slug,array['owner']);
  if was_owner then
    select m.user_id into successor from public.room_memberships m
    where m.room_slug=p_room_slug and m.status='active' and m.user_id<>actor
    order by case when exists(select 1 from public.room_staff s where s.room_slug=p_room_slug and s.user_id=m.user_id and s.role='leader') then 0 else 1 end,
      m.joined_at,m.user_id
    limit 1 for update of m;
  end if;
  update public.room_member_presence set last_seen='1970-01-01',action='idle' where room_slug=p_room_slug and user_id=actor;
  if p_room_slug='dtec' then update public.room_presence set last_seen='1970-01-01',action='idle' where user_id=actor; end if;
  delete from public.room_staff where room_slug=p_room_slug and user_id=actor;
  update public.room_memberships set status='left',updated_at=now() where room_slug=p_room_slug and user_id=actor;
  insert into public.room_departures(room_slug,user_id)values(p_room_slug,actor)on conflict do nothing;
  if was_owner then
    if successor is not null then
      insert into public.room_staff(room_slug,user_id,role,appointed_by)values(p_room_slug,successor,'owner',actor)
      on conflict(room_slug,user_id)do update set role='owner',appointed_by=actor;
    end if;
    insert into public.room_history(room_slug,event_kind,actor_id,target_id,details)
    values(p_room_slug,'ownership',actor,successor,jsonb_build_object('reason','definitive_departure','previousOwner',actor,'newOwner',successor));
  end if;
end; $$;

create function public.edit_room_identity(p_room_slug text,p_title text,p_description text) returns void
language plpgsql security definer set search_path='' as $$
declare previous_title text; previous_description text;
begin
  perform 1 from public.rooms where slug=p_room_slug for update;
  if not public.has_room_role(p_room_slug,array['owner','leader']) then raise exception 'room staff required' using errcode='42501'; end if;
  if p_title is null or char_length(trim(p_title)) not between 3 and 60 or p_description is null or char_length(trim(p_description))>280 then raise exception 'invalid room identity' using errcode='22023'; end if;
  select title,description into previous_title,previous_description from public.rooms where slug=p_room_slug for update;
  update public.rooms set title=trim(p_title),description=trim(p_description) where slug=p_room_slug;
  if previous_title is distinct from trim(p_title) or previous_description is distinct from trim(p_description) then
    insert into public.room_history(room_slug,event_kind,actor_id,details)
    values(p_room_slug,'identity',auth.uid(),jsonb_build_object('previousTitle',previous_title,'title',trim(p_title),'previousDescription',previous_description,'description',trim(p_description)));
  end if;
end; $$;
revoke all on function public.edit_room_identity(text,text,text) from public,anon;
grant execute on function public.edit_room_identity(text,text,text) to authenticated;

-- All admission/role mutations acquire the room row FIRST, then invitation and
-- per-member locks. Recheck permissions after acquiring it, not from a stale UI.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.join_content_room(text)',
    'public.review_room_join_request(text,uuid,boolean)',
    'public.set_room_entry_mode(text,text,text)',
    'public.issue_room_invite(text)',
    'public.redeem_room_invite(text,text)'
  ] loop
    definition:=replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
    if strpos(definition,E'\nbegin\n')=0 then raise exception 'unexpected routine body: %',signature; end if;
    definition:=replace(definition,E'\nbegin\n',E'\nbegin\n  perform 1 from public.rooms where slug=p_room_slug for update;\n');
    execute definition;
  end loop;
end; $$;

-- No client-side INSERT/DELETE can race succession or appoint a nonmember.
revoke insert,delete on public.room_staff from authenticated;
revoke insert(room_slug,user_id,role,appointed_by) on public.room_staff from authenticated;
create function public.set_room_moderator(p_room_slug text,p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare existing_role text;
begin
  perform 1 from public.rooms where slug=p_room_slug for update;
  if not public.has_room_role(p_room_slug,array['owner']) then raise exception 'proprietor required' using errcode='42501'; end if;
  if not public.is_active_room_user(p_room_slug,p_user_id) then raise exception 'active target required' using errcode='42501'; end if;
  select role into existing_role from public.room_staff where room_slug=p_room_slug and user_id=p_user_id;
  if existing_role='owner' then raise exception 'cannot change proprietor role' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'invalid role change' using errcode='22023'; end if;
  if p_enabled then
    insert into public.room_staff(room_slug,user_id,role,appointed_by)values(p_room_slug,p_user_id,'leader',auth.uid())on conflict do nothing;
  else
    delete from public.room_staff where room_slug=p_room_slug and user_id=p_user_id and role='leader';
  end if;
  if found then
    insert into public.room_history(room_slug,event_kind,actor_id,target_id,details)
    values(p_room_slug,'moderator',auth.uid(),p_user_id,jsonb_build_object('enabled',p_enabled));
  end if;
end; $$;
revoke all on function public.set_room_moderator(text,uuid,boolean) from public,anon;
grant execute on function public.set_room_moderator(text,uuid,boolean) to authenticated;
