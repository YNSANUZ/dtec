-- LOCAL DRAFT. Explicit group membership is independent of online presence.
-- No existing content, profile, role, financial or audit row is removed.
create table public.room_memberships (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'active' check(status in('active','left','kicked','banned')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(room_slug,user_id)
);
insert into public.room_memberships(room_slug,user_id)
select 'dtec',user_id from public.room_presence
union select room_slug,user_id from public.room_member_presence
union select room_slug,user_id from public.room_staff;
update public.room_memberships m set status='left' from public.room_departures d
where m.room_slug=d.room_slug and m.user_id=d.user_id;
alter table public.room_memberships enable row level security;
revoke all on public.room_memberships from public,anon,authenticated;
grant select(room_slug,user_id,status) on public.room_memberships to anon,authenticated;
create policy "public membership roster excludes departed people" on public.room_memberships for select to anon,authenticated
using(status='active' or user_id=(select auth.uid()));

create or replace function public.is_content_room_member(p_room_slug text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.room_memberships where room_slug=p_room_slug
    and user_id=(select auth.uid()) and status='active');
$$;
revoke all on function public.is_content_room_member(text) from public,anon;
grant execute on function public.is_content_room_member(text) to authenticated;
create function public.is_active_room_user(p_room_slug text,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.room_memberships where room_slug=p_room_slug and user_id=p_user_id and status='active');
$$;
revoke all on function public.is_active_room_user(text,uuid) from public;
grant execute on function public.is_active_room_user(text,uuid) to anon,authenticated;

create or replace function public.has_room_role(p_room_slug text,p_roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_content_room_member(p_room_slug) and exists(select 1 from public.room_staff
    where room_slug=p_room_slug and user_id=(select auth.uid()) and role=any(p_roles));
$$;

-- One lock namespace for join/leave and presence prevents stale heartbeats from
-- restoring membership after a leave; heartbeat triggers never change status.
drop trigger rejoin_dtec_presence on public.room_presence;
drop trigger rejoin_generic_presence on public.room_member_presence;
drop function public.rejoin_content_room();
create function public.guard_explicit_room_presence() returns trigger
language plpgsql security definer set search_path='' as $$
declare slug text;
begin
  if tg_table_name='room_presence' then slug:='dtec'; else slug:=new.room_slug; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||slug||':'||new.user_id::text));
  if not public.is_active_room_user(slug,new.user_id) then raise exception 'explicit room membership required' using errcode='42501'; end if;
  return new;
end; $$;
revoke all on function public.guard_explicit_room_presence() from public,anon,authenticated;
create trigger guard_explicit_dtec_presence before insert or update on public.room_presence
for each row execute function public.guard_explicit_room_presence();
create trigger guard_explicit_generic_presence before insert or update on public.room_member_presence
for each row execute function public.guard_explicit_room_presence();
drop policy "public can see characters in public rooms" on public.room_member_presence;
create policy "active members remain visible offline" on public.room_member_presence for select to anon,authenticated
using(public.is_active_room_user(room_slug,user_id));
-- Preserve the legacy DTEC read policy names but additionally restrict presence.
create policy "DTEC presence follows explicit membership" on public.room_presence as restrictive for select to anon,authenticated
using(public.is_active_room_user('dtec',user_id));

create function public.join_content_room(p_room_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); existing text;
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor) then raise exception 'completed profile required' using errcode='42501'; end if;
  if not exists(select 1 from public.rooms where slug=p_room_slug) then raise exception 'room not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  select status into existing from public.room_memberships where room_slug=p_room_slug and user_id=actor for update;
  if existing='banned' then raise exception 'room access blocked' using errcode='42501'; end if;
  insert into public.room_memberships(room_slug,user_id)values(p_room_slug,actor)
  on conflict(room_slug,user_id) do update set status='active',updated_at=now();
  delete from public.room_departures where room_slug=p_room_slug and user_id=actor;
end; $$;
create or replace function public.leave_content_room(p_room_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
begin
  if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  if public.has_room_role(p_room_slug,array['owner']) then raise exception 'proprietor cannot abandon the room' using errcode='42501'; end if;
  -- Set presence offline before changing membership. Preserve saved coordinates.
  update public.room_member_presence set last_seen='1970-01-01',action='idle' where room_slug=p_room_slug and user_id=actor and public.is_active_room_user(p_room_slug,actor);
  if p_room_slug='dtec' then update public.room_presence set last_seen='1970-01-01',action='idle' where user_id=actor and public.is_active_room_user('dtec',actor); end if;
  update public.room_memberships set status='left',updated_at=now() where room_slug=p_room_slug and user_id=actor and status='active';
  if found then insert into public.room_departures(room_slug,user_id)values(p_room_slug,actor)on conflict do nothing; end if;
end; $$;
revoke all on function public.join_content_room(text),public.leave_content_room(text) from public,anon;
grant execute on function public.join_content_room(text),public.leave_content_room(text) to authenticated;

create function public.join_created_room() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.created_by is not null then insert into public.room_memberships(room_slug,user_id)values(new.slug,new.created_by); end if;
  return new;
end; $$;
revoke all on function public.join_created_room() from public,anon,authenticated;
create trigger join_created_room after insert on public.rooms for each row execute function public.join_created_room();

-- Public recent chat remains readable by design; sending is member-only.
drop policy "members send their own room chat" on public.room_chat_messages;
create policy "active members send their own room chat" on public.room_chat_messages for insert to authenticated
with check(author_id=(select auth.uid()) and public.is_content_room_member(room_slug));

drop policy "profiles create own room notices" on public.mural_messages;
create policy "active members create own room notices" on public.mural_messages for insert to authenticated
with check(author_id=(select auth.uid()) and not is_pinned and public.is_content_room_member(room_slug));
create policy "departed members cannot mutate room notices" on public.mural_messages as restrictive for update to authenticated
using(public.is_content_room_member(room_slug)) with check(public.is_content_room_member(room_slug));
create policy "departed members cannot remove room notices" on public.mural_messages as restrictive for delete to authenticated
using(public.is_content_room_member(room_slug));
