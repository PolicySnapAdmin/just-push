-- Push Thru — automated hygiene (empty guests + score-clone anons)
-- Safe rules only. Does not touch email users or anyone with real progress unless
-- they are a clear anonymous duplicate of an older same-name same-score profile.

-- 1) Empty default "Player" guests (never played)
create or replace function public.jp_cleanup_empty_guests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select u.id
    from auth.users u
    join public.jp_profiles p on p.id = u.id
    where p.display_name = 'Player'
      and coalesce(p.lifetime_count, 0) = 0
      and coalesce(p.high_score, 0) = 0
      and coalesce(p.challenge_best, 0) = 0
      and (
        coalesce(u.is_anonymous, false) = true
        or u.email is null
      )
      -- give brand-new sessions a few minutes (avoid deleting active first paint)
      and u.created_at < now() - interval '30 minutes'
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 2) Anonymous clones of a real name (Billy / Cleetis pattern):
--    same display_name + same high_score + same lifetime as an OLDER profile,
--    and this row is still anonymous. Keeps the oldest (usually the real one).
create or replace function public.jp_cleanup_anon_name_clones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.id
    from public.jp_profiles p
    join auth.users u on u.id = p.id
    where p.display_name is not null
      and p.display_name <> 'Player'
      and (
        coalesce(u.is_anonymous, false) = true
        or u.email is null
      )
      and exists (
        select 1
        from public.jp_profiles older
        where older.display_name = p.display_name
          and older.id <> p.id
          and older.created_at < p.created_at
          and older.high_score = p.high_score
          and older.lifetime_count = p.lifetime_count
          and older.challenge_best = p.challenge_best
      )
      and u.created_at < now() - interval '10 minutes'
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 3) One entry point for schedulers
create or replace function public.jp_run_hygiene()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  empty_n int;
  clone_n int;
begin
  empty_n := public.jp_cleanup_empty_guests();
  clone_n := public.jp_cleanup_anon_name_clones();
  return jsonb_build_object(
    'empty_guests_deleted', empty_n,
    'anon_clones_deleted', clone_n,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.jp_cleanup_empty_guests() from public;
revoke all on function public.jp_cleanup_anon_name_clones() from public;
revoke all on function public.jp_run_hygiene() from public;

-- Only callable by service role / postgres (not browser anon key)
grant execute on function public.jp_cleanup_empty_guests() to service_role;
grant execute on function public.jp_cleanup_anon_name_clones() to service_role;
grant execute on function public.jp_run_hygiene() to service_role;

-- Optional: pg_cron hourly (available on most Supabase projects)
-- If cron schema is missing, this block is skipped safely.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    -- unschedule old job if re-running migration
    begin
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'jp_hygiene_hourly';
    exception when others then
      null;
    end;

    perform cron.schedule(
      'jp_hygiene_hourly',
      '15 * * * *',  -- :15 every hour
      $cron$ select public.jp_run_hygiene(); $cron$
    );
  end if;
end;
$$;
