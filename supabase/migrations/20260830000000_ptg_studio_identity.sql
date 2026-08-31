-- Push Thru Games studio identity.
-- jp_profiles stays the single account row (existing Push Thru users are the mains).
-- Per-game scores live in ptg_scores. A name is NOT ranked for a game until they play
-- (value > 0). No zero-score rows are inserted for games they have not touched.

create table if not exists public.ptg_scores (
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  game_slug text not null,
  metric text not null,
  value integer not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_slug, metric),
  constraint ptg_scores_slug_chk check (game_slug ~ '^[a-z][a-z0-9-]{1,22}$'),
  constraint ptg_scores_metric_chk check (metric ~ '^[a-z][a-z0-9_]{0,30}$')
);

create index if not exists ptg_scores_board_idx
  on public.ptg_scores (game_slug, metric, value desc);

alter table public.ptg_scores enable row level security;

drop policy if exists "ptg_scores_select" on public.ptg_scores;
create policy "ptg_scores_select" on public.ptg_scores
  for select to authenticated
  using (true);

revoke all on table public.ptg_scores from public, anon;
grant select on table public.ptg_scores to authenticated;
-- writes only via security-definer RPC

create or replace function public.ptg_score_cap(p_game text, p_metric text)
returns integer
language plpgsql
immutable
as $$
begin
  if p_game = 'livewire' and p_metric = 'high' then
    return 1000000;
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
  elsif p_game = 'pushthru' then
    return 100000000;
  end if;
  return 1000000;
end;
$$;

-- Make sure the caller has a jp_profiles row. Does NOT insert score rows.
create or replace function public.ptg_ensure_studio_profile(p_display_name text default null)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  row := public.jp_ensure_my_profile(p_display_name, null, null);
  return row;
end;
$$;

-- Record a score only after actual play (value > 0). Never decreases.
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
  uid uuid := auth.uid();
  v_slug text := lower(trim(coalesce(p_game, '')));
  v_metric text := lower(trim(coalesce(p_metric, 'high')));
  v int := greatest(coalesce(p_value, 0), 0);
  cap int;
  row public.ptg_scores;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_slug !~ '^[a-z][a-z0-9-]{1,22}$' then
    raise exception 'Invalid game';
  end if;
  if v_metric !~ '^[a-z][a-z0-9_]{0,30}$' then
    raise exception 'Invalid metric';
  end if;

  perform public.ptg_ensure_studio_profile(null);

  if v <= 0 then
    select * into row from public.ptg_scores
    where user_id = uid and game_slug = v_slug and metric = v_metric;
    return row;
  end if;

  cap := public.ptg_score_cap(v_slug, v_metric);
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
  me uuid := auth.uid();
  v_slug text := lower(trim(coalesce(p_game, '')));
  v_metric text := lower(trim(coalesce(p_metric, 'high')));
  lim int := greatest(1, least(coalesce(p_limit, 25), 50));
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  -- Push Thru boards read existing jp_profiles (already-played mains).
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
        p.friend_code,
        p.%1$s as score,
        p.updated_at
      from public.jp_profiles p
      where coalesce(p.%1$s, 0) > 0
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

  -- Other games: only rows with a real play (value > 0). Same display_name as jp_profiles.
  return query
  select
    row_number() over (order by s.value desc, p.display_name asc) as rank,
    p.id,
    p.display_name,
    p.friend_code,
    s.value as score,
    s.updated_at
  from public.ptg_scores s
  join public.jp_profiles p on p.id = s.user_id
  where s.game_slug = v_slug
    and s.metric = v_metric
    and s.value > 0
    and coalesce(p.display_name, '') <> ''
    and lower(trim(p.display_name)) <> 'player'
  order by s.value desc, p.display_name asc
  limit lim;
end;
$$;

create or replace function public.ptg_my_scores()
returns table (
  game_slug text,
  metric text,
  value integer,
  updated_at timestamptz
)
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
  return query
  select s.game_slug, s.metric, s.value, s.updated_at
  from public.ptg_scores s
  where s.user_id = uid
  order by s.game_slug, s.metric;
end;
$$;

revoke all on function public.ptg_score_cap(text, text) from public, anon;
revoke all on function public.ptg_ensure_studio_profile(text) from public, anon;
revoke all on function public.ptg_submit_score(text, text, integer) from public, anon;
revoke all on function public.ptg_leaderboard(text, text, integer) from public, anon;
revoke all on function public.ptg_my_scores() from public, anon;

grant execute on function public.ptg_ensure_studio_profile(text) to authenticated;
grant execute on function public.ptg_submit_score(text, text, integer) to authenticated;
grant execute on function public.ptg_leaderboard(text, text, integer) to authenticated;
grant execute on function public.ptg_my_scores() to authenticated;

comment on table public.ptg_scores is
  'Per-game high scores for the shared Push Thru Games account (jp_profiles). Ranked only after play.';
