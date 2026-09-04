-- Allow Splice on the shared studio score RPCs (same path as Livewire).
-- Cap matches Livewire high: 100000. Metric is `high` only.

create or replace function public.ptg_score_cap(p_game text, p_metric text)
returns integer
language plpgsql
immutable
as $$
begin
  if p_game = 'livewire' and p_metric = 'high' then
    return 100000;
  elsif p_game = 'splice' and p_metric = 'high' then
    return 100000;
  elsif p_game = 'qr' and p_metric = 'best_sector' then
    return 10000;
  elsif p_game = 'qr' and p_metric = 'threats_purged' then
    return 1000000;
  elsif p_game = 'qr' and p_metric = 'sectors_cleared' then
    return 100000;
  elsif p_game = 'qr' and p_metric = 'account_level' then
    return 99;
  elsif p_game = 'qr' and p_metric = 'runs_started' then
    return 100000;
  end if;
  return 0;
end;
$$;

create or replace function public.ptg_submit_score(
  p_game text,
  p_metric text,
  p_value integer
)
returns public.ptg_scores
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_slug text := lower(trim(coalesce(p_game, '')));
  v_metric text := lower(trim(coalesce(p_metric, 'high')));
  v int := greatest(coalesce(p_value, 0), 0);
  cap int;
  row public.ptg_scores;
begin
  uid := public.ptg_require_studio_account();

  if v_slug not in ('livewire', 'qr', 'splice') then
    raise exception 'Invalid game';
  end if;
  if v_slug in ('livewire', 'splice') and v_metric <> 'high' then
    raise exception 'Invalid metric';
  end if;
  if v_slug = 'qr' and v_metric not in (
    'best_sector', 'threats_purged', 'sectors_cleared', 'account_level', 'runs_started'
  ) then
    raise exception 'Invalid metric';
  end if;

  perform public.ptg_ensure_studio_profile(null);

  cap := public.ptg_score_cap(v_slug, v_metric);
  if cap <= 0 then
    raise exception 'Invalid metric';
  end if;

  if v <= 0 then
    select * into row from public.ptg_scores
    where user_id = uid and game_slug = v_slug and metric = v_metric;
    return row;
  end if;

  v := least(v, cap);

  insert into public.ptg_scores (user_id, game_slug, metric, value, updated_at)
  values (uid, v_slug, v_metric, v, now())
  on conflict (user_id, game_slug, metric) do update
    set
      value = greatest(public.ptg_scores.value, excluded.value),
      updated_at = now()
  returning * into row;

  return row;
end;
$$;

create or replace function public.ptg_leaderboard(
  p_game text,
  p_metric text default 'high',
  p_limit integer default 25
)
returns table (
  rank bigint,
  id uuid,
  display_name text,
  friend_code text,
  score integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid;
  v_slug text := lower(trim(coalesce(p_game, '')));
  v_metric text := lower(trim(coalesce(p_metric, 'high')));
  lim int := greatest(1, least(coalesce(p_limit, 25), 50));
begin
  uid := public.ptg_require_studio_account();

  if v_slug = 'pushthru' then
    if v_metric not in ('high', 'challenge', 'lifetime') then
      v_metric := 'high';
    end if;
    return query
    execute format(
      $q$
      select
        row_number() over (order by p.%1$s desc nulls last, p.display_name asc) as rank,
        p.id,
        p.display_name,
        ''::text as friend_code,
        p.%1$s as score,
        p.updated_at
      from public.jp_profiles p
      join auth.users u on u.id = p.id
      where coalesce(p.%1$s, 0) > 0
        and coalesce(u.is_anonymous, false) = false
        and coalesce(p.display_name, '') <> ''
        and lower(trim(p.display_name)) <> 'player'
      order by p.%1$s desc nulls last, p.display_name asc
      limit %2$s
      $q$,
      case v_metric
        when 'challenge' then 'challenge_best'
        when 'lifetime' then 'lifetime_count'
        else 'high_score'
      end,
      lim
    );
    return;
  end if;

  if v_slug not in ('livewire', 'qr', 'splice') then
    raise exception 'Invalid game';
  end if;

  return query
  select
    row_number() over (order by s.value desc, p.display_name asc) as rank,
    p.id,
    p.display_name,
    ''::text as friend_code,
    s.value as score,
    s.updated_at
  from public.ptg_scores s
  join public.jp_profiles p on p.id = s.user_id
  join auth.users u on u.id = p.id
  where s.game_slug = v_slug
    and s.metric = v_metric
    and s.value > 0
    and coalesce(u.is_anonymous, false) = false
    and coalesce(p.display_name, '') <> ''
    and lower(trim(p.display_name)) <> 'player'
  order by s.value desc, p.display_name asc
  limit lim;
end;
$$;
