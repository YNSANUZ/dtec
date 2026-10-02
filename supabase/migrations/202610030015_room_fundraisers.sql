-- Preserve original campaigns and their dependent IDs, cycles and audit history.
alter table public.fundraisers add column if not exists room_slug text not null default 'dtec'
  references public.rooms(slug) on delete restrict;
create index if not exists fundraisers_room_status_idx on public.fundraisers(room_slug,status,created_at desc);
revoke insert on public.fundraisers from authenticated;
grant insert (room_slug,title,description,monthly_amount_cents,due_day,pix_key,payment_instructions,created_by)
  on public.fundraisers to authenticated;
-- Existing UPDATE grants exclude creator, ID and room_slug.
drop policy if exists "ADM MOD create fundraisers" on public.fundraisers;
drop policy if exists "ADM MOD update fundraisers" on public.fundraisers;
create policy "staff create fundraiser in own room" on public.fundraisers for insert to authenticated
  with check (created_by = (select auth.uid()) and public.has_room_role(room_slug,array['owner','leader']));
create policy "staff update fundraiser in own room" on public.fundraisers for update to authenticated
  using (public.has_room_role(room_slug,array['owner','leader']))
  with check (public.has_room_role(room_slug,array['owner','leader']));

drop policy if exists "completed members read fundraiser participants" on public.fundraiser_participants;
create policy "profiles read participants through campaign" on public.fundraiser_participants
  for select to authenticated using (exists (select 1 from public.fundraisers where id = fundraiser_id));
drop policy if exists "members or ADM MOD add fundraiser participants" on public.fundraiser_participants;
create policy "self or own-room staff add participants" on public.fundraiser_participants
  for insert to authenticated with check (active and ended_at is null and exists (
    select 1 from public.fundraisers f where f.id = fundraiser_id and f.status = 'open'
      and (user_id = (select auth.uid()) or public.has_room_role(f.room_slug,array['owner','leader']))
  ));
drop policy if exists "members or ADM MOD update fundraiser participants" on public.fundraiser_participants;
create policy "self or own-room staff update participants" on public.fundraiser_participants
  for update to authenticated using (exists (
    select 1 from public.fundraisers f where f.id = fundraiser_id
      and (user_id = (select auth.uid()) or public.has_room_role(f.room_slug,array['owner','leader']))
  )) with check (exists (
    select 1 from public.fundraisers f where f.id = fundraiser_id and (not active or f.status = 'open')
      and (user_id = (select auth.uid()) or public.has_room_role(f.room_slug,array['owner','leader']))
  ));
drop policy if exists "completed members read fundraiser contributions" on public.fundraiser_contributions;
create policy "profiles read payments through campaign" on public.fundraiser_contributions
  for select to authenticated using (exists (select 1 from public.fundraisers where id = fundraiser_id));
drop policy if exists "ADM MOD read fundraiser payment audit" on public.fundraiser_payment_audit;
create policy "own-room staff read payment audit" on public.fundraiser_payment_audit
  for select to authenticated using (exists (
    select 1 from public.fundraisers f where f.id = fundraiser_id
      and public.has_room_role(f.room_slug,array['owner','leader'])
  ));

create or replace function public.ensure_room_fundraiser_current_cycle(p_room_slug text, p_fundraiser_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_due_day integer; v_cycle date;
begin
  if v_actor is null or not exists (select 1 from public.profiles where user_id = v_actor) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- Serialize cycle initialization with due-day/status edits and payment changes.
  select due_day into v_due_day from public.fundraisers
    where id = p_fundraiser_id and room_slug = p_room_slug and status = 'open' for update;
  if not found then raise exception 'fundraiser not found or closed' using errcode = 'P0002'; end if;
  v_cycle := public.fundraiser_cycle_due_date(v_due_day,(statement_timestamp() at time zone 'America/Sao_Paulo')::date);
  insert into public.fundraiser_contributions(fundraiser_id,user_id,cycle_due_date)
    select p.fundraiser_id,p.user_id,v_cycle from public.fundraiser_participants p
    where p.fundraiser_id = p_fundraiser_id and p.active
    on conflict (fundraiser_id,user_id,cycle_due_date) do nothing;
  return v_cycle;
end;
$$;

create or replace function public.set_room_fundraiser_payment(
  p_room_slug text, p_fundraiser_id uuid, p_cycle_due_date date, p_participant_id uuid, p_paid boolean
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_role text; v_due_day integer;
  v_expected_cycle date; v_old text; v_new text; v_source text;
begin
  if v_actor is null or not exists (select 1 from public.profiles where user_id = v_actor) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_participant_id is null or p_paid is null then
    raise exception 'invalid payment update' using errcode = '22023';
  end if;
  select due_day into v_due_day from public.fundraisers
    where id = p_fundraiser_id and room_slug = p_room_slug and status = 'open' for update;
  if not found then raise exception 'fundraiser not found or closed' using errcode = 'P0002'; end if;
  v_expected_cycle := public.fundraiser_cycle_due_date(v_due_day,(statement_timestamp() at time zone 'America/Sao_Paulo')::date);
  if p_cycle_due_date is distinct from v_expected_cycle then
    raise exception 'stale fundraiser cycle' using errcode = '22023';
  end if;
  perform 1 from public.fundraiser_participants
    where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and active for update;
  if not found then raise exception 'participant not active' using errcode = '42501'; end if;
  if v_actor <> p_participant_id then
    select role into v_role from public.room_staff where room_slug = p_room_slug and user_id = v_actor;
    if v_role is null or v_role not in ('owner','leader') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  perform public.ensure_room_fundraiser_current_cycle(p_room_slug,p_fundraiser_id);
  select status into v_old from public.fundraiser_contributions
    where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and cycle_due_date = p_cycle_due_date for update;
  if not found then raise exception 'payment state missing' using errcode = 'P0002'; end if;
  v_new := case when p_paid then 'paid' else 'pending' end;
  if v_old = v_new then return false; end if;
  update public.fundraiser_contributions set status = v_new,
    marked_by = case when p_paid then v_actor else null end,
    marked_at = case when p_paid then statement_timestamp() else null end,
    updated_at = statement_timestamp()
    where fundraiser_id = p_fundraiser_id and user_id = p_participant_id and cycle_due_date = p_cycle_due_date;
  v_source := case when v_actor = p_participant_id then 'self' when v_role = 'owner' then 'adm' else 'mod' end;
  insert into public.fundraiser_payment_audit(fundraiser_id,participant_id,cycle_due_date,previous_status,new_status,actor_id,source)
    values (p_fundraiser_id,p_participant_id,p_cycle_due_date,v_old,v_new,v_actor,v_source);
  return true;
end;
$$;

create or replace function public.ensure_fundraiser_current_cycle(p_fundraiser_id uuid)
returns date language sql security invoker set search_path = '' as $$
  select public.ensure_room_fundraiser_current_cycle('dtec',p_fundraiser_id);
$$;
create or replace function public.set_fundraiser_payment(p_fundraiser_id uuid,p_cycle_due_date date,p_participant_id uuid,p_paid boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select public.set_room_fundraiser_payment('dtec',p_fundraiser_id,p_cycle_due_date,p_participant_id,p_paid);
$$;
revoke all on function public.ensure_room_fundraiser_current_cycle(text,uuid),
  public.set_room_fundraiser_payment(text,uuid,date,uuid,boolean) from public,anon;
grant execute on function public.ensure_room_fundraiser_current_cycle(text,uuid),
  public.set_room_fundraiser_payment(text,uuid,date,uuid,boolean) to authenticated;
