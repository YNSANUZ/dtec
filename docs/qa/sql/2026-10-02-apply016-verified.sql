-- Apply ONLY to dtec-staging (grbanfuzzrlyapxyhjzc), never production.
-- Calendar function only: assert data/ACL preservation before committing.
begin;
create temporary table cubochat_boundary_before on commit drop as
select 'profiles' as item, md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) as checksum from public.profiles t
union all select 'campaigns',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.fundraisers t
union all select 'participants',md5(coalesce(jsonb_agg(to_jsonb(t) order by fundraiser_id,user_id)::text,'[]')) from public.fundraiser_participants t
union all select 'contributions',md5(coalesce(jsonb_agg(to_jsonb(t) order by fundraiser_id,user_id,cycle_due_date)::text,'[]')) from public.fundraiser_contributions t
union all select 'audit',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.fundraiser_payment_audit t
union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.room_events t
union all select 'function_access',proowner::text||':'||coalesce(proacl::text,'NULL') from pg_proc where oid='public.fundraiser_cycle_due_date(integer,date)'::regprocedure;
-- Correct the due-day boundary to match the approved monthly-cycle contract
-- and getUpcomingDueDate: the next cycle starts on the local due date.
-- Do not rewrite applied migration 003 or any contribution/audit history.
-- CREATE OR REPLACE preserves the existing function owner and execute grants.
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
  if p_as_of < v_due_date then
    return v_due_date;
  end if;
  v_next_month_start := (v_month_start + interval '1 month')::date;
  v_next_month_end := (v_next_month_start + interval '1 month - 1 day')::date;
  return v_next_month_start + (least(p_due_day, extract(day from v_next_month_end)::integer) - 1);
end;
$$;


do $$
begin
  if public.fundraiser_cycle_due_date(2,'2026-10-01') <> date '2026-10-02'
  or public.fundraiser_cycle_due_date(2,'2026-10-02') <> date '2026-11-02'
  or public.fundraiser_cycle_due_date(31,'2027-02-28') <> date '2027-03-31'
  or public.fundraiser_cycle_due_date(31,'2028-02-29') <> date '2028-03-31'
  or public.fundraiser_cycle_due_date(31,'2026-12-31') <> date '2027-01-31'
  then raise exception 'boundary calendar verification failed'; end if;
  if has_function_privilege('anon','public.fundraiser_cycle_due_date(integer,date)','EXECUTE')
  or not has_function_privilege('authenticated','public.fundraiser_cycle_due_date(integer,date)','EXECUTE')
  then raise exception 'calendar privilege verification failed'; end if;
  if exists (
    select * from cubochat_boundary_before
    except
    (select 'profiles',md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) from public.profiles t
    union all select 'campaigns',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.fundraisers t
    union all select 'participants',md5(coalesce(jsonb_agg(to_jsonb(t) order by fundraiser_id,user_id)::text,'[]')) from public.fundraiser_participants t
    union all select 'contributions',md5(coalesce(jsonb_agg(to_jsonb(t) order by fundraiser_id,user_id,cycle_due_date)::text,'[]')) from public.fundraiser_contributions t
    union all select 'audit',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.fundraiser_payment_audit t
    union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.room_events t
    union all select 'function_access',proowner::text||':'||coalesce(proacl::text,'NULL') from pg_proc where oid='public.fundraiser_cycle_due_date(integer,date)'::regprocedure)
  ) then raise exception 'preservation verification failed'; end if;
end;
$$;
commit;
select 'migration016_verified' as result,public.fundraiser_cycle_due_date(2,'2026-10-02')::text as due_boundary,public.fundraiser_cycle_due_date(31,'2028-02-29')::text as leap_boundary;
