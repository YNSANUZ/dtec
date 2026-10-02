create table if not exists public.mural_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mural_messages_order_idx
  on public.mural_messages (is_pinned desc, created_at desc);

alter table public.mural_messages enable row level security;

grant select, insert, update, delete on public.mural_messages to authenticated;

drop policy if exists "authenticated members read mural messages" on public.mural_messages;
create policy "authenticated members read mural messages"
  on public.mural_messages for select
  to authenticated
  using (true);

drop policy if exists "authors create their own unpinned messages" on public.mural_messages;
create policy "authors create their own unpinned messages"
  on public.mural_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and is_pinned = false
  );

drop policy if exists "authors update their own unpinned messages" on public.mural_messages;
create policy "authors update their own unpinned messages"
  on public.mural_messages for update
  to authenticated
  using (
    (select auth.uid()) = author_id
    and is_pinned = false
  )
  with check (
    (select auth.uid()) = author_id
    and is_pinned = false
  );

drop policy if exists "authors delete their own unpinned messages" on public.mural_messages;
create policy "authors delete their own unpinned messages"
  on public.mural_messages for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    and is_pinned = false
  );
