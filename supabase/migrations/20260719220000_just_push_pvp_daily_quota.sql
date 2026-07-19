-- PvP daily challenge quota: 10 requests/day + 1 extra per win that day (UTC)

create or replace function public.jp_pvp_utc_day_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- Internal: quota snapshot for a user (security definer callers only)
create or replace function public.jp_pvp_quota_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  day_start timestamptz := public.jp_pvp_utc_day_start();
  base_limit int := 10;
  sent int;
  wins int;
  allowed int;
  remaining int;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'base_limit', base_limit,
      'sent', 0,
      'wins_bonus', 0,
      'allowed', base_limit,
      'remaining', base_limit,
      'day_start', day_start
    );
  end if;

  -- Every challenge you send today consumes a request (including declined/expired/cancelled)
  select count(*)::int into sent
  from public.jp_pvp_matches m
  where m.challenger_id = p_user_id
    and m.created_at >= day_start;

  select count(*)::int into wins
  from public.jp_pvp_matches m
  where m.winner_id = p_user_id
    and m.status = 'complete'
    and coalesce(m.updated_at, m.created_at) >= day_start;

  allowed := base_limit + wins;
  remaining := greatest(allowed - sent, 0);

  return jsonb_build_object(
    'base_limit', base_limit,
    'sent', sent,
    'wins_bonus', wins,
    'allowed', allowed,
    'remaining', remaining,
    'day_start', day_start,
    'resets_at', day_start + interval '1 day'
  );
end;
$$;

create or replace function public.jp_pvp_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  return public.jp_pvp_quota_for(uid);
end;
$$;

create or replace function public.jp_pvp_challenge(p_opponent_id uuid, p_duration integer default 10)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dur int := case when coalesce(p_duration, 10) = 25 then 25 else 10 end;
  row public.jp_pvp_matches;
  q jsonb;
  rem int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent_id is null or p_opponent_id = uid then
    raise exception 'Pick someone to duel';
  end if;

  if not exists (select 1 from public.jp_profiles p where p.id = p_opponent_id) then
    raise exception 'Player not found';
  end if;

  -- Daily quota: 10 challenges + 1 per win today
  q := public.jp_pvp_quota_for(uid);
  rem := coalesce((q->>'remaining')::int, 0);
  if rem <= 0 then
    raise exception
      'Daily PvP limit reached (% used of % — win a duel to unlock another, or wait until UTC reset)',
      q->>'sent',
      q->>'allowed';
  end if;

  if exists (
    select 1 from public.jp_pvp_matches m
    where m.status in ('pending', 'accepted', 'running')
      and (
        (m.challenger_id = uid and m.opponent_id = p_opponent_id)
        or (m.challenger_id = p_opponent_id and m.opponent_id = uid)
      )
  ) then
    raise exception 'You already have an open duel with this player';
  end if;

  insert into public.jp_pvp_matches (challenger_id, opponent_id, duration_sec, status)
  values (uid, p_opponent_id, dur, 'pending')
  returning * into row;

  return row;
end;
$$;

-- by_code already calls jp_pvp_challenge — inherits quota

revoke all on function public.jp_pvp_utc_day_start() from public, anon, authenticated;
revoke all on function public.jp_pvp_quota_for(uuid) from public, anon, authenticated;
revoke all on function public.jp_pvp_quota() from public, anon;
revoke all on function public.jp_pvp_challenge(uuid, integer) from public, anon;

grant execute on function public.jp_pvp_quota() to authenticated;
grant execute on function public.jp_pvp_challenge(uuid, integer) to authenticated;
grant execute on function public.jp_pvp_challenge_by_code(text, integer) to authenticated;
