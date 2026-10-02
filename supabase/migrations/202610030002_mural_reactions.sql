create table if not exists public.mural_message_reactions (
  message_id uuid not null references public.mural_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists mural_message_reactions_list_idx
  on public.mural_message_reactions (message_id, reaction, created_at desc);

alter table public.mural_message_reactions enable row level security;
grant select on public.mural_message_reactions to authenticated;
revoke insert, update, delete on public.mural_message_reactions from anon, authenticated;

drop policy if exists "authenticated members read mural reactions" on public.mural_message_reactions;
create policy "authenticated members read mural reactions"
  on public.mural_message_reactions for select
  to authenticated
  using (true);

create or replace function public.toggle_mural_reaction(p_message_id uuid, p_reaction text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_reaction not in ('like', 'dislike') then
    raise exception 'invalid reaction' using errcode = '22023';
  end if;

  -- Lock the parent so simultaneous first reactions serialize before checking absence.
  perform 1 from public.mural_messages where id = p_message_id for update;
  if not found then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  select reaction into v_current
    from public.mural_message_reactions
    where message_id = p_message_id and user_id = v_user_id;

  if v_current = p_reaction then
    delete from public.mural_message_reactions
      where message_id = p_message_id and user_id = v_user_id;
    return null;
  elsif v_current is not null then
    update public.mural_message_reactions
      set reaction = p_reaction, updated_at = now()
      where message_id = p_message_id and user_id = v_user_id;
  else
    insert into public.mural_message_reactions (message_id, user_id, reaction)
      values (p_message_id, v_user_id, p_reaction);
  end if;
  return p_reaction;
end;
$$;

revoke all on function public.toggle_mural_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_mural_reaction(uuid, text) to authenticated;

create or replace function public.clear_mural_reaction(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform 1 from public.mural_messages where id = p_message_id for update;
  if not found then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  delete from public.mural_message_reactions
    where message_id = p_message_id and user_id = v_user_id;
  return found;
end;
$$;

create or replace function public.get_mural_reaction_summary(p_message_ids uuid[])
returns table(message_id uuid, like_count bigint, dislike_count bigint, my_reaction text)
language sql
stable
security definer
set search_path = ''
as $$
  select ids.message_id,
    count(*) filter (where r.reaction = 'like') as like_count,
    count(*) filter (where r.reaction = 'dislike') as dislike_count,
    max(r.reaction) filter (where r.user_id = auth.uid()) as my_reaction
  from unnest(p_message_ids) as ids(message_id)
  left join public.mural_message_reactions as r on r.message_id = ids.message_id
  group by ids.message_id;
$$;

revoke all on function public.clear_mural_reaction(uuid) from public, anon;
grant execute on function public.clear_mural_reaction(uuid) to authenticated;
revoke all on function public.get_mural_reaction_summary(uuid[]) from public, anon;
grant execute on function public.get_mural_reaction_summary(uuid[]) to authenticated;
