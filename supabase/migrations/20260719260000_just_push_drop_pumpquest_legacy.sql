-- Drop abandoned PumpQuest (station/fuel) schema from this Supabase project.
-- KEEP: all jp_* (Push Thru) and policysnap_* (PolicySnap Chrome extension).
-- Does NOT touch GitHub repos — only database objects on this project.

-- PumpQuest tables (profiles with fuel_points / station_visits / loadout)
drop table if exists public.station_visits cascade;
drop table if exists public.friendships cascade;
drop table if exists public.profiles cascade;

-- Generic trigger helper if only used by PumpQuest (jp_* has its own jp_set_updated_at)
-- Only drop if no remaining dependents
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) and not exists (
    select 1 from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    drop function if exists public.set_updated_at() cascade;
  end if;
exception when others then
  raise notice 'skip set_updated_at drop: %', sqlerrm;
end $$;

-- Explicit: PolicySnap + Push Thru stay
-- public.policysnap_usage_client
-- public.policysnap_usage_ip
-- public.policysnap_* functions
-- public.jp_* everything
;