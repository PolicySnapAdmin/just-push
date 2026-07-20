-- Reverse-engineering harden: lock privileged profile columns, least-privilege grants,
-- hide group invite codes from open listing, join-by-code via RPC only.

-- ——— 1. Profile column lock (client REST cannot forge skins / codes / session) ———
-- Scores already guarded via jp.allow_scores; names via jp.allow_name_change.

create or replace function public.jp_profiles_guard_locked_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Owned cosmetics: only store RPCs (jp.allow_skins=on)
  if current_setting('jp.allow_skins', true) is distinct from 'on' then
    new.owned_skins := old.owned_skins;
  end if;

  -- Identity / session: only account/session RPCs
  if current_setting('jp.allow_identity', true) is distinct from 'on' then
    new.friend_code := old.friend_code;
    new.account_ready := old.account_ready;
    new.session_epoch := old.session_epoch;
  end if;

  -- Rename counters only with name RPC
  if current_setting('jp.allow_name_change', true) is distinct from 'on' then
    new.name_changes_day := old.name_changes_day;
    new.name_changes_count := old.name_changes_count;
  end if;

  -- contact_email: allow own update (optional recovery field) — leave as client-writable
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_locked_cols on public.jp_profiles;
create trigger jp_profiles_guard_locked_cols
  before update on public.jp_profiles
  for each row execute function public.jp_profiles_guard_locked_cols();

-- Insert: never accept client-supplied ownership / identity privileges
create or replace function public.jp_profiles_guard_locked_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('jp.allow_skins', true) is distinct from 'on' then
    new.owned_skins := array['rose']::text[];
  end if;
  if current_setting('jp.allow_identity', true) is distinct from 'on' then
    -- keep provided friend_code if non-empty (signup needs a code), but force ready/session safe defaults
    new.account_ready := coalesce(new.account_ready, false);
    if new.account_ready is distinct from false
       and current_setting('jp.allow_identity', true) is distinct from 'on' then
      -- only force false when not privileged path
      new.account_ready := false;
    end if;
    new.session_epoch := 0;
  end if;
  return new;
end;
$$;

-- Simpler insert guard: always reset privileged fields unless allow flags set
create or replace function public.jp_profiles_guard_locked_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('jp.allow_skins', true) is distinct from 'on' then
    new.owned_skins := array['rose']::text[];
  end if;
  if current_setting('jp.allow_identity', true) is distinct from 'on' then
    new.account_ready := false;
    new.session_epoch := 0;
    -- friend_code still required unique; signup/ensure RPCs generate it as definer owner
  end if;
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_locked_insert on public.jp_profiles;
create trigger jp_profiles_guard_locked_insert
  before insert on public.jp_profiles
  for each row execute function public.jp_profiles_guard_locked_insert();

-- ——— 2. Privileged writers must open the lock window ———

create or replace function public.jp_store_buy_skin(p_skin_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid text := lower(trim(coalesce(p_skin_id, '')));
  cost int;
  free boolean;
  p public.jp_profiles;
  w public.jp_wallets;
  catalog jsonb;
  skin jsonb;
  feat jsonb;
  spent int := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if sid = '' then raise exception 'Pick a skin'; end if;

  catalog := public.jp_store_catalog();
  select s into skin
  from jsonb_array_elements(catalog->'skins') s
  where s->>'id' = sid
  limit 1;
  if skin is null then raise exception 'Unknown skin'; end if;

  cost := coalesce((skin->>'cost')::int, 0);
  free := coalesce((skin->>'free')::boolean, false);
  feat := catalog->'featured';
  if feat is not null and feat->>'id' = sid and coalesce((feat->>'deal_cost')::int, 0) > 0 then
    cost := (feat->>'deal_cost')::int;
  end if;

  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then raise exception 'Profile not found'; end if;

  if sid = any (coalesce(p.owned_skins, array[]::text[])) then
    update public.jp_profiles
    set theme_button = sid, updated_at = now()
    where id = uid;
    return jsonb_build_object(
      'ok', true, 'owned', true, 'equipped', sid, 'spent', 0,
      'balance', (select balance from public.jp_wallets where user_id = uid)
    );
  end if;

  if not free and cost > 0 then
    w := public.jp_wallet_debit(uid, cost, 'store_skin', jsonb_build_object('skin', sid, 'deal', (feat is not null and feat->>'id' = sid)));
    spent := cost;
  else
    perform public.jp_wallet_ensure(uid);
    select * into w from public.jp_wallets where user_id = uid;
    spent := 0;
  end if;

  perform set_config('jp.allow_skins', 'on', true);
  update public.jp_profiles
  set
    owned_skins = array(select distinct unnest(coalesce(owned_skins, array['rose']::text[]) || array[sid])),
    theme_button = sid,
    updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object(
    'ok', true, 'owned', true, 'equipped', sid, 'spent', spent,
    'balance', coalesce(w.balance, 0),
    'owned_skins', to_jsonb(p.owned_skins),
    'deal', (feat is not null and feat->>'id' = sid and spent > 0)
  );
end;
$$;

create or replace function public.jp_mark_account_ready()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform set_config('jp.allow_identity', 'on', true);
  update public.jp_profiles
  set account_ready = true, updated_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.jp_session_begin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ep int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  perform set_config('jp.allow_identity', 'on', true);
  update public.jp_profiles
  set session_epoch = session_epoch + 1, updated_at = now()
  where id = uid
  returning session_epoch into ep;
  if ep is null then
    perform set_config('jp.allow_identity', 'on', true);
    perform set_config('jp.allow_skins', 'on', true);
    insert into public.jp_profiles (id, display_name, friend_code, account_ready, owned_skins)
    values (
      uid, 'Player',
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      false, array['rose']::text[]
    )
    on conflict (id) do update set session_epoch = public.jp_profiles.session_epoch + 1
    returning session_epoch into ep;
  end if;
  return jsonb_build_object('session_epoch', ep, 'user_id', uid);
end;
$$;

-- Re-apply bind login code with identity lock open
create or replace function public.jp_bind_login_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text := upper(trim(coalesce(p_code, '')));
  p public.jp_profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'Invalid code';
  end if;

  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then
    perform set_config('jp.allow_identity', 'on', true);
    perform set_config('jp.allow_skins', 'on', true);
    insert into public.jp_profiles (id, display_name, friend_code, account_ready, owned_skins)
    values (uid, 'Player', code, true, array['rose']::text[])
    on conflict (id) do nothing;
    select * into p from public.jp_profiles where id = uid for update;
  end if;

  if coalesce(p.account_ready, false) and p.friend_code is distinct from code then
    return jsonb_build_object('ok', true, 'friend_code', p.friend_code, 'bound', false);
  end if;

  if exists (select 1 from public.jp_profiles x where x.friend_code = code and x.id <> uid) then
    raise exception 'Code already taken';
  end if;

  perform set_config('jp.allow_identity', 'on', true);
  update public.jp_profiles
  set friend_code = code, account_ready = true, updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object('ok', true, 'friend_code', p.friend_code, 'bound', true);
end;
$$;

-- ensure profile insert path (definer) may set defaults
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
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into row from public.jp_profiles where id = uid;
  if found then return row; end if;

  dname := left(trim(coalesce(nullif(p_display_name, ''), 'Player')), 16);
  if dname = '' then dname := 'Player'; end if;
  tbtn := coalesce(nullif(trim(p_theme_button), ''), 'rose');
  tbg := coalesce(nullif(trim(p_theme_bg), ''), 'midnight');

  perform set_config('jp.allow_identity', 'on', true);
  perform set_config('jp.allow_skins', 'on', true);

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.jp_profiles (id, display_name, friend_code, theme_button, theme_bg, owned_skins, account_ready)
      values (uid, dname, code, tbtn, tbg, array['rose']::text[], false)
      on conflict (id) do update set updated_at = now()
      returning * into row;
      return row;
    exception
      when unique_violation then
        select * into row from public.jp_profiles where id = uid;
        if found then return row; end if;
        tries := tries + 1;
        if tries > 10 then raise; end if;
    end;
  end loop;
end;
$$;

-- Signup trigger: allow identity insert
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

  perform set_config('jp.allow_identity', 'on', true);
  perform set_config('jp.allow_skins', 'on', true);

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.jp_profiles (id, display_name, friend_code, owned_skins, account_ready)
      values (new.id, dname, code, array['rose']::text[], false);
      exit;
    exception
      when unique_violation then
        if exists (select 1 from public.jp_profiles where id = new.id) then
          exit;
        end if;
        tries := tries + 1;
        if tries > 8 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;

-- ——— 3. Least-privilege table grants ———
revoke all on table public.jp_profiles from anon, public;
grant select, insert, update on table public.jp_profiles to authenticated;
-- no DELETE for clients (use jp_delete_my_account)

revoke all on table public.jp_wallets from anon, public, authenticated;
revoke all on table public.jp_wallet_ledger from anon, public, authenticated;
grant select on table public.jp_wallets to authenticated;
grant select on table public.jp_wallet_ledger to authenticated;

revoke all on table public.jp_name_history from anon, public, authenticated;
grant select on table public.jp_name_history to authenticated;

revoke all on table public.jp_admins from anon, public, authenticated;
grant select on table public.jp_admins to authenticated;

-- Chat tables: keep minimal if UI off; still least privilege
revoke all on table public.jp_board_posts from anon, public;
revoke all on table public.jp_friend_messages from anon, public;
grant select, insert, delete on table public.jp_board_posts to authenticated;
grant select, insert, update, delete on table public.jp_friend_messages to authenticated;

revoke all on table public.jp_groups from anon, public;
revoke all on table public.jp_group_members from anon, public;
grant select, insert, delete on table public.jp_groups to authenticated;
grant select, insert, delete on table public.jp_group_members to authenticated;

-- ——— 4. Groups: no open invite-code directory ———
drop policy if exists "jp_groups_select" on public.jp_groups;
create policy "jp_groups_select" on public.jp_groups
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.jp_group_members m
      where m.group_id = jp_groups.id and m.user_id = auth.uid()
    )
  );

-- Join by invite code (security definer — only returns match for exact code)
create or replace function public.jp_join_group_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text := upper(trim(coalesce(p_code, '')));
  g public.jp_groups;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if code = '' then raise exception 'Enter an invite code'; end if;

  select * into g from public.jp_groups where upper(invite_code) = code limit 1;
  if g.id is null then raise exception 'Group not found'; end if;

  insert into public.jp_group_members (group_id, user_id)
  values (g.id, uid)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'group_id', g.id,
    'name', g.name,
    'invite_code', g.invite_code
  );
end;
$$;

revoke all on function public.jp_join_group_by_code(text) from public, anon;
grant execute on function public.jp_join_group_by_code(text) to authenticated;

-- Re-grant store/session helpers
grant execute on function public.jp_store_buy_skin(text) to authenticated;
grant execute on function public.jp_mark_account_ready() to authenticated;
grant execute on function public.jp_session_begin() to authenticated;
grant execute on function public.jp_bind_login_code(text) to authenticated;
grant execute on function public.jp_ensure_my_profile(text, text, text) to authenticated;
