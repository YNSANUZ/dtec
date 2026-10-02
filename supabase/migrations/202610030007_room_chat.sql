create table if not exists public.room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms(slug) on delete cascade,
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 100),
  created_at timestamptz not null default now()
);

create index if not exists room_chat_messages_recent_idx
  on public.room_chat_messages (room_slug, created_at desc, id desc);

alter table public.room_chat_messages enable row level security;
grant select on public.room_chat_messages to anon, authenticated;
grant insert (room_slug, author_id, content) on public.room_chat_messages to authenticated;
revoke update, delete on public.room_chat_messages from anon, authenticated;

create policy "everyone sees recent room chat"
  on public.room_chat_messages for select to anon, authenticated using (true);
create policy "members send their own room chat"
  on public.room_chat_messages for insert to authenticated
  with check ((select auth.uid()) = author_id);

create or replace function public.trim_room_chat_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.room_slug));
  delete from public.room_chat_messages
  where room_slug = new.room_slug and id not in (
    select id from public.room_chat_messages
    where room_slug = new.room_slug
    order by created_at desc, id desc limit 5
  );
  return new;
end;
$$;

create trigger trim_room_chat_history_after_insert
after insert on public.room_chat_messages
for each row execute function public.trim_room_chat_history();
