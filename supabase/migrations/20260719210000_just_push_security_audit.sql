-- Push Thru security audit fixes + admin on-the-fly tools
-- 1) Revoke dangerous EXECUTE grants (hygiene/cleanup must not be client-callable)
-- 2) Tighten table privileges (RPC-only writes for scores/friends/pvp/territories)
-- 3) Friendships: no direct INSERT (request flow only)
-- 4) New admin RPCs for support

-- ——— 1. Dangerous functions: service_role / postgres only ———
revoke all on function public.jp_run_hygiene() from public, anon, authenticated;
revoke all on function public.jp_cleanup_empty_guests() from public, anon, authenticated;
revoke all on function public.jp_cleanup_anon_name_clones() from public, anon, authenticated;
revoke all on function public.jp_cleanup_anon_shadows_of_email() from public, anon, authenticated;
revoke all on function public.jp_cleanup_anon_name_groups() from public, anon, authenticated;
revoke all on function public.jp_allow_score_write() from public, anon, authenticated;
revoke all on function public.jp_territory_allow_write() from public, anon, authenticated;
revoke all on function public.jp_territory_ensure_row(text) from public, anon, authenticated;
revoke all on function public.jp_pvp_apply_result(public.jp_pvp_matches) from public, anon, authenticated;
revoke all on function public.jp_pvp_ensure_stats(uuid) from public, anon, authenticated;
revoke all on function public.jp_pvp_are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.jp_admin_require() from public, anon, authenticated;

grant execute on function public.jp_run_hygiene() to service_role;
grant execute on function public.jp_cleanup_empty_guests() to service_role;
grant execute on function public.jp_cleanup_anon_name_clones() to service_role;
grant execute on function public.jp_cleanup_anon_shadows_of_email() to service_role;
grant execute on function public.jp_cleanup_anon_name_groups() to service_role;

-- ——— 2. Client game RPCs: authenticated only (not anon / public) ———
do $$
declare
  fn text;
  sigs text[] := array[
    'jp_record_push(integer)',
    'jp_record_pushes(integer,integer)',
    'jp_report_challenge(integer,boolean)',
    'jp_bump_session()',
    'jp_add_friend_by_code(text)',
    'jp_remove_friend(uuid)',
    'jp_friend_request_respond(uuid,boolean)',
    'jp_friend_request_cancel(uuid)',
    'jp_friend_requests_inbox()',
    'jp_delete_my_account()',
    'jp_pvp_challenge(uuid,integer)',
    'jp_pvp_challenge_by_code(text,integer)',
    'jp_pvp_respond(uuid,boolean)',
    'jp_pvp_ready(uuid)',
    'jp_pvp_submit(uuid,integer)',
    'jp_pvp_cancel(uuid)',
    'jp_pvp_inbox()',
    'jp_pvp_get_match(uuid)',
    'jp_pvp_my_stats()',
    'jp_pvp_h2h_vs(uuid)',
    'jp_pvp_rankings(integer)',
    'jp_territory_record_pushes(text,integer)',
    'jp_territory_report_challenge(text,integer)',
    'jp_territory_leaderboard(text,text,integer)',
    'jp_territory_map_overview()',
    'jp_territory_my_scores()',
    'jp_is_admin()',
    'jp_admin_debug_stats()',
    'jp_admin_run_hygiene()',
    'jp_admin_list_name_dupes()'
  ];
  s text;
begin
  foreach s in array sigs loop
    begin
      execute format('revoke all on function public.%s from public, anon', s);
      execute format('grant execute on function public.%s to authenticated', s);
    exception when undefined_function then
      raise notice 'skip missing %', s;
    end;
  end loop;
end $$;

-- Admin wrappers must keep calling hygiene as definer (owner has rights)
create or replace function public.jp_admin_run_hygiene()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.jp_admin_require();
  return public.jp_run_hygiene();
end;
$$;

grant execute on function public.jp_admin_run_hygiene() to authenticated;

-- ——— 3. Table privileges: least privilege ———
-- Profiles: select all (leaderboards), insert/update own only (RLS)
revoke all on table public.jp_profiles from anon, public;
grant select, insert, update on table public.jp_profiles to authenticated;
-- no DELETE on profiles for clients (delete account RPC uses security definer)

-- Friendships: select + delete own edge; INSERT only via RPC (friend requests)
revoke all on table public.jp_friendships from anon, public, authenticated;
grant select, delete on table public.jp_friendships to authenticated;
drop policy if exists "jp_friendships_insert" on public.jp_friendships;
-- Keep delete policy for optional client path; remove-friend RPC also works

-- Friend requests: select only (writes via RPC)
revoke all on table public.jp_friend_requests from anon, public, authenticated;
grant select on table public.jp_friend_requests to authenticated;

-- PVP / territory / stats: select only
revoke all on table public.jp_pvp_matches from anon, public, authenticated;
revoke all on table public.jp_pvp_stats from anon, public, authenticated;
revoke all on table public.jp_pvp_h2h from anon, public, authenticated;
revoke all on table public.jp_territory_scores from anon, public, authenticated;
grant select on table public.jp_pvp_matches to authenticated;
grant select on table public.jp_pvp_stats to authenticated;
grant select on table public.jp_pvp_h2h to authenticated;
grant select on table public.jp_territory_scores to authenticated;

-- Admins table: select self only
revoke all on table public.jp_admins from anon, public, authenticated;
grant select on table public.jp_admins to authenticated;

-- Groups / chat (existing app needs insert/delete)
revoke all on table public.jp_groups from anon, public;
revoke all on table public.jp_group_members from anon, public;
revoke all on table public.jp_board_posts from anon, public;
revoke all on table public.jp_friend_messages from anon, public;
grant select, insert, delete on table public.jp_groups to authenticated;
grant select, insert, delete on table public.jp_group_members to authenticated;
grant select, insert, delete on table public.jp_board_posts to authenticated;
grant select, insert, update, delete on table public.jp_friend_messages to authenticated;

-- ——— 4. Admin: security snapshot ———
create or replace function public.jp_admin_security_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  perform public.jp_admin_require();
  select jsonb_build_object(
    'profiles', (select count(*) from public.jp_profiles),
    'email_users', (select count(*) from auth.users where email is not null),
    'anon_users', (select count(*) from auth.users where coalesce(is_anonymous, false) or email is null),
    'empty_players', (
      select count(*) from public.jp_profiles p
      join auth.users u on u.id = p.id
      where p.display_name = 'Player'
        and coalesce(p.lifetime_count,0)=0
        and coalesce(p.high_score,0)=0
        and coalesce(p.challenge_best,0)=0
    ),
    'duplicate_name_groups', (
      select count(*) from (
        select display_name from public.jp_profiles group by 1 having count(*) > 1
      ) d
    ),
    'pending_friend_requests', (
      select count(*) from public.jp_friend_requests where status = 'pending'
    ),
    'open_pvp_matches', (
      select count(*) from public.jp_pvp_matches
      where status in ('pending', 'accepted', 'running')
    ),
    'stale_pvp_30m', (
      select count(*) from public.jp_pvp_matches
      where status in ('pending', 'accepted')
        and created_at < now() - interval '30 minutes'
    ),
    'territory_rows', (select count(*) from public.jp_territory_scores),
    'friendships', (select count(*) from public.jp_friendships),
    'groups', (select count(*) from public.jp_groups),
    'challenge_max', (select coalesce(max(challenge_best),0) from public.jp_profiles),
    'lifetime_max', (select coalesce(max(lifetime_count),0) from public.jp_profiles),
    'guards', jsonb_build_object(
      'score_update_trigger', exists (
        select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        where c.relname = 'jp_profiles' and t.tgname = 'jp_profiles_guard_scores' and not t.tgisinternal
      ),
      'territory_guard_trigger', exists (
        select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        where c.relname = 'jp_territory_scores' and t.tgname = 'jp_territory_scores_guard' and not t.tgisinternal
      )
    ),
    'ran_at', now()
  ) into r;
  return r;
end;
$$;

-- ——— 5. Admin: lookup player by friend code ———
create or replace function public.jp_admin_lookup_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(coalesce(p_code, '')));
  p public.jp_profiles;
  u auth.users;
begin
  perform public.jp_admin_require();
  if code = '' then raise exception 'Enter a friend code'; end if;

  select * into p from public.jp_profiles where friend_code = code;
  if p.id is null then
    return jsonb_build_object('found', false, 'code', code);
  end if;

  select * into u from auth.users where id = p.id;

  return jsonb_build_object(
    'found', true,
    'id', p.id,
    'display_name', p.display_name,
    'friend_code', p.friend_code,
    'high_score', p.high_score,
    'challenge_best', p.challenge_best,
    'lifetime_count', p.lifetime_count,
    'sessions_played', p.sessions_played,
    'email', u.email,
    'is_anonymous', coalesce(u.is_anonymous, false),
    'created_at', p.created_at,
    'friends', (select count(*) from public.jp_friendships f where f.user_id = p.id),
    'pending_in', (select count(*) from public.jp_friend_requests r where r.to_id = p.id and r.status = 'pending'),
    'pending_out', (select count(*) from public.jp_friend_requests r where r.from_id = p.id and r.status = 'pending'),
    'open_pvp', (
      select count(*) from public.jp_pvp_matches m
      where m.status in ('pending','accepted','running')
        and (m.challenger_id = p.id or m.opponent_id = p.id)
    ),
    'pvp_stats', (
      select jsonb_build_object('wins', s.wins, 'losses', s.losses, 'draws', s.draws, 'matches', s.matches_played)
      from public.jp_pvp_stats s where s.user_id = p.id
    )
  );
end;
$$;

-- ——— 6. Admin: set challenge_best (support only; never raises via REST) ———
create or replace function public.jp_admin_set_challenge_best(p_code text, p_value integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(coalesce(p_code, '')));
  v int := greatest(coalesce(p_value, 0), 0);
  p public.jp_profiles;
  old_v int;
begin
  perform public.jp_admin_require();
  if code = '' then raise exception 'Enter a friend code'; end if;
  if v > 300 then raise exception 'Value too high (max 300)'; end if;

  select * into p from public.jp_profiles where friend_code = code for update;
  if p.id is null then raise exception 'No player with that code'; end if;
  old_v := p.challenge_best;

  perform public.jp_allow_score_write();
  update public.jp_profiles
  set challenge_best = v, updated_at = now()
  where id = p.id
  returning * into p;

  return jsonb_build_object(
    'ok', true,
    'code', p.friend_code,
    'name', p.display_name,
    'challenge_best_was', old_v,
    'challenge_best_now', p.challenge_best
  );
end;
$$;

-- ——— 7. Admin: expire stale open PvP ———
create or replace function public.jp_admin_expire_stale_pvp(p_minutes integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mins int := least(greatest(coalesce(p_minutes, 30), 5), 24 * 60);
  n int;
begin
  perform public.jp_admin_require();
  update public.jp_pvp_matches
  set status = 'expired', updated_at = now()
  where status in ('pending', 'accepted')
    and created_at < now() - make_interval(mins => mins);
  get diagnostics n = row_count;
  return jsonb_build_object('expired', n, 'older_than_minutes', mins, 'ran_at', now());
end;
$$;

-- ——— 8. Admin: list open PvP ———
create or replace function public.jp_admin_list_open_pvp()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.jp_admin_require();
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
    from (
      select
        m.id,
        m.status,
        m.duration_sec,
        m.created_at,
        m.starts_at,
        cp.display_name as challenger_name,
        cp.friend_code as challenger_code,
        op.display_name as opponent_name,
        op.friend_code as opponent_code
      from public.jp_pvp_matches m
      join public.jp_profiles cp on cp.id = m.challenger_id
      join public.jp_profiles op on op.id = m.opponent_id
      where m.status in ('pending', 'accepted', 'running')
      order by m.created_at desc
      limit 40
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.jp_admin_security_snapshot() from public, anon;
revoke all on function public.jp_admin_lookup_code(text) from public, anon;
revoke all on function public.jp_admin_set_challenge_best(text, integer) from public, anon;
revoke all on function public.jp_admin_expire_stale_pvp(integer) from public, anon;
revoke all on function public.jp_admin_list_open_pvp() from public, anon;

grant execute on function public.jp_admin_security_snapshot() to authenticated;
grant execute on function public.jp_admin_lookup_code(text) to authenticated;
grant execute on function public.jp_admin_set_challenge_best(text, integer) to authenticated;
grant execute on function public.jp_admin_expire_stale_pvp(integer) to authenticated;
grant execute on function public.jp_admin_list_open_pvp() to authenticated;
