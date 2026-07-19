-- Push Thru — admin tools (dev hygiene only; no score tampering)

create table if not exists public.jp_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.jp_admins enable row level security;

drop policy if exists "jp_admins_select_self" on public.jp_admins;
create policy "jp_admins_select_self" on public.jp_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Seed: ImBetter / conor.wolanski@gmail.com
insert into public.jp_admins (user_id, note)
values ('fea2c8ba-8a2e-4a2b-bed3-c15c40f9d38a', 'conor.wolanski@gmail.com / ImBetter')
on conflict (user_id) do nothing;

create or replace function public.jp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jp_admins a where a.user_id = auth.uid()
  )
  or exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) = 'conor.wolanski@gmail.com'
  );
$$;

create or replace function public.jp_admin_require()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.jp_is_admin() then
    raise exception 'Admin only';
  end if;
end;
$$;

-- Debug stats (read-only)
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
    'board_posts', (select count(*) from public.jp_board_posts),
    'friend_messages', (select count(*) from public.jp_friend_messages),
    'duplicate_names', (
      select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'count', n)), '[]'::jsonb)
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

-- Run existing hygiene (empty guests + anon clones)
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

-- List potential name duplicates (read-only)
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
        p.created_at
      from public.jp_profiles p
      join auth.users u on u.id = p.id
      where p.display_name in (
        select display_name from public.jp_profiles
        group by display_name having count(*) > 1
      )
      order by p.display_name, p.created_at
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.jp_is_admin() from public;
revoke all on function public.jp_admin_require() from public;
revoke all on function public.jp_admin_debug_stats() from public;
revoke all on function public.jp_admin_run_hygiene() from public;
revoke all on function public.jp_admin_list_name_dupes() from public;

grant execute on function public.jp_is_admin() to authenticated;
grant execute on function public.jp_admin_debug_stats() to authenticated;
grant execute on function public.jp_admin_run_hygiene() to authenticated;
grant execute on function public.jp_admin_list_name_dupes() to authenticated;
