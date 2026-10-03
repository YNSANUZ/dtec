-- LOCAL DRAFT. Human chose exactly two lowercase letters and two digits.
-- Reusable by multiple Google users until expiration or explicit reset.
-- This small code space is not strong authentication: Google is still required.
create table public.room_admission_settings (
  room_slug text primary key references public.rooms(slug),
  entry_mode text not null default 'public' check(entry_mode in('protected','public')),
  invite_lifetime text not null default '10m' check(invite_lifetime in('10m','1h','1d','1mo'))
);
alter table public.room_admission_settings enable row level security;
revoke all on public.room_admission_settings from public,anon,authenticated;
grant select(room_slug,entry_mode,invite_lifetime) on public.room_admission_settings to anon,authenticated;
create policy "room entry mode is visible without invitation secrets" on public.room_admission_settings for select to anon,authenticated using(true);

create function public.set_room_entry_mode(p_room_slug text,p_mode text,p_lifetime text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.has_room_role(p_room_slug,array['owner','leader']) then raise exception 'room staff required' using errcode='42501'; end if;
  if p_mode is null or p_mode not in('protected','public') then raise exception 'invalid entry mode' using errcode='22023'; end if;
  if p_lifetime is null or p_lifetime not in('10m','1h','1d','1mo') then raise exception 'invalid lifetime' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('room-invite:'||p_room_slug));
  insert into public.room_admission_settings(room_slug,entry_mode,invite_lifetime)values(p_room_slug,p_mode,p_lifetime)
    on conflict(room_slug)do update set entry_mode=excluded.entry_mode,invite_lifetime=excluded.invite_lifetime;
  update public.room_invites set revoked_at=clock_timestamp() where room_slug=p_room_slug and revoked_at is null;
end; $$;

create or replace function public.join_content_room(p_room_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing text; mode text;
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor) then raise exception 'completed profile required' using errcode='42501'; end if;
  if not exists(select 1 from public.rooms where slug=p_room_slug) then raise exception 'room not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('room-invite:'||p_room_slug));
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  select status into existing from public.room_memberships where room_slug=p_room_slug and user_id=actor for update;
  if existing='banned' then raise exception 'room access blocked' using errcode='42501'; end if;
  if existing='active' then return; end if;
  select entry_mode into mode from public.room_admission_settings where room_slug=p_room_slug;
  if coalesce(mode,'public')='public' then
    insert into public.room_memberships(room_slug,user_id)values(p_room_slug,actor)
      on conflict(room_slug,user_id)do update set status='active',updated_at=now();
    delete from public.room_departures where room_slug=p_room_slug and user_id=actor;
    return;
  end if;
  insert into public.room_join_requests(room_slug,user_id)values(p_room_slug,actor)
    on conflict(room_slug,user_id)do update set status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null
    where public.room_join_requests.status<>'pending' and public.room_join_requests.requested_at<now()-interval '1 hour';
end; $$;
create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms(slug),
  salt uuid not null default gen_random_uuid(),
  token_hash text not null check(length(token_hash)=64),
  created_by uuid not null references public.profiles(user_id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  failed_attempts integer not null default 0 check(failed_attempts between 0 and 20)
);
create table public.room_invite_attempts (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms(slug),
  user_id uuid not null references public.profiles(user_id),
  attempted_at timestamptz not null default clock_timestamp(),
  success boolean not null
);
create index room_invite_attempt_limits on public.room_invite_attempts(room_slug,attempted_at,user_id);
alter table public.room_invites enable row level security;
alter table public.room_invite_attempts enable row level security;
revoke all on public.room_invites,public.room_invite_attempts from public,anon,authenticated;
-- No client, including staff, reads the salt/hash or attempt ledger directly.
create function public.issue_room_invite(p_room_slug text) returns text
language plpgsql security definer set search_path='' as $$
declare code text:=''; entropy integer; chosen_salt uuid:=gen_random_uuid(); actor uuid:=auth.uid(); lifetime text; duration interval;
begin
  if not public.has_room_role(p_room_slug,array['owner','leader']) then raise exception 'room staff required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('room-invite:'||p_room_slug));
  if not exists(select 1 from public.room_admission_settings where room_slug=p_room_slug and entry_mode='protected') then raise exception 'public entry does not need a token' using errcode='22023'; end if;
  select invite_lifetime into lifetime from public.room_admission_settings where room_slug=p_room_slug;
  duration:=case lifetime when '1h' then interval '1 hour' when '1d' then interval '1 day' when '1mo' then interval '1 month' else interval '10 minutes' end;
  -- Uniform rejection sampling, not random() or a predictable timestamp.
  for generation in 1..100 loop
    code:='';
    for i in 1..4 loop
      loop
        entropy:=get_byte(uuid_send(gen_random_uuid()),0);
        exit when entropy < case when i<=2 then 234 else 250 end;
      end loop;
      code:=code||case when i<=2 then chr(97+entropy%26) else chr(48+entropy%10) end;
    end loop;
    exit when not exists(select 1 from public.room_invites where room_slug=p_room_slug and expires_at>clock_timestamp()
      and token_hash=encode(sha256(convert_to(p_room_slug||':'||salt::text||':'||code,'UTF8')),'hex'));
    if generation=100 then raise exception 'invite code space temporarily exhausted' using errcode='54000'; end if;
  end loop;
  update public.room_invites set revoked_at=clock_timestamp() where room_slug=p_room_slug and revoked_at is null;
  insert into public.room_invites(room_slug,salt,token_hash,created_by,expires_at)
  values(p_room_slug,chosen_salt,encode(sha256(convert_to(p_room_slug||':'||chosen_salt::text||':'||code,'UTF8')),'hex'),actor,clock_timestamp()+duration);
  return code;
end; $$;

create function public.redeem_room_invite(p_room_slug text,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); invitation public.room_invites; existing text;
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor) then raise exception 'completed profile required' using errcode='42501'; end if;
  if not exists(select 1 from public.rooms where slug=p_room_slug) then return false; end if;
  perform pg_advisory_xact_lock(hashtext('room-invite:'||p_room_slug));
  perform pg_advisory_xact_lock(hashtext('room-membership:'||p_room_slug||':'||actor::text));
  select status into existing from public.room_memberships where room_slug=p_room_slug and user_id=actor for update;
  if existing='banned' then return false; end if;
  if existing='active' then return true; end if;
  if not exists(select 1 from public.room_admission_settings where room_slug=p_room_slug and entry_mode='protected') then return false; end if;
  if (select count(*) from public.room_invite_attempts where room_slug=p_room_slug and user_id=actor and not success and attempted_at>clock_timestamp()-interval '15 minutes')>=5
    or (select count(*) from public.room_invite_attempts where room_slug=p_room_slug and not success and attempted_at>clock_timestamp()-interval '10 minutes')>=20 then return false; end if;
  select * into invitation from public.room_invites where room_slug=p_room_slug and revoked_at is null and expires_at>clock_timestamp() and failed_attempts<20 for update;
  if invitation.id is null then return false; end if;
  if p_token is null or p_token !~ '^[a-z]{2}[0-9]{2}$' or invitation.token_hash<>encode(sha256(convert_to(p_room_slug||':'||invitation.salt::text||':'||p_token,'UTF8')),'hex') then
    insert into public.room_invite_attempts(room_slug,user_id,success)values(p_room_slug,actor,false);
    update public.room_invites set failed_attempts=failed_attempts+1,revoked_at=case when failed_attempts+1>=20 then clock_timestamp() else revoked_at end where id=invitation.id;
    return false;
  end if;
  insert into public.room_invite_attempts(room_slug,user_id,success)values(p_room_slug,actor,true);
  insert into public.room_memberships(room_slug,user_id)values(p_room_slug,actor)
    on conflict(room_slug,user_id)do update set status='active',updated_at=now();
  delete from public.room_departures where room_slug=p_room_slug and user_id=actor;
  update public.room_join_requests set status='approved',reviewed_at=clock_timestamp(),reviewed_by=invitation.created_by where room_slug=p_room_slug and user_id=actor and status='pending';
  return true;
end; $$;
revoke all on function public.issue_room_invite(text),public.redeem_room_invite(text,text),public.set_room_entry_mode(text,text,text) from public,anon;
grant execute on function public.issue_room_invite(text),public.redeem_room_invite(text,text),public.set_room_entry_mode(text,text,text) to authenticated;
