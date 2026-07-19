-- Push Thru — Arena Tokens economy (Social / PvP only)
-- FUNDAMENTAL: Tokens NEVER increase main-game clicks, XP, or lifetime_count.
-- Earn: daily claim, level milestones, rare loot rolls, PvP wagers/wins.
-- Spend: PvP wagers (IAP purchase path reserved for later).

-- ——— Wallet ———
create table if not exists public.jp_wallets (
  user_id uuid primary key references public.jp_profiles (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  last_daily_day date,
  level_rewarded integer not null default 1 check (level_rewarded >= 1),
  drops_today integer not null default 0 check (drops_today >= 0),
  drops_day date,
  updated_at timestamptz not null default now()
);

create table if not exists public.jp_wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  amount bigint not null,
  balance_after bigint not null,
  reason text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jp_wallet_ledger_user_idx
  on public.jp_wallet_ledger (user_id, created_at desc);

-- PvP wager column
alter table public.jp_pvp_matches
  add column if not exists wager integer not null default 0 check (wager >= 0 and wager <= 10000);

alter table public.jp_wallets enable row level security;
alter table public.jp_wallet_ledger enable row level security;

drop policy if exists "jp_wallets_select_own" on public.jp_wallets;
create policy "jp_wallets_select_own" on public.jp_wallets
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "jp_wallet_ledger_select_own" on public.jp_wallet_ledger;
create policy "jp_wallet_ledger_select_own" on public.jp_wallet_ledger
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.jp_wallets from anon, public;
revoke all on table public.jp_wallet_ledger from anon, public;
grant select on table public.jp_wallets to authenticated;
grant select on table public.jp_wallet_ledger to authenticated;

-- ——— Helpers ———
create or replace function public.jp_wallet_ensure(p_user uuid)
returns public.jp_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.jp_wallets;
begin
  insert into public.jp_wallets (user_id) values (p_user)
  on conflict (user_id) do nothing;
  select * into w from public.jp_wallets where user_id = p_user;
  return w;
end;
$$;

create or replace function public.jp_wallet_credit(
  p_user uuid,
  p_amount bigint,
  p_reason text,
  p_meta jsonb default '{}'::jsonb
)
returns public.jp_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.jp_wallets;
  amt bigint := greatest(coalesce(p_amount, 0), 0);
begin
  if amt = 0 then
    return public.jp_wallet_ensure(p_user);
  end if;
  perform public.jp_wallet_ensure(p_user);
  update public.jp_wallets
  set
    balance = balance + amt,
    lifetime_earned = lifetime_earned + amt,
    updated_at = now()
  where user_id = p_user
  returning * into w;

  insert into public.jp_wallet_ledger (user_id, amount, balance_after, reason, meta)
  values (p_user, amt, w.balance, coalesce(p_reason, 'credit'), coalesce(p_meta, '{}'::jsonb));

  return w;
end;
$$;

create or replace function public.jp_wallet_debit(
  p_user uuid,
  p_amount bigint,
  p_reason text,
  p_meta jsonb default '{}'::jsonb
)
returns public.jp_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.jp_wallets;
  amt bigint := greatest(coalesce(p_amount, 0), 0);
begin
  perform public.jp_wallet_ensure(p_user);
  select * into w from public.jp_wallets where user_id = p_user for update;
  if w.balance < amt then
    raise exception 'Not enough Tokens (need %, have %)', amt, w.balance;
  end if;
  if amt = 0 then
    return w;
  end if;

  update public.jp_wallets
  set
    balance = balance - amt,
    lifetime_spent = lifetime_spent + amt,
    updated_at = now()
  where user_id = p_user
  returning * into w;

  insert into public.jp_wallet_ledger (user_id, amount, balance_after, reason, meta)
  values (p_user, -amt, w.balance, coalesce(p_reason, 'debit'), coalesce(p_meta, '{}'::jsonb));

  return w;
end;
$$;

-- Same XP curve as client (1 push = 1 XP) — for level rewards only
create or replace function public.jp_level_from_xp(p_xp bigint)
returns integer
language plpgsql
immutable
as $$
declare
  x bigint := greatest(coalesce(p_xp, 0), 0);
  points bigint := 0;
  n int;
  need bigint;
begin
  if x <= 0 then return 1; end if;
  for n in 1..98 loop
    points := points + floor(n + 300 * power(2::numeric, n / 7.0))::bigint;
    need := floor(points / 4.0)::bigint;
    if x < need then
      return n;
    end if;
  end loop;
  return 99;
end;
$$;

-- ——— Player wallet view ———
create or replace function public.jp_wallet_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w public.jp_wallets;
  today date := (now() at time zone 'utc')::date;
  level int;
  life bigint;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  w := public.jp_wallet_ensure(uid);
  -- reset daily drop counter if day rolled
  if w.drops_day is distinct from today then
    update public.jp_wallets
    set drops_today = 0, drops_day = today, updated_at = now()
    where user_id = uid
    returning * into w;
  end if;

  select coalesce(lifetime_count, 0) into life from public.jp_profiles where id = uid;
  level := public.jp_level_from_xp(life);

  return jsonb_build_object(
    'balance', w.balance,
    'lifetime_earned', w.lifetime_earned,
    'lifetime_spent', w.lifetime_spent,
    'daily_claimed', w.last_daily_day is not distinct from today,
    'daily_amount', least(100, 25 + (level / 5) * 5),
    'level', level,
    'level_rewarded', w.level_rewarded,
    'pending_level_rewards', greatest(level - w.level_rewarded, 0),
    'drops_today', w.drops_today,
    'drops_cap', 8
  );
end;
$$;

-- Daily play bonus (Social / economy only)
create or replace function public.jp_claim_daily_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w public.jp_wallets;
  today date := (now() at time zone 'utc')::date;
  level int;
  life bigint;
  amt int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  w := public.jp_wallet_ensure(uid);
  if w.last_daily_day is not distinct from today then
    raise exception 'Daily bonus already claimed (resets UTC midnight)';
  end if;

  select coalesce(lifetime_count, 0) into life from public.jp_profiles where id = uid;
  level := public.jp_level_from_xp(life);
  amt := least(100, 25 + (level / 5) * 5);

  update public.jp_wallets
  set last_daily_day = today, updated_at = now()
  where user_id = uid;

  w := public.jp_wallet_credit(uid, amt, 'daily_bonus', jsonb_build_object('level', level));

  return jsonb_build_object(
    'ok', true,
    'amount', amt,
    'balance', w.balance,
    'level', level
  );
end;
$$;

-- Level milestone Tokens (does NOT change XP/clicks)
create or replace function public.jp_claim_level_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w public.jp_wallets;
  life bigint;
  level int;
  from_lv int;
  to_lv int;
  lv int;
  total bigint := 0;
  piece int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  w := public.jp_wallet_ensure(uid);
  select coalesce(lifetime_count, 0) into life from public.jp_profiles where id = uid;
  level := public.jp_level_from_xp(life);
  from_lv := greatest(w.level_rewarded, 1);
  to_lv := level;

  if to_lv <= from_lv then
    return jsonb_build_object('ok', true, 'amount', 0, 'balance', w.balance, 'level', level, 'levels', '[]'::jsonb);
  end if;

  for lv in (from_lv + 1)..to_lv loop
    -- 10 × level Tokens per new level (capped per level)
    piece := least(500, 10 * lv);
    total := total + piece;
  end loop;

  update public.jp_wallets
  set level_rewarded = to_lv, updated_at = now()
  where user_id = uid;

  if total > 0 then
    w := public.jp_wallet_credit(
      uid,
      total,
      'level_rewards',
      jsonb_build_object('from_level', from_lv, 'to_level', to_lv)
    );
  else
    select * into w from public.jp_wallets where user_id = uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'amount', total,
    'balance', w.balance,
    'level', level,
    'from_level', from_lv,
    'to_level', to_lv
  );
end;
$$;

-- Rare loot roll on free play — Tokens only, hard daily cap (NOT more XP/clicks)
create or replace function public.jp_try_loot_drop()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w public.jp_wallets;
  today date := (now() at time zone 'utc')::date;
  roll numeric;
  amt int;
  cap int := 8;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  w := public.jp_wallet_ensure(uid);

  if w.drops_day is distinct from today then
    update public.jp_wallets
    set drops_today = 0, drops_day = today, updated_at = now()
    where user_id = uid
    returning * into w;
  end if;

  if w.drops_today >= cap then
    return jsonb_build_object('hit', false, 'reason', 'daily_cap', 'balance', w.balance, 'drops_today', w.drops_today);
  end if;

  -- ~2.5% chance per call (client throttles calls)
  roll := random();
  if roll > 0.025 then
    return jsonb_build_object('hit', false, 'balance', w.balance, 'drops_today', w.drops_today);
  end if;

  -- Box tiers
  if roll < 0.002 then
    amt := 100; -- rare
  elsif roll < 0.008 then
    amt := 40;
  else
    amt := 10 + floor(random() * 16)::int; -- 10–25
  end if;

  update public.jp_wallets
  set drops_today = drops_today + 1, drops_day = today, updated_at = now()
  where user_id = uid;

  w := public.jp_wallet_credit(uid, amt, 'loot_box', jsonb_build_object('tier', case when amt >= 100 then 'rare' when amt >= 40 then 'uncommon' else 'common' end));

  return jsonb_build_object(
    'hit', true,
    'amount', amt,
    'balance', w.balance,
    'drops_today', w.drops_today,
    'drops_cap', cap
  );
end;
$$;

-- ——— PvP wagers (update challenge / respond / apply / cancel) ———
create or replace function public.jp_pvp_challenge(
  p_opponent_id uuid,
  p_duration integer default 10,
  p_wager integer default 0
)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dur int := case when coalesce(p_duration, 10) = 25 then 25 else 10 end;
  wager int := least(greatest(coalesce(p_wager, 0), 0), 500);
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

  -- Escrow challenger wager
  if wager > 0 then
    perform public.jp_wallet_debit(
      uid, wager, 'pvp_wager_lock',
      jsonb_build_object('role', 'challenger', 'opponent_id', p_opponent_id)
    );
  end if;

  insert into public.jp_pvp_matches (challenger_id, opponent_id, duration_sec, status, wager)
  values (uid, p_opponent_id, dur, 'pending', wager)
  returning * into row;

  return row;
end;
$$;

create or replace function public.jp_pvp_challenge_by_code(
  p_code text,
  p_duration integer default 10,
  p_wager integer default 0
)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other public.jp_profiles;
  code text := upper(trim(coalesce(p_code, '')));
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if code = '' or char_length(code) < 4 then
    raise exception 'Enter a player code';
  end if;
  select * into other from public.jp_profiles where friend_code = code;
  if other.id is null then raise exception 'No player with that code'; end if;
  if other.id = uid then raise exception 'That is your own code'; end if;
  return public.jp_pvp_challenge(other.id, p_duration, p_wager);
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
    -- refund challenger if wagered
    if coalesce(row.wager, 0) > 0 then
      perform public.jp_wallet_credit(
        row.challenger_id, row.wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', row.id, 'why', 'expired')
      );
    end if;
    update public.jp_pvp_matches set status = 'expired', updated_at = now() where id = p_match_id;
    raise exception 'Challenge expired';
  end if;

  if coalesce(p_accept, false) then
    if coalesce(row.wager, 0) > 0 then
      -- opponent must match wager
      perform public.jp_wallet_debit(
        uid, row.wager, 'pvp_wager_lock',
        jsonb_build_object('match_id', row.id, 'role', 'opponent')
      );
    end if;
    update public.jp_pvp_matches
    set status = 'accepted', updated_at = now()
    where id = p_match_id
    returning * into row;
  else
    if coalesce(row.wager, 0) > 0 then
      perform public.jp_wallet_credit(
        row.challenger_id, row.wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', row.id, 'why', 'declined')
      );
    end if;
    update public.jp_pvp_matches
    set status = 'declined', updated_at = now()
    where id = p_match_id
    returning * into row;
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

  -- Refund escrowed tokens
  if coalesce(row.wager, 0) > 0 then
    perform public.jp_wallet_credit(
      row.challenger_id, row.wager, 'pvp_wager_refund',
      jsonb_build_object('match_id', row.id, 'why', 'cancelled')
    );
    if row.status = 'accepted' then
      perform public.jp_wallet_credit(
        row.opponent_id, row.wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', row.id, 'why', 'cancelled')
      );
    end if;
  end if;

  update public.jp_pvp_matches
  set status = 'cancelled', updated_at = now()
  where id = p_match_id
  returning * into row;
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
  wager int := coalesce(p_match.wager, 0);
  pot int;
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

  -- Settle Tokens pot (both sides already escrowed on accept)
  if wager > 0 then
    pot := wager * 2;
    if winner is null then
      perform public.jp_wallet_credit(
        p_match.challenger_id, wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', p_match.id, 'why', 'draw')
      );
      perform public.jp_wallet_credit(
        p_match.opponent_id, wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', p_match.id, 'why', 'draw')
      );
    else
      perform public.jp_wallet_credit(
        winner, pot, 'pvp_wager_win',
        jsonb_build_object('match_id', p_match.id, 'pot', pot, 'wager', wager)
      );
    end if;
  else
    -- Free duel participation crumb (tiny, not click power)
    if winner is not null then
      perform public.jp_wallet_credit(
        winner, 5, 'pvp_win_bonus',
        jsonb_build_object('match_id', p_match.id)
      );
    end if;
  end if;
end;
$$;

-- Expire stale with refunds (admin path already expires; enhance default expire on respond)
create or replace function public.jp_admin_expire_stale_pvp(p_minutes integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mins int := least(greatest(coalesce(p_minutes, 30), 5), 24 * 60);
  r record;
  n int := 0;
begin
  perform public.jp_admin_require();
  for r in
    select * from public.jp_pvp_matches
    where status in ('pending', 'accepted')
      and created_at < now() - make_interval(mins => mins)
    for update
  loop
    if coalesce(r.wager, 0) > 0 then
      perform public.jp_wallet_credit(
        r.challenger_id, r.wager, 'pvp_wager_refund',
        jsonb_build_object('match_id', r.id, 'why', 'admin_expire')
      );
      if r.status = 'accepted' then
        perform public.jp_wallet_credit(
          r.opponent_id, r.wager, 'pvp_wager_refund',
          jsonb_build_object('match_id', r.id, 'why', 'admin_expire')
        );
      end if;
    end if;
    update public.jp_pvp_matches
    set status = 'expired', updated_at = now()
    where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('expired', n, 'older_than_minutes', mins, 'ran_at', now());
end;
$$;

-- Grants
revoke all on function public.jp_wallet_ensure(uuid) from public, anon, authenticated;
revoke all on function public.jp_wallet_credit(uuid, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.jp_wallet_debit(uuid, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.jp_level_from_xp(bigint) from public, anon;
revoke all on function public.jp_wallet_me() from public, anon;
revoke all on function public.jp_claim_daily_bonus() from public, anon;
revoke all on function public.jp_claim_level_rewards() from public, anon;
revoke all on function public.jp_try_loot_drop() from public, anon;

-- Drop old signatures if needed
drop function if exists public.jp_pvp_challenge(uuid, integer);
drop function if exists public.jp_pvp_challenge_by_code(text, integer);

grant execute on function public.jp_wallet_me() to authenticated;
grant execute on function public.jp_claim_daily_bonus() to authenticated;
grant execute on function public.jp_claim_level_rewards() to authenticated;
grant execute on function public.jp_try_loot_drop() to authenticated;
grant execute on function public.jp_pvp_challenge(uuid, integer, integer) to authenticated;
grant execute on function public.jp_pvp_challenge_by_code(text, integer, integer) to authenticated;
grant execute on function public.jp_pvp_respond(uuid, boolean) to authenticated;
grant execute on function public.jp_pvp_cancel(uuid) to authenticated;
grant execute on function public.jp_admin_expire_stale_pvp(integer) to authenticated;
