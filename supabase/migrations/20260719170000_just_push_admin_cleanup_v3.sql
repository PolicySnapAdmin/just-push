-- Push Thru admin cleanup v3
-- Stronger name-dupe hygiene + ensure admin RPC grants stay correct.
-- Email accounts are never deleted. Anon clones / shadows are.

-- 1) Empty default guests (unchanged logic, re-assert)
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
      and (coalesce(u.is_anonymous, false) = true or u.email is null)
      and u.created_at < now() - interval '30 minutes'
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 2) Anon clones: same display name as an older profile.
-- Match on high OR lifetime OR challenge_best OR pure name collision
-- when the older row is an email account (any score).
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
      and trim(p.display_name) <> ''
      and p.display_name <> 'Player'
      and (coalesce(u.is_anonymous, false) = true or u.email is null)
      and u.created_at < now() - interval '5 minutes'
      and exists (
        select 1
        from public.jp_profiles older
        join auth.users ou on ou.id = older.id
        where older.display_name = p.display_name
          and older.id <> p.id
          and older.created_at < p.created_at
          and (
            -- score-like clones
            older.high_score = p.high_score
            or older.lifetime_count = p.lifetime_count
            or (
              coalesce(older.challenge_best, 0) > 0
              and older.challenge_best = p.challenge_best
            )
            -- later anon always loses to email owner of same name
            or ou.email is not null
          )
      )
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 3) Anon shadows of email: same name as any email user (scores optional)
create or replace function public.jp_cleanup_anon_shadows_of_email()
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
    where (coalesce(u.is_anonymous, false) = true or u.email is null)
      and p.display_name is not null
      and trim(p.display_name) <> ''
      and p.display_name <> 'Player'
      and u.created_at < now() - interval '5 minutes'
      and exists (
        select 1
        from public.jp_profiles e
        join auth.users eu on eu.id = e.id
        where e.display_name = p.display_name
          and e.id <> p.id
          and eu.email is not null
      )
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 4) Among pure-anon multi-name groups, keep one winner (highest lifetime, then oldest)
create or replace function public.jp_cleanup_anon_name_groups()
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
    with named as (
      select
        p.id,
        p.display_name,
        p.lifetime_count,
        p.created_at,
        row_number() over (
          partition by p.display_name
          order by
            coalesce(p.lifetime_count, 0) desc,
            coalesce(p.high_score, 0) desc,
            p.created_at asc
        ) as rn
      from public.jp_profiles p
      join auth.users u on u.id = p.id
      where (coalesce(u.is_anonymous, false) = true or u.email is null)
        and p.display_name is not null
        and trim(p.display_name) <> ''
        and p.display_name <> 'Player'
        and u.created_at < now() - interval '5 minutes'
        and p.display_name in (
          select display_name
          from public.jp_profiles
          group by display_name
          having count(*) > 1
        )
        -- only pure-anon groups (no email user in the name set)
        and not exists (
          select 1
          from public.jp_profiles e
          join auth.users eu on eu.id = e.id
          where e.display_name = p.display_name
            and eu.email is not null
        )
    )
    select id from named where rn > 1
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.jp_run_hygiene()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  empty_n int;
  clone_n int;
  shadow_n int;
  group_n int;
begin
  empty_n := public.jp_cleanup_empty_guests();
  shadow_n := public.jp_cleanup_anon_shadows_of_email();
  clone_n := public.jp_cleanup_anon_name_clones();
  group_n := public.jp_cleanup_anon_name_groups();
  return jsonb_build_object(
    'empty_guests_deleted', empty_n,
    'anon_clones_deleted', clone_n,
    'anon_shadows_deleted', shadow_n,
    'anon_group_extras_deleted', group_n,
    'ran_at', now()
  );
end;
$$;

-- Admin list: richer rows for the UI
create or replace function public.jp_admin_list_name_dupes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.jp_admin_require();
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select
        p.display_name,
        p.friend_code,
        p.high_score,
        p.lifetime_count,
        p.challenge_best,
        p.id,
        u.email,
        coalesce(u.is_anonymous, false) as is_anonymous,
        case
          when u.email is not null then 'email'
          when coalesce(u.is_anonymous, false) then 'anon'
          else 'guest'
        end as account_type,
        p.created_at
      from public.jp_profiles p
      join auth.users u on u.id = p.id
      where p.display_name in (
        select display_name from public.jp_profiles
        group by display_name having count(*) > 1
      )
      order by p.display_name, (u.email is null) desc, p.created_at
    ) x
  ), '[]'::jsonb);
end;
$$;

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

create or replace function public.jp_admin_debug_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.jp_admin_require();
  select jsonb_build_object(
    'profiles', (select count(*) from public.jp_profiles),
    'auth_users', (select count(*) from auth.users),
    'anon_users', (select count(*) from auth.users where coalesce(is_anonymous, false) or email is null),
    'email_users', (select count(*) from auth.users where email is not null),
    'empty_players', (
      select count(*) from public.jp_profiles p
      join auth.users u on u.id = p.id
      where p.display_name = 'Player'
        and coalesce(p.lifetime_count,0)=0
        and coalesce(p.high_score,0)=0
        and coalesce(p.challenge_best,0)=0
    ),
    'friendships', (select count(*) from public.jp_friendships),
    'groups', (select count(*) from public.jp_groups),
    'duplicate_names', (
      select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select display_name, count(*)::int as n
        from public.jp_profiles
        group by display_name
        having count(*) > 1
        order by count(*) desc
        limit 20
      ) d
    ),
    'top_players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', display_name,
        'code', friend_code,
        'high', high_score,
        'best10s', challenge_best,
        'life', lifetime_count
      ) order by lifetime_count desc), '[]'::jsonb)
      from (
        select display_name, friend_code, high_score, challenge_best, lifetime_count
        from public.jp_profiles
        order by lifetime_count desc
        limit 10
      ) t
    ),
    'ran_at', now()
  ) into result;
  return result;
end;
$$;

revoke all on function public.jp_cleanup_empty_guests() from public;
revoke all on function public.jp_cleanup_anon_name_clones() from public;
revoke all on function public.jp_cleanup_anon_shadows_of_email() from public;
revoke all on function public.jp_cleanup_anon_name_groups() from public;
revoke all on function public.jp_run_hygiene() from public;
revoke all on function public.jp_is_admin() from public;
revoke all on function public.jp_admin_require() from public;
revoke all on function public.jp_admin_debug_stats() from public;
revoke all on function public.jp_admin_run_hygiene() from public;
revoke all on function public.jp_admin_list_name_dupes() from public;

grant execute on function public.jp_cleanup_empty_guests() to service_role;
grant execute on function public.jp_cleanup_anon_name_clones() to service_role;
grant execute on function public.jp_cleanup_anon_shadows_of_email() to service_role;
grant execute on function public.jp_cleanup_anon_name_groups() to service_role;
grant execute on function public.jp_run_hygiene() to service_role;

revoke execute on function public.jp_is_admin() from anon, public;
revoke execute on function public.jp_admin_debug_stats() from anon, public;
revoke execute on function public.jp_admin_run_hygiene() from anon, public;
revoke execute on function public.jp_admin_list_name_dupes() from anon, public;

grant execute on function public.jp_is_admin() to authenticated;
grant execute on function public.jp_admin_debug_stats() to authenticated;
grant execute on function public.jp_admin_run_hygiene() to authenticated;
grant execute on function public.jp_admin_list_name_dupes() to authenticated;

insert into public.jp_admins (user_id, note)
values ('fea2c8ba-8a2e-4a2b-bed3-c15c40f9d38a', 'conor.wolanski@gmail.com / ImBetter')
on conflict (user_id) do update set note = excluded.note;
