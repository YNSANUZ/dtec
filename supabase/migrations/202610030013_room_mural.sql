-- Public rooms may be opened explicitly by any authenticated, completed profile.
-- API queries choose a room; RLS independently enforces identity and room staff.
revoke all on public.mural_messages from anon;
revoke insert, update on public.mural_messages from authenticated;
grant insert (room_slug, author_id, content) on public.mural_messages to authenticated;
grant update (content, is_pinned, updated_at) on public.mural_messages to authenticated;

drop policy if exists "authenticated members read mural messages" on public.mural_messages;
drop policy if exists "authors create their own unpinned messages" on public.mural_messages;
drop policy if exists "authors update their own unpinned messages" on public.mural_messages;
drop policy if exists "authors delete their own unpinned messages" on public.mural_messages;
drop policy if exists "DTEC authors create their own unpinned messages" on public.mural_messages;
drop policy if exists "DTEC authors update their own unpinned messages" on public.mural_messages;
drop policy if exists "DTEC authors delete their own unpinned messages" on public.mural_messages;

create policy "profiles read public room notices" on public.mural_messages
  for select to authenticated using (exists (select 1 from public.profiles where user_id = (select auth.uid())));
create policy "profiles create own room notices" on public.mural_messages
  for insert to authenticated with check (
    author_id = (select auth.uid()) and not is_pinned
    and exists (select 1 from public.profiles where user_id = (select auth.uid()))
  );
create policy "authors or room staff edit notices" on public.mural_messages
  for update to authenticated
  using ((author_id = (select auth.uid()) and not is_pinned) or public.has_room_role(room_slug, array['owner','leader']))
  with check ((author_id = (select auth.uid()) and not is_pinned) or public.has_room_role(room_slug, array['owner','leader']));
create policy "authors or room staff remove notices" on public.mural_messages
  for delete to authenticated
  using ((author_id = (select auth.uid()) and not is_pinned) or public.has_room_role(room_slug, array['owner','leader']));

drop policy if exists "authenticated members read mural reactions" on public.mural_message_reactions;
create policy "profiles read reactions of public room notices" on public.mural_message_reactions
  for select to authenticated using (exists (
    select 1 from public.mural_messages m where m.id = message_id
  ));

create or replace function public.toggle_room_mural_reaction(p_room_slug text, p_message_id uuid, p_reaction text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_current text;
begin
  if v_user_id is null or not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'completed profile required' using errcode = '42501';
  end if;
  if p_reaction is null or p_reaction not in ('like','dislike') then
    raise exception 'invalid reaction' using errcode = '22023';
  end if;
  perform 1 from public.mural_messages where id = p_message_id and room_slug = p_room_slug for update;
  if not found then raise exception 'message not found' using errcode = 'P0002'; end if;
  select reaction into v_current from public.mural_message_reactions
    where message_id = p_message_id and user_id = v_user_id;
  if v_current = p_reaction then
    delete from public.mural_message_reactions where message_id = p_message_id and user_id = v_user_id;
    return null;
  elsif v_current is not null then
    update public.mural_message_reactions set reaction = p_reaction, updated_at = now()
      where message_id = p_message_id and user_id = v_user_id;
  else
    insert into public.mural_message_reactions (message_id,user_id,reaction) values (p_message_id,v_user_id,p_reaction);
  end if;
  return p_reaction;
end;
$$;

create or replace function public.clear_room_mural_reaction(p_room_slug text, p_message_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'completed profile required' using errcode = '42501';
  end if;
  perform 1 from public.mural_messages where id = p_message_id and room_slug = p_room_slug for update;
  if not found then raise exception 'message not found' using errcode = 'P0002'; end if;
  delete from public.mural_message_reactions where message_id = p_message_id and user_id = v_user_id;
  return found;
end;
$$;

create or replace function public.get_room_mural_reaction_summary(p_room_slug text, p_message_ids uuid[])
returns table(message_id uuid, like_count bigint, dislike_count bigint, my_reaction text)
language sql stable security definer set search_path = '' as $$
  select m.id, count(r.user_id) filter (where r.reaction = 'like'),
    count(r.user_id) filter (where r.reaction = 'dislike'),
    max(r.reaction) filter (where r.user_id = auth.uid())
  from public.mural_messages m
  left join public.mural_message_reactions r on r.message_id = m.id
  where m.room_slug = p_room_slug and m.id = any(p_message_ids)
    and exists (select 1 from public.profiles where user_id = auth.uid())
  group by m.id;
$$;

-- Legacy routes stay DTEC-only even if a caller bypasses their API checks.
create or replace function public.toggle_mural_reaction(p_message_id uuid, p_reaction text)
returns text language sql security invoker set search_path = '' as $$
  select public.toggle_room_mural_reaction('dtec',p_message_id,p_reaction);
$$;
create or replace function public.clear_mural_reaction(p_message_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select public.clear_room_mural_reaction('dtec',p_message_id);
$$;
create or replace function public.get_mural_reaction_summary(p_message_ids uuid[])
returns table(message_id uuid, like_count bigint, dislike_count bigint, my_reaction text)
language sql stable security invoker set search_path = '' as $$
  select * from public.get_room_mural_reaction_summary('dtec',p_message_ids);
$$;

revoke all on function public.toggle_room_mural_reaction(text,uuid,text),
  public.clear_room_mural_reaction(text,uuid), public.get_room_mural_reaction_summary(text,uuid[])
  from public, anon;
grant execute on function public.toggle_room_mural_reaction(text,uuid,text),
  public.clear_room_mural_reaction(text,uuid), public.get_room_mural_reaction_summary(text,uuid[])
  to authenticated;
