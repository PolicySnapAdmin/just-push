-- Push Thru — Friend PVP duels (10s / 25s), W-L-D, K/D, head-to-head

create table if not exists public.jp_pvp_matches (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.jp_profiles (id) on delete cascade,
  opponent_id uuid not null references public.jp_profiles (id) on delete cascade,
  duration_sec integer not null check (duration_sec in (10, 25)),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'running', 'complete', 'declined', 'cancelled', 'expired')),
  challenger_ready boolean not null default false,
  opponent_ready boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  challenger_score integer,
  opponent_score integer,
  challenger_submitted_at timestamptz,
  opponent_submitted_at timestamptz,
  winner_id uuid references public.jp_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);

create index if not exists jp_pvp_matches_challenger_idx on public.jp_pvp_matches (challenger_id, status);
create index if not exists jp_pvp_matches_opponent_idx on public.jp_pvp_matches (opponent_id, status);
create index if not exists jp_pvp_matches_created_idx on public.jp_pvp_matches (created_at desc);

create table if not exists public.jp_pvp_stats (
  user_id uuid primary key references public.jp_profiles (id) on delete cascade,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  total_taps bigint not null default 0 check (total_taps >= 0),
  updated_at timestamptz not null default now()
);

-- Ordered pair head-to-head (user_a < user_b lexicographically by uuid text)
create table if not exists public.jp_pvp_h2h (
  user_a uuid not null references public.jp_profiles (id) on delete cascade,
  user_b uuid not null references public.jp_profiles (id) on delete cascade,
  wins_a integer not null default 0 check (wins_a >= 0),
  wins_b integer not null default 0 check (wins_b >= 0),
  draws integer not null default 0 check (draws >= 0),
  last_match_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

alter table public.jp_pvp_matches enable row level security;
alter table public.jp_pvp_stats enable row level security;
alter table public.jp_pvp_h2h enable row level security;

drop policy if exists "jp_pvp_matches_select_mine" on public.jp_pvp_matches;
create policy "jp_pvp_matches_select_mine" on public.jp_pvp_matches
  for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());

drop policy if exists "jp_pvp_stats_select_all" on public.jp_pvp_stats;
create policy "jp_pvp_stats_select_all" on public.jp_pvp_stats
  for select to authenticated
  using (true);

drop policy if exists "jp_pvp_h2h_select_all" on public.jp_pvp_h2h;
create policy "jp_pvp_h2h_select_all" on public.jp_pvp_h2h
  for select to authenticated
  using (true);

create or replace function public.jp_pvp_are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jp_friendships f
    where f.user_id = a and f.friend_id = b
  )
  and exists (
    select 1 from public.jp_friendships f
    where f.user_id = b and f.friend_id = a
  );
$$;

create or replace function public.jp_pvp_ensure_stats(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.jp_pvp_stats (user_id) values (p_user)
  on conflict (user_id) do nothing;
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent_id is null or p_opponent_id = uid then
    raise exception 'Pick a friend to duel';
  end if;
  if not public.jp_pvp_are_friends(uid, p_opponent_id) then
    raise exception 'You can only duel friends';
  end if;

  -- One open match between the pair
  if exists (
    select 1 from public.jp_pvp_matches m
    where m.status in ('pending', 'accepted', 'running')
      and (
        (m.challenger_id = uid and m.opponent_id = p_opponent_id)
        or (m.challenger_id = p_opponent_id and m.opponent_id = uid)
      )
  ) then
    raise exception 'You already have an open duel with this friend';
  end if;

  insert into public.jp_pvp_matches (challenger_id, opponent_id, duration_sec, status)
  values (uid, p_opponent_id, dur, 'pending')
  returning * into row;

  return row;
end;
$$;

create or replace function public.jp_pvp_respond(p_match_id uuid, p_accept boolean)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_pvp_matches;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into row from public.jp_pvp_matches where id = p_match_id for update;
  if row.id is null then raise exception 'Match not found'; end if;
  if row.opponent_id <> uid then raise exception 'Only the challenged player can respond'; end if;
  if row.status <> 'pending' then raise exception 'Match is no longer pending'; end if;
  if row.created_at < now() - interval '30 minutes' then
    update public.jp_pvp_matches set status = 'expired', updated_at = now() where id = p_match_id;
    raise exception 'Challenge expired';
  end if;

  if coalesce(p_accept, false) then
    update public.jp_pvp_matches
    set status = 'accepted', updated_at = now()
    where id = p_match_id
    returning * into row;
  else
    update public.jp_pvp_matches
    set status = 'declined', updated_at = now()
    where id = p_match_id
    returning * into row;
  end if;
  return row;
end;
$$;

create or replace function public.jp_pvp_ready(p_match_id uuid)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_pvp_matches;
  both_ready boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into row from public.jp_pvp_matches where id = p_match_id for update;
  if row.id is null then raise exception 'Match not found'; end if;
  if row.challenger_id <> uid and row.opponent_id <> uid then
    raise exception 'Not your match';
  end if;
  if row.status not in ('accepted', 'running') then
    raise exception 'Match is not ready for go';
  end if;

  if row.challenger_id = uid then
    update public.jp_pvp_matches
    set challenger_ready = true, updated_at = now()
    where id = p_match_id
    returning * into row;
  else
    update public.jp_pvp_matches
    set opponent_ready = true, updated_at = now()
    where id = p_match_id
    returning * into row;
  end if;

  both_ready := row.challenger_ready and row.opponent_ready;
  if both_ready and row.starts_at is null then
    update public.jp_pvp_matches
    set
      status = 'running',
      starts_at = now() + interval '3 seconds',
      ends_at = now() + interval '3 seconds' + make_interval(secs => row.duration_sec),
      updated_at = now()
    where id = p_match_id
    returning * into row;
  end if;

  return row;
end;
$$;

create or replace function public.jp_pvp_apply_result(p_match public.jp_pvp_matches)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wa uuid;
  wb uuid;
  winner uuid;
  ca int := coalesce(p_match.challenger_score, 0);
  oa int := coalesce(p_match.opponent_score, 0);
begin
  perform public.jp_pvp_ensure_stats(p_match.challenger_id);
  perform public.jp_pvp_ensure_stats(p_match.opponent_id);

  if ca > oa then
    winner := p_match.challenger_id;
  elsif oa > ca then
    winner := p_match.opponent_id;
  else
    winner := null;
  end if;

  update public.jp_pvp_matches
  set winner_id = winner, status = 'complete', updated_at = now()
  where id = p_match.id;

  update public.jp_pvp_stats
  set
    matches_played = matches_played + 1,
    total_taps = total_taps + ca,
    wins = wins + case when winner = p_match.challenger_id then 1 else 0 end,
    losses = losses + case when winner = p_match.opponent_id then 1 else 0 end,
    draws = draws + case when winner is null then 1 else 0 end,
    updated_at = now()
  where user_id = p_match.challenger_id;

  update public.jp_pvp_stats
  set
    matches_played = matches_played + 1,
    total_taps = total_taps + oa,
    wins = wins + case when winner = p_match.opponent_id then 1 else 0 end,
    losses = losses + case when winner = p_match.challenger_id then 1 else 0 end,
    draws = draws + case when winner is null then 1 else 0 end,
    updated_at = now()
  where user_id = p_match.opponent_id;

  if p_match.challenger_id::text < p_match.opponent_id::text then
    wa := p_match.challenger_id;
    wb := p_match.opponent_id;
  else
    wa := p_match.opponent_id;
    wb := p_match.challenger_id;
  end if;

  insert into public.jp_pvp_h2h (user_a, user_b, wins_a, wins_b, draws, last_match_at)
  values (wa, wb, 0, 0, 0, now())
  on conflict (user_a, user_b) do nothing;

  if winner is null then
    update public.jp_pvp_h2h
    set draws = draws + 1, last_match_at = now()
    where user_a = wa and user_b = wb;
  elsif winner = wa then
    update public.jp_pvp_h2h
    set wins_a = wins_a + 1, last_match_at = now()
    where user_a = wa and user_b = wb;
  else
    update public.jp_pvp_h2h
    set wins_b = wins_b + 1, last_match_at = now()
    where user_a = wa and user_b = wb;
  end if;
end;
$$;

create or replace function public.jp_pvp_submit(p_match_id uuid, p_score integer)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_pvp_matches;
  sc int := least(greatest(coalesce(p_score, 0), 0), 800);
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into row from public.jp_pvp_matches where id = p_match_id for update;
  if row.id is null then raise exception 'Match not found'; end if;
  if row.challenger_id <> uid and row.opponent_id <> uid then
    raise exception 'Not your match';
  end if;
  if row.status not in ('running', 'accepted') then
    raise exception 'Match is not open for scores';
  end if;
  if row.starts_at is null then
    raise exception 'Match has not started — both players must ready up';
  end if;
  -- Allow submit from starts_at until ends_at + 15s grace
  if now() < row.starts_at - interval '1 second' then
    raise exception 'Too early to submit';
  end if;
  if row.ends_at is not null and now() > row.ends_at + interval '20 seconds' then
    raise exception 'Submit window closed';
  end if;

  if row.challenger_id = uid then
    if row.challenger_submitted_at is not null then
      raise exception 'Score already submitted';
    end if;
    update public.jp_pvp_matches
    set
      challenger_score = sc,
      challenger_submitted_at = now(),
      updated_at = now()
    where id = p_match_id
    returning * into row;
  else
    if row.opponent_submitted_at is not null then
      raise exception 'Score already submitted';
    end if;
    update public.jp_pvp_matches
    set
      opponent_score = sc,
      opponent_submitted_at = now(),
      updated_at = now()
    where id = p_match_id
    returning * into row;
  end if;

  if row.challenger_submitted_at is not null and row.opponent_submitted_at is not null then
    perform public.jp_pvp_apply_result(row);
    select * into row from public.jp_pvp_matches where id = p_match_id;
  end if;

  return row;
end;
$$;

create or replace function public.jp_pvp_cancel(p_match_id uuid)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_pvp_matches;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into row from public.jp_pvp_matches where id = p_match_id for update;
  if row.id is null then raise exception 'Match not found'; end if;
  if row.challenger_id <> uid and row.opponent_id <> uid then
    raise exception 'Not your match';
  end if;
  if row.status not in ('pending', 'accepted') then
    raise exception 'Can only cancel open challenges';
  end if;
  update public.jp_pvp_matches
  set status = 'cancelled', updated_at = now()
  where id = p_match_id
  returning * into row;
  return row;
end;
$$;

create or replace function public.jp_pvp_inbox()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
    from (
      select
        m.id,
        m.challenger_id,
        m.opponent_id,
        m.duration_sec,
        m.status,
        m.challenger_ready,
        m.opponent_ready,
        m.starts_at,
        m.ends_at,
        m.challenger_score,
        m.opponent_score,
        m.winner_id,
        m.created_at,
        cp.display_name as challenger_name,
        op.display_name as opponent_name
      from public.jp_pvp_matches m
      join public.jp_profiles cp on cp.id = m.challenger_id
      join public.jp_profiles op on op.id = m.opponent_id
      where (m.challenger_id = uid or m.opponent_id = uid)
        and (
          m.status in ('pending', 'accepted', 'running')
          or (m.status = 'complete' and m.updated_at > now() - interval '2 hours')
        )
      order by m.created_at desc
      limit 30
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.jp_pvp_get_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  j jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select row_to_json(x)::jsonb into j
  from (
    select
      m.*,
      cp.display_name as challenger_name,
      op.display_name as opponent_name
    from public.jp_pvp_matches m
    join public.jp_profiles cp on cp.id = m.challenger_id
    join public.jp_profiles op on op.id = m.opponent_id
    where m.id = p_match_id
      and (m.challenger_id = uid or m.opponent_id = uid)
  ) x;
  return j;
end;
$$;

create or replace function public.jp_pvp_my_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  s public.jp_pvp_stats;
  kd numeric;
begin
  if uid is null then return '{}'::jsonb; end if;
  perform public.jp_pvp_ensure_stats(uid);
  select * into s from public.jp_pvp_stats where user_id = uid;
  if s.losses > 0 then
    kd := round((s.wins::numeric / s.losses::numeric), 2);
  elsif s.wins > 0 then
    kd := s.wins::numeric;
  else
    kd := 0;
  end if;
  return jsonb_build_object(
    'wins', s.wins,
    'losses', s.losses,
    'draws', s.draws,
    'matches_played', s.matches_played,
    'total_taps', s.total_taps,
    'kd', kd
  );
end;
$$;

create or replace function public.jp_pvp_h2h_vs(p_friend_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  wa uuid;
  wb uuid;
  h public.jp_pvp_h2h;
  my_wins int := 0;
  their_wins int := 0;
  d int := 0;
begin
  if uid is null or p_friend_id is null then return '{}'::jsonb; end if;
  if uid::text < p_friend_id::text then
    wa := uid; wb := p_friend_id;
  else
    wa := p_friend_id; wb := uid;
  end if;
  select * into h from public.jp_pvp_h2h where user_a = wa and user_b = wb;
  if h.user_a is null then
    return jsonb_build_object('my_wins', 0, 'their_wins', 0, 'draws', 0, 'matches', 0);
  end if;
  if uid = wa then
    my_wins := h.wins_a;
    their_wins := h.wins_b;
  else
    my_wins := h.wins_b;
    their_wins := h.wins_a;
  end if;
  d := h.draws;
  return jsonb_build_object(
    'my_wins', my_wins,
    'their_wins', their_wins,
    'draws', d,
    'matches', my_wins + their_wins + d
  );
end;
$$;

create or replace function public.jp_pvp_rankings(p_limit integer default 15)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  lim int := least(greatest(coalesce(p_limit, 15), 1), 30);
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select
        s.user_id as id,
        p.display_name,
        p.friend_code,
        s.wins,
        s.losses,
        s.draws,
        s.matches_played,
        case
          when s.losses > 0 then round((s.wins::numeric / s.losses::numeric), 2)
          when s.wins > 0 then s.wins::numeric
          else 0
        end as kd
      from public.jp_pvp_stats s
      join public.jp_profiles p on p.id = s.user_id
      where s.matches_played > 0
      order by s.wins desc, kd desc, s.matches_played desc
      limit lim
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.jp_pvp_are_friends(uuid, uuid) from public;
revoke all on function public.jp_pvp_ensure_stats(uuid) from public;
revoke all on function public.jp_pvp_challenge(uuid, integer) from public;
revoke all on function public.jp_pvp_respond(uuid, boolean) from public;
revoke all on function public.jp_pvp_ready(uuid) from public;
revoke all on function public.jp_pvp_apply_result(public.jp_pvp_matches) from public;
revoke all on function public.jp_pvp_submit(uuid, integer) from public;
revoke all on function public.jp_pvp_cancel(uuid) from public;
revoke all on function public.jp_pvp_inbox() from public;
revoke all on function public.jp_pvp_get_match(uuid) from public;
revoke all on function public.jp_pvp_my_stats() from public;
revoke all on function public.jp_pvp_h2h_vs(uuid) from public;
revoke all on function public.jp_pvp_rankings(integer) from public;

grant execute on function public.jp_pvp_challenge(uuid, integer) to authenticated;
grant execute on function public.jp_pvp_respond(uuid, boolean) to authenticated;
grant execute on function public.jp_pvp_ready(uuid) to authenticated;
grant execute on function public.jp_pvp_submit(uuid, integer) to authenticated;
grant execute on function public.jp_pvp_cancel(uuid) to authenticated;
grant execute on function public.jp_pvp_inbox() to authenticated;
grant execute on function public.jp_pvp_get_match(uuid) to authenticated;
grant execute on function public.jp_pvp_my_stats() to authenticated;
grant execute on function public.jp_pvp_h2h_vs(uuid) to authenticated;
grant execute on function public.jp_pvp_rankings(integer) to authenticated;
