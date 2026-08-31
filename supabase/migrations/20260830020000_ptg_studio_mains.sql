-- Push Thru email/code accounts are the studio mains.
-- Do not require account_ready (a few real emails never got that flag).
-- Reject anonymous guests only. QR/Livewire boards stay empty until they play.

create or replace function public.ptg_require_studio_account()
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  anon bool;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(u.is_anonymous, false) into anon
  from auth.users u
  where u.id = uid;

  if coalesce(anon, false) then
    raise exception 'Studio account required';
  end if;

  return uid;
end;
$$;

-- When a real (non-anon) user hits studio, mark the jp_profiles row ready.
create or replace function public.ptg_ensure_studio_profile(p_display_name text default null)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
  anon bool;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  row := public.jp_ensure_my_profile(p_display_name, null, null);

  select coalesce(u.is_anonymous, false) into anon
  from auth.users u
  where u.id = uid;

  if not coalesce(anon, false) and not coalesce(row.account_ready, false) then
    perform set_config('jp.allow_identity', 'on', true);
    update public.jp_profiles
    set account_ready = true, updated_at = now()
    where id = uid
    returning * into row;
  end if;

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

  if v_slug not in ('livewire', 'qr') then
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

revoke all on function public.ptg_require_studio_account() from public, anon, authenticated;
revoke all on function public.ptg_ensure_studio_profile(text) from public, anon;
grant execute on function public.ptg_ensure_studio_profile(text) to authenticated;
