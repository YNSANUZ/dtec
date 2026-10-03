-- LOCAL DRAFT: a signed-in visitor requests admission, never activates itself.
-- Invitation-token redemption is intentionally absent pending the security decision.
create table public.room_join_requests (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check(status in('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(user_id),
  primary key(room_slug,user_id)
);
alter table public.room_join_requests enable row level security;
revoke all on public.room_join_requests from public,anon,authenticated;
grant select on public.room_join_requests to authenticated;
create policy "requester and room staff read admissions" on public.room_join_requests for select to authenticated
using(user_id=(select auth.uid()) or public.has_room_role(room_slug,array['owner','leader']));

create or replace function public.join_content_room(p_room_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); existing text;
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor) then raise exception 'completed profile required' using errcode='42501'; end if;
  if not exists(select 1 from public.rooms where slug=p_room_slug) then raise exception 'room not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  select status into existing from public.room_memberships where room_slug=p_room_slug and user_id=actor for update;
  if existing='banned' then raise exception 'room access blocked' using errcode='42501'; end if;
  if existing='active' then return; end if;
  insert into public.room_join_requests(room_slug,user_id) values(p_room_slug,actor)
  on conflict(room_slug,user_id) do update set status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null
  where public.room_join_requests.status<>'pending' and public.room_join_requests.requested_at < now()-interval '1 hour';
end; $$;

create function public.review_room_join_request(p_room_slug text,p_user_id uuid,p_accept boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); current_status text;
begin
  if not public.has_room_role(p_room_slug,array['owner','leader']) then raise exception 'room staff required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||p_user_id::text));
  select status into current_status from public.room_memberships where room_slug=p_room_slug and user_id=p_user_id for update;
  if current_status='banned' then raise exception 'cannot admit a banned person' using errcode='42501'; end if;
  update public.room_join_requests set status=case when p_accept then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=actor where room_slug=p_room_slug and user_id=p_user_id and status='pending';
  if not found then return false; end if;
  if p_accept then
    insert into public.room_memberships(room_slug,user_id)values(p_room_slug,p_user_id)
    on conflict(room_slug,user_id)do update set status='active',updated_at=now();
    delete from public.room_departures where room_slug=p_room_slug and user_id=p_user_id;
  end if;
  return true;
end; $$;
revoke all on function public.review_room_join_request(text,uuid,boolean) from public,anon;
grant execute on function public.review_room_join_request(text,uuid,boolean) to authenticated;

-- No signed-in or anonymous visitor can read panels or their underlying content.
create policy "only active members read board organization" on public.room_board_nodes as restrictive for select to authenticated
using(public.is_content_room_member(room_slug));
create policy "only active members read notices" on public.mural_messages as restrictive for select to authenticated
using(public.is_content_room_member(room_slug));
create policy "only active members read events" on public.room_events as restrictive for select to authenticated
using(public.is_content_room_member(room_slug));
create policy "only active members read campaigns" on public.fundraisers as restrictive for select to authenticated
using(public.is_content_room_member(room_slug));
-- Child-table policies in 013–015 check the visible parent row first.
-- Public recent chat is unchanged; the human correction concerns panels.

-- SECURITY DEFINER routines bypass RLS: gate their existing bodies explicitly.
-- Fail the migration if an expected body is different; never silently skip a gate.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.toggle_room_mural_reaction(text,uuid,text)',
    'public.clear_room_mural_reaction(text,uuid)',
    'public.ensure_room_fundraiser_current_cycle(text,uuid)',
    'public.set_room_fundraiser_payment(text,uuid,date,uuid,boolean)'
  ] loop
    -- SQL Editor may retain Windows CRLF in existing routine bodies.
    -- Normalize line endings only; never skip the required membership gate.
    definition := replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
    if strpos(definition,E'\nbegin\n')=0 then raise exception 'unexpected routine body: %',signature; end if;
    definition := replace(definition,E'\nbegin\n',E'\nbegin\n  if not public.is_content_room_member(p_room_slug) then raise exception ''active room membership required'' using errcode=''42501''; end if;\n');
    execute definition;
  end loop;
end; $$;

create or replace function public.get_room_mural_reaction_summary(p_room_slug text,p_message_ids uuid[])
returns table(message_id uuid,like_count bigint,dislike_count bigint,my_reaction text)
language sql stable security definer set search_path='' as $$
  select m.id,count(r.user_id)filter(where r.reaction='like'),
    count(r.user_id)filter(where r.reaction='dislike'),max(r.reaction)filter(where r.user_id=auth.uid())
  from public.mural_messages m left join public.mural_message_reactions r on r.message_id=m.id
  where m.room_slug=p_room_slug and m.id=any(p_message_ids) and public.is_content_room_member(p_room_slug)
  group by m.id;
$$;
