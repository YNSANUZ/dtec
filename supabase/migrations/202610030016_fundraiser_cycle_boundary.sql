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
