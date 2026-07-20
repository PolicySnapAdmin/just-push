-- Reliable profile bootstrap for sign-in (esp. mobile).
-- Client table grants + RLS can surface as "permission denied for jp_profiles"
-- when the JWT is briefly missing or upsert races the auth trigger.
-- This security-definer RPC always runs as the function owner for auth.uid().

-- Re-assert least-privilege table grants (safety)
grant usage on schema public to anon, authenticated;
revoke all on table public.jp_profiles from anon, public;
grant select, insert, update on table public.jp_profiles to authenticated;

-- Ensure RLS policies exist and target authenticated
drop policy if exists "jp_profiles_select" on public.jp_profiles;
create policy "jp_profiles_select" on public.jp_profiles
  for select to authenticated
  using (true);

drop policy if exists "jp_profiles_update_own" on public.jp_profiles;
create policy "jp_profiles_update_own" on public.jp_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "jp_profiles_insert_own" on public.jp_profiles;
create policy "jp_profiles_insert_own" on public.jp_profiles
  for insert to authenticated
  with check (id = auth.uid());

create or replace function public.jp_ensure_my_profile(
  p_display_name text default null,
  p_theme_button text default null,
  p_theme_bg text default null
)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.jp_profiles;
  code text;
  tries int := 0;
  dname text;
  tbtn text;
  tbg text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into row from public.jp_profiles where id = uid;
  if found then
    return row;
  end if;

  dname := left(trim(coalesce(nullif(p_display_name, ''), 'Player')), 16);
  if dname = '' then dname := 'Player'; end if;
  tbtn := coalesce(nullif(trim(p_theme_button), ''), 'rose');
  tbg := coalesce(nullif(trim(p_theme_bg), ''), 'midnight');

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.jp_profiles (id, display_name, friend_code, theme_button, theme_bg)
      values (uid, dname, code, tbtn, tbg)
      on conflict (id) do update
        set updated_at = now()
      returning * into row;
      return row;
    exception
      when unique_violation then
        -- friend_code collision or concurrent insert of same id
        select * into row from public.jp_profiles where id = uid;
        if found then
          return row;
        end if;
        tries := tries + 1;
        if tries > 10 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.jp_ensure_my_profile(text, text, text) from public, anon;
grant execute on function public.jp_ensure_my_profile(text, text, text) to authenticated;

-- Keep signup trigger resilient (same owner path)
create or replace function public.jp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  tries int := 0;
  dname text;
begin
  dname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    'Player'
  );
  dname := left(dname, 16);
  if dname = '' then dname := 'Player'; end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.jp_profiles (id, display_name, friend_code)
      values (new.id, dname, code);
      exit;
    exception
      when unique_violation then
        -- already has profile (id) — fine
        if exists (select 1 from public.jp_profiles where id = new.id) then
          exit;
        end if;
        tries := tries + 1;
        if tries > 8 then
          raise;
        end if;
    end;
  end loop;
  return new;
end;
$$;
