-- Push Thru — Territories (regional side boards)
-- Separate from global high scores. Scores only via security-definer RPCs.

create table if not exists public.jp_territory_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  territory_id text not null,
  lifetime_count integer not null default 0 check (lifetime_count >= 0),
  challenge_best integer not null default 0 check (challenge_best >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, territory_id),
  constraint jp_territory_id_len check (char_length(territory_id) between 2 and 32)
);

create index if not exists jp_territory_scores_life_idx
  on public.jp_territory_scores (territory_id, lifetime_count desc);

create index if not exists jp_territory_scores_chal_idx
  on public.jp_territory_scores (territory_id, challenge_best desc);

alter table public.jp_territory_scores enable row level security;

drop policy if exists "jp_territory_scores_select_all" on public.jp_territory_scores;
create policy "jp_territory_scores_select_all" on public.jp_territory_scores
  for select to authenticated
  using (true);

-- No direct insert/update/delete for clients — RPCs only
drop policy if exists "jp_territory_scores_no_write" on public.jp_territory_scores;

create or replace function public.jp_territory_allow_write()
returns void
language plpgsql
as $$
begin
  perform set_config('jp.allow_territory_scores', 'on', true);
end;
$$;

create or replace function public.jp_territory_scores_guard()
returns trigger
language plpgsql
as $$
begin
  if current_setting('jp.allow_territory_scores', true) is distinct from 'on' then
    raise exception 'Territory scores can only change via game RPCs';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jp_territory_scores_guard on public.jp_territory_scores;
create trigger jp_territory_scores_guard
  before insert or update on public.jp_territory_scores
  for each row execute function public.jp_territory_scores_guard();

-- Ensure row exists
create or replace function public.jp_territory_ensure_row(p_territory_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tid text := lower(trim(p_territory_id));
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if tid is null or tid = '' or char_length(tid) > 32 then
    raise exception 'Invalid territory';
  end if;
  perform public.jp_territory_allow_write();
  insert into public.jp_territory_scores (user_id, territory_id)
  values (uid, tid)
  on conflict (user_id, territory_id) do nothing;
end;
$$;

-- Batch free pushes in a territory (max 200 per call)
create or replace function public.jp_territory_record_pushes(
  p_territory_id text,
  p_count integer
)
returns public.jp_territory_scores
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tid text := lower(trim(p_territory_id));
  n int := least(greatest(coalesce(p_count, 0), 0), 200);
  row public.jp_territory_scores;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if n = 0 then
    perform public.jp_territory_ensure_row(tid);
    select * into row from public.jp_territory_scores
    where user_id = uid and territory_id = tid;
    return row;
  end if;

  perform public.jp_territory_ensure_row(tid);
  perform public.jp_territory_allow_write();

  update public.jp_territory_scores
  set lifetime_count = lifetime_count + n
  where user_id = uid and territory_id = tid
  returning * into row;

  return row;
end;
$$;

-- 10s best in a territory (hard-capped like global)
create or replace function public.jp_territory_report_challenge(
  p_territory_id text,
  p_count integer
)
returns public.jp_territory_scores
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tid text := lower(trim(p_territory_id));
  c int := least(greatest(coalesce(p_count, 0), 0), 300);
  row public.jp_territory_scores;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.jp_territory_ensure_row(tid);
  perform public.jp_territory_allow_write();

  update public.jp_territory_scores
  set challenge_best = greatest(challenge_best, c)
  where user_id = uid and territory_id = tid
  returning * into row;

  return row;
end;
$$;

-- Top N for a territory (overall lifetime or 10s)
create or replace function public.jp_territory_leaderboard(
  p_territory_id text,
  p_metric text default 'lifetime',
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  tid text := lower(trim(p_territory_id));
  lim int := least(greatest(coalesce(p_limit, 5), 1), 10);
  metric text := lower(coalesce(p_metric, 'lifetime'));
begin
  if tid is null or tid = '' then
    return '[]'::jsonb;
  end if;

  if metric = 'challenge' or metric = '10s' then
    return coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select
          t.user_id as id,
          p.display_name,
          p.friend_code,
          t.lifetime_count,
          t.challenge_best,
          p.lifetime_count as global_life
        from public.jp_territory_scores t
        join public.jp_profiles p on p.id = t.user_id
        where t.territory_id = tid
          and t.challenge_best > 0
        order by t.challenge_best desc, t.lifetime_count desc, t.updated_at asc
        limit lim
      ) x
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select
        t.user_id as id,
        p.display_name,
        p.friend_code,
        t.lifetime_count,
        t.challenge_best,
        p.lifetime_count as global_life
      from public.jp_territory_scores t
      join public.jp_profiles p on p.id = t.user_id
      where t.territory_id = tid
        and t.lifetime_count > 0
      order by t.lifetime_count desc, t.challenge_best desc, t.updated_at asc
      limit lim
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Snapshot of kings (top overall + top 10s) for every territory (for map badges)
create or replace function public.jp_territory_map_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select
        t.territory_id,
        (
          select jsonb_build_object(
            'id', s.user_id,
            'name', p.display_name,
            'score', s.lifetime_count
          )
          from public.jp_territory_scores s
          join public.jp_profiles p on p.id = s.user_id
          where s.territory_id = t.territory_id
            and s.lifetime_count > 0
          order by s.lifetime_count desc, s.updated_at asc
          limit 1
        ) as life_king,
        (
          select jsonb_build_object(
            'id', s.user_id,
            'name', p.display_name,
            'score', s.challenge_best
          )
          from public.jp_territory_scores s
          join public.jp_profiles p on p.id = s.user_id
          where s.territory_id = t.territory_id
            and s.challenge_best > 0
          order by s.challenge_best desc, s.updated_at asc
          limit 1
        ) as challenge_king
      from (
        select distinct territory_id from public.jp_territory_scores
      ) t
    ) x
  ), '[]'::jsonb);
end;
$$;

-- My scores across all territories
create or replace function public.jp_territory_my_scores()
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
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select territory_id, lifetime_count, challenge_best, updated_at
      from public.jp_territory_scores
      where user_id = uid
      order by territory_id
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.jp_territory_allow_write() from public;
revoke all on function public.jp_territory_ensure_row(text) from public;
revoke all on function public.jp_territory_record_pushes(text, integer) from public;
revoke all on function public.jp_territory_report_challenge(text, integer) from public;
revoke all on function public.jp_territory_leaderboard(text, text, integer) from public;
revoke all on function public.jp_territory_map_overview() from public;
revoke all on function public.jp_territory_my_scores() from public;

grant execute on function public.jp_territory_record_pushes(text, integer) to authenticated;
grant execute on function public.jp_territory_report_challenge(text, integer) to authenticated;
grant execute on function public.jp_territory_leaderboard(text, text, integer) to authenticated;
grant execute on function public.jp_territory_map_overview() to authenticated;
grant execute on function public.jp_territory_my_scores() to authenticated;
