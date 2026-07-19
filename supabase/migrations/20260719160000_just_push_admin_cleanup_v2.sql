-- Stronger clone cleanup + ensure admin RPCs work for authenticated admins

-- Anon clones: same display name as an older profile AND (same high OR same lifetime).
-- Does not require challenge_best match (glitch scores often differ on 10s).
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
      and (
        coalesce(u.is_anonymous, false) = true
        or u.email is null
      )
      and exists (
        select 1
        from public.jp_profiles older
        where older.display_name = p.display_name
          and older.id <> p.id
          and older.created_at < p.created_at
          and (
            older.high_score = p.high_score
            or older.lifetime_count = p.lifetime_count
          )
      )
      and u.created_at < now() - interval '5 minutes'
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Also delete later anons that copy an email user's display name + high score
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
      and p.display_name <> 'Player'
      and exists (
        select 1
        from public.jp_profiles e
        join auth.users eu on eu.id = e.id
        where e.display_name = p.display_name
          and e.id <> p.id
          and eu.email is not null
          and e.high_score = p.high_score
      )
      and u.created_at < now() - interval '5 minutes'
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
begin
  empty_n := public.jp_cleanup_empty_guests();
  clone_n := public.jp_cleanup_anon_name_clones();
  shadow_n := public.jp_cleanup_anon_shadows_of_email();
  return jsonb_build_object(
    'empty_guests_deleted', empty_n,
    'anon_clones_deleted', clone_n,
    'anon_shadows_deleted', shadow_n,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.jp_cleanup_anon_shadows_of_email() from public;
grant execute on function public.jp_cleanup_anon_shadows_of_email() to service_role;

-- Admin wrappers (re-assert grants)
grant execute on function public.jp_is_admin() to authenticated;
grant execute on function public.jp_admin_debug_stats() to authenticated;
grant execute on function public.jp_admin_run_hygiene() to authenticated;
grant execute on function public.jp_admin_list_name_dupes() to authenticated;

-- Ensure ImBetter stays admin
insert into public.jp_admins (user_id, note)
values ('fea2c8ba-8a2e-4a2b-bed3-c15c40f9d38a', 'conor.wolanski@gmail.com / ImBetter')
on conflict (user_id) do nothing;
