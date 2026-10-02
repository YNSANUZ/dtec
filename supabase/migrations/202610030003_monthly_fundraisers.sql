create table if not exists public.fundraisers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1500),
  monthly_amount_cents bigint not null check (monthly_amount_cents > 0),
  due_day smallint not null check (due_day between 1 and 31),
  pix_key text check (pix_key is null or char_length(pix_key) <= 200),
  payment_instructions text not null default '' check (char_length(payment_instructions) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fundraisers_status_created_idx
  on public.fundraisers(status, created_at desc);

alter table public.fundraisers enable row level security;
revoke all on public.fundraisers from public, anon;
grant select, insert on public.fundraisers to authenticated;
grant update (title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, updated_at)
  on public.fundraisers to authenticated;

drop policy if exists "completed members read fundraisers" on public.fundraisers;
create policy "completed members read fundraisers"
  on public.fundraisers for select to authenticated
  using (exists (select 1 from public.profiles where user_id = (select auth.uid())));

drop policy if exists "ADM MOD create fundraisers" on public.fundraisers;
create policy "ADM MOD create fundraisers"
  on public.fundraisers for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_room_moderator())
  );

drop policy if exists "ADM MOD update fundraisers" on public.fundraisers;
create policy "ADM MOD update fundraisers"
  on public.fundraisers for update to authenticated
  using ((select public.is_room_moderator()))
  with check ((select public.is_room_moderator()));

create table if not exists public.fundraiser_participants (
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (fundraiser_id, user_id),
  check (active = (ended_at is null))
);

create index if not exists fundraiser_participants_active_idx
  on public.fundraiser_participants(fundraiser_id, user_id) where active;

alter table public.fundraiser_participants enable row level security;
revoke all on public.fundraiser_participants from public, anon;
grant select on public.fundraiser_participants to authenticated;
grant insert (fundraiser_id, user_id) on public.fundraiser_participants to authenticated;
grant update (active, ended_at) on public.fundraiser_participants to authenticated;

drop policy if exists "completed members read fundraiser participants" on public.fundraiser_participants;
create policy "completed members read fundraiser participants"
  on public.fundraiser_participants for select to authenticated
  using (exists (select 1 from public.profiles where user_id = (select auth.uid())));

drop policy if exists "members or ADM MOD add fundraiser participants" on public.fundraiser_participants;
create policy "members or ADM MOD add fundraiser participants"
  on public.fundraiser_participants for insert to authenticated
  with check (
    active
    and ended_at is null
    and (user_id = (select auth.uid()) or (select public.is_room_moderator()))
    and exists (select 1 from public.fundraisers where id = fundraiser_id and status = 'open')
  );

drop policy if exists "members or ADM MOD update fundraiser participants" on public.fundraiser_participants;
create policy "members or ADM MOD update fundraiser participants"
  on public.fundraiser_participants for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_room_moderator()))
  with check (
    (user_id = (select auth.uid()) or (select public.is_room_moderator()))
    and (not active or exists (select 1 from public.fundraisers where id = fundraiser_id and status = 'open'))
  );

create table if not exists public.fundraiser_contributions (
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  cycle_due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  marked_by uuid references public.profiles(user_id) on delete set null,
  marked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (fundraiser_id, user_id, cycle_due_date),
  check ((status = 'pending' and marked_by is null and marked_at is null) or status = 'paid')
);

create index if not exists fundraiser_contributions_cycle_idx
  on public.fundraiser_contributions(fundraiser_id, cycle_due_date, status, user_id);

alter table public.fundraiser_contributions enable row level security;
revoke all on public.fundraiser_contributions from public, anon;
grant select on public.fundraiser_contributions to authenticated;

drop policy if exists "completed members read fundraiser contributions" on public.fundraiser_contributions;
create policy "completed members read fundraiser contributions"
  on public.fundraiser_contributions for select to authenticated
  using (exists (select 1 from public.profiles where user_id = (select auth.uid())));

create table if not exists public.fundraiser_payment_audit (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid not null references public.fundraisers(id) on delete restrict,
  participant_id uuid references public.profiles(user_id) on delete set null,
  cycle_due_date date not null,
  previous_status text check (previous_status is null or previous_status in ('pending', 'paid')),
  new_status text not null check (new_status in ('pending', 'paid')),
  actor_id uuid references public.profiles(user_id) on delete set null,
  source text not null check (source in ('self', 'adm', 'mod')),
  created_at timestamptz not null default now()
);

create index if not exists fundraiser_payment_audit_history_idx
  on public.fundraiser_payment_audit(fundraiser_id, participant_id, cycle_due_date, created_at desc);

alter table public.fundraiser_payment_audit enable row level security;
revoke all on public.fundraiser_payment_audit from public, anon;
grant select on public.fundraiser_payment_audit to authenticated;

drop policy if exists "ADM MOD read fundraiser payment audit" on public.fundraiser_payment_audit;
create policy "ADM MOD read fundraiser payment audit"
  on public.fundraiser_payment_audit for select to authenticated
  using ((select public.is_room_moderator()));

create or replace function public.fundraiser_cycle_due_date(p_due_day integer, p_as_of date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month_start date;
  v_month_end date;
  v_due_date date;
  v_next_month_start date;
  v_next_month_end date;
begin
  if p_due_day is null or p_due_day < 1 or p_due_day > 31 or p_as_of is null then
    raise exception 'invalid cycle date';
  end if;
  v_month_start := date_trunc('month', p_as_of)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_due_date := v_month_start + (least(p_due_day, extract(day from v_month_end)::integer) - 1);
  if p_as_of <= v_due_date then
    return v_due_date;
  end if;
  v_next_month_start := (v_month_start + interval '1 month')::date;
  v_next_month_end := (v_next_month_start + interval '1 month - 1 day')::date;
  return v_next_month_start + (least(p_due_day, extract(day from v_next_month_end)::integer) - 1);
end;
$$;

revoke all on function public.fundraiser_cycle_due_date(integer, date) from public, anon;
grant execute on function public.fundraiser_cycle_due_date(integer, date) to authenticated;

create or replace function public.ensure_fundraiser_current_cycle(p_fundraiser_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_due_day integer;
  v_cycle_due_date date;
begin
  if v_actor is null or not exists (select 1 from public.profiles where user_id = v_actor) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select due_day into v_due_day
  from public.fundraisers
  where id = p_fundraiser_id and status = 'open';
  if not found then raise exception 'fundraiser not found or closed' using errcode = 'P0002'; end if;
  v_cycle_due_date := public.fundraiser_cycle_due_date(
    v_due_day,
    (statement_timestamp() at time zone 'America/Sao_Paulo')::date
  );
  insert into public.fundraiser_contributions (fundraiser_id, user_id, cycle_due_date)
  select p.fundraiser_id, p.user_id, v_cycle_due_date
  from public.fundraiser_participants p
  where p.fundraiser_id = p_fundraiser_id and p.active
  on conflict (fundraiser_id, user_id, cycle_due_date) do nothing;
  return v_cycle_due_date;
end;
$$;

revoke all on function public.ensure_fundraiser_current_cycle(uuid) from public, anon;
grant execute on function public.ensure_fundraiser_current_cycle(uuid) to authenticated;

create or replace function public.set_fundraiser_payment(
  p_fundraiser_id uuid,
  p_cycle_due_date date,
  p_participant_id uuid,
  p_paid boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_due_day integer;
  v_expected_cycle date;
  v_old_status text;
  v_new_status text;
  v_source text;
begin
  if v_actor is null or not exists (select 1 from public.profiles where user_id = v_actor) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_participant_id is null or p_paid is null then raise exception 'invalid payment update'; end if;
  select due_day into v_due_day
  from public.fundraisers
  where id = p_fundraiser_id and status = 'open';
  if not found then raise exception 'fundraiser not found or closed' using errcode = 'P0002'; end if;
  v_expected_cycle := public.fundraiser_cycle_due_date(
    v_due_day,
    (statement_timestamp() at time zone 'America/Sao_Paulo')::date
  );
  if p_cycle_due_date is distinct from v_expected_cycle then
    raise exception 'stale fundraiser cycle' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.fundraiser_participants
    where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and active
  ) then raise exception 'participant not active' using errcode = '42501'; end if;
  if v_actor <> p_participant_id then
    select role into v_role from public.room_roles where user_id = v_actor;
    if v_role not in ('owner', 'leader') or v_role is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  perform public.ensure_fundraiser_current_cycle(p_fundraiser_id);
  select status into v_old_status
  from public.fundraiser_contributions
  where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and cycle_due_date = p_cycle_due_date
  for update;
  if not found then raise exception 'payment state missing' using errcode = 'P0002'; end if;
  v_new_status := case when p_paid then 'paid' else 'pending' end;
  if v_old_status = v_new_status then return false; end if;
  update public.fundraiser_contributions
  set status = v_new_status,
      marked_by = case when p_paid then v_actor else null end,
      marked_at = case when p_paid then statement_timestamp() else null end,
      updated_at = statement_timestamp()
  where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and cycle_due_date = p_cycle_due_date;
  if v_actor = p_participant_id then
    v_source := 'self';
  elsif v_role = 'owner' then
    v_source := 'adm';
  else
    v_source := 'mod';
  end if;
  insert into public.fundraiser_payment_audit (
    fundraiser_id, participant_id, cycle_due_date, previous_status, new_status, actor_id, source
  ) values (
    p_fundraiser_id, p_participant_id, p_cycle_due_date, v_old_status, v_new_status, v_actor, v_source
  );
  return true;
end;
$$;

revoke all on function public.set_fundraiser_payment(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.set_fundraiser_payment(uuid, date, uuid, boolean) to authenticated;
