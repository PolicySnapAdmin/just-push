-- Push Thru — prevent easy REST score editing
-- Score columns can only change via security-definer RPCs (not direct UPDATE).

-- Session flag so RPCs may write scores; direct client UPDATEs cannot.
create or replace function public.jp_profiles_guard_scores()
returns trigger
language plpgsql
as $$
begin
  if current_setting('jp.allow_scores', true) is distinct from 'on' then
    new.high_score := old.high_score;
    new.challenge_best := old.challenge_best;
    new.lifetime_count := old.lifetime_count;
    new.sessions_played := old.sessions_played;
  end if;
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_scores on public.jp_profiles;
create trigger jp_profiles_guard_scores
  before update on public.jp_profiles
  for each row execute function public.jp_profiles_guard_scores();

-- Also block score fields on INSERT from clients (trigger uses zeros if not allowed)
create or replace function public.jp_profiles_guard_scores_insert()
returns trigger
language plpgsql
as $$
begin
  if current_setting('jp.allow_scores', true) is distinct from 'on' then
    -- signup trigger / client insert: never accept client-supplied scores
    if tg_op = 'INSERT' then
      new.high_score := 0;
      new.challenge_best := 0;
      new.lifetime_count := 0;
      new.sessions_played := 0;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_scores_insert on public.jp_profiles;
create trigger jp_profiles_guard_scores_insert
  before insert on public.jp_profiles
  for each row execute function public.jp_profiles_guard_scores_insert();

-- Helper: open score write window for this transaction
create or replace function public.jp_allow_score_write()
returns void
language plpgsql
as $$
begin
  perform set_config('jp.allow_scores', 'on', true);
end;
$$;

-- +1 lifetime push; free-mode high score can rise with session count (capped by lifetime)
create or replace function public.jp_record_push(p_session_count integer default 0)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
  sess int := greatest(coalesce(p_session_count, 0), 0);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.jp_allow_score_write();

  update public.jp_profiles
  set
    lifetime_count = lifetime_count + 1,
    high_score = greatest(
      high_score,
      least(sess, lifetime_count + 1)
    )
  where id = uid
  returning * into row;

  if row.id is null then
    raise exception 'Profile not found';
  end if;
  return row;
end;
$$;

-- Batch pushes (offline catch-up). Max 200 per call — not a one-shot million.
create or replace function public.jp_record_pushes(p_count integer, p_session_count integer default 0)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
  n int := least(greatest(coalesce(p_count, 0), 0), 200);
  sess int := greatest(coalesce(p_session_count, 0), 0);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if n = 0 then
    select * into row from public.jp_profiles where id = uid;
    return row;
  end if;

  perform public.jp_allow_score_write();

  update public.jp_profiles
  set
    lifetime_count = lifetime_count + n,
    high_score = greatest(
      high_score,
      least(sess, lifetime_count + n)
    )
  where id = uid
  returning * into row;

  if row.id is null then
    raise exception 'Profile not found';
  end if;
  return row;
end;
$$;

-- 10s best: only rises, hard-capped (blocks silly REST values like 999999)
-- p_bump_session: true when finishing a run; false when reconciling offline best
create or replace function public.jp_report_challenge(p_count integer, p_bump_session boolean default true)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
  c int := least(greatest(coalesce(p_count, 0), 0), 300);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.jp_allow_score_write();

  update public.jp_profiles
  set
    challenge_best = greatest(challenge_best, c),
    sessions_played = sessions_played + case when coalesce(p_bump_session, true) then 1 else 0 end
  where id = uid
  returning * into row;

  if row.id is null then
    raise exception 'Profile not found';
  end if;
  return row;
end;
$$;

create or replace function public.jp_bump_session()
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

  perform public.jp_allow_score_write();

  update public.jp_profiles
  set sessions_played = sessions_played + 1
  where id = uid
  returning * into row;

  if row.id is null then
    raise exception 'Profile not found';
  end if;
  return row;
end;
$$;

revoke all on function public.jp_allow_score_write() from public;
revoke all on function public.jp_record_push(integer) from public;
revoke all on function public.jp_record_pushes(integer, integer) from public;
revoke all on function public.jp_report_challenge(integer, boolean) from public;
revoke all on function public.jp_bump_session() from public;

grant execute on function public.jp_record_push(integer) to authenticated;
grant execute on function public.jp_record_pushes(integer, integer) to authenticated;
grant execute on function public.jp_report_challenge(integer, boolean) to authenticated;
grant execute on function public.jp_bump_session() to authenticated;
