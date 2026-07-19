-- Account session lock (1 active session) + cosmetics / store foundation
-- Tokens buy skins only (cosmetic). No click/XP power.

alter table public.jp_profiles
  add column if not exists session_epoch integer not null default 0,
  add column if not exists owned_skins text[] not null default array['rose']::text[],
  add column if not exists account_ready boolean not null default false,
  add column if not exists contact_email text;

-- Ensure rose always owned
update public.jp_profiles
set owned_skins = array['rose']
where owned_skins is null or cardinality(owned_skins) = 0;

-- ——— Single active session ———
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
  update public.jp_profiles
  set session_epoch = session_epoch + 1, updated_at = now()
  where id = uid
  returning session_epoch into ep;
  if ep is null then
    -- profile may lag signup trigger
    insert into public.jp_profiles (id, display_name, friend_code, account_ready)
    values (
      uid,
      'Player',
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      false
    )
    on conflict (id) do update set session_epoch = public.jp_profiles.session_epoch + 1
    returning session_epoch into ep;
  end if;
  return jsonb_build_object('session_epoch', ep, 'user_id', uid);
end;
$$;

create or replace function public.jp_session_ping(p_epoch integer)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  ep int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select session_epoch into ep from public.jp_profiles where id = uid;
  if ep is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if ep is distinct from p_epoch then
    return jsonb_build_object('ok', false, 'reason', 'replaced', 'session_epoch', ep);
  end if;
  return jsonb_build_object('ok', true, 'session_epoch', ep);
end;
$$;

-- Mark account password-ready (client set password / created account)
create or replace function public.jp_mark_account_ready()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.jp_profiles
  set account_ready = true, updated_at = now()
  where id = auth.uid();
end;
$$;

-- ——— Store catalog (static in SQL for server prices) ———
create or replace function public.jp_store_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'skins', jsonb_build_array(
      jsonb_build_object('id','rose','label','Rose','value','#ff4d6d','cost',0,'free',true),
      jsonb_build_object('id','coral','label','Coral','value','#ff7a59','cost',0,'free',true),
      jsonb_build_object('id','amber','label','Amber','value','#f5a524','cost',0,'free',true),
      jsonb_build_object('id','lime','label','Lime','value','#84cc16','cost',50,'free',false),
      jsonb_build_object('id','mint','label','Mint','value','#2dd4a8','cost',50,'free',false),
      jsonb_build_object('id','sky','label','Sky','value','#38bdf8','cost',75,'free',false),
      jsonb_build_object('id','blue','label','Blue','value','#4f7cff','cost',75,'free',false),
      jsonb_build_object('id','violet','label','Violet','value','#a78bfa','cost',100,'free',false),
      jsonb_build_object('id','pink','label','Pink','value','#f472b6','cost',100,'free',false),
      jsonb_build_object('id','white','label','White','value','#e8e8f0','cost',125,'free',false),
      jsonb_build_object('id','gold','label','Gold Rush','value','#fbbf24','cost',200,'free',false),
      jsonb_build_object('id','neon','label','Neon Pulse','value','#22d3ee','cost',250,'free',false),
      jsonb_build_object('id','magma','label','Magma','value','#ef4444','cost',250,'free',false),
      jsonb_build_object('id','shadow','label','Shadow','value','#64748b','cost',150,'free',false)
    ),
    'token_packs', jsonb_build_array(
      jsonb_build_object('id','pack_s','label','Handy Pack','tokens',100,'price_label','$0.99','iap',true,'enabled',false),
      jsonb_build_object('id','pack_m','label','Solid Pack','tokens',550,'price_label','$4.99','iap',true,'enabled',false),
      jsonb_build_object('id','pack_l','label','Vault Pack','tokens',1200,'price_label','$9.99','iap',true,'enabled',false)
    ),
    'note', 'Skins are cosmetic only — never more clicks or XP. Real-money token packs come later (IAP).'
  );
$$;

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

  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then raise exception 'Profile not found'; end if;

  if sid = any (coalesce(p.owned_skins, array[]::text[])) then
    -- already owned: equip
    perform set_config('jp.allow_name_change', 'off', true);
    update public.jp_profiles
    set theme_button = sid, updated_at = now()
    where id = uid;
    return jsonb_build_object('ok', true, 'owned', true, 'equipped', sid, 'spent', 0, 'balance', (select balance from public.jp_wallets where user_id = uid));
  end if;

  if not free and cost > 0 then
    w := public.jp_wallet_debit(uid, cost, 'store_skin', jsonb_build_object('skin', sid));
  else
    perform public.jp_wallet_ensure(uid);
    select * into w from public.jp_wallets where user_id = uid;
  end if;

  update public.jp_profiles
  set
    owned_skins = array(select distinct unnest(coalesce(owned_skins, array['rose']::text[]) || array[sid])),
    theme_button = sid,
    updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object(
    'ok', true,
    'owned', true,
    'equipped', sid,
    'spent', case when free then 0 else cost end,
    'balance', coalesce(w.balance, 0),
    'owned_skins', to_jsonb(p.owned_skins)
  );
end;
$$;

create or replace function public.jp_store_equip_skin(p_skin_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid text := lower(trim(coalesce(p_skin_id, '')));
  p public.jp_profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then raise exception 'Profile not found'; end if;
  if not (sid = any (coalesce(p.owned_skins, array['rose']::text[]))) then
    raise exception 'You do not own that skin';
  end if;
  update public.jp_profiles
  set theme_button = sid, updated_at = now()
  where id = uid;
  return jsonb_build_object('ok', true, 'equipped', sid);
end;
$$;

-- Profile snapshot for store/UI
create or replace function public.jp_my_cosmetics()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  p public.jp_profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.jp_profiles where id = uid;
  if p.id is null then
    return jsonb_build_object('owned_skins', jsonb_build_array('rose'), 'equipped', 'rose');
  end if;
  return jsonb_build_object(
    'owned_skins', to_jsonb(coalesce(p.owned_skins, array['rose']::text[])),
    'equipped', p.theme_button,
    'friend_code', p.friend_code,
    'account_ready', p.account_ready,
    'session_epoch', p.session_epoch
  );
end;
$$;

revoke all on function public.jp_session_begin() from public, anon;
revoke all on function public.jp_session_ping(integer) from public, anon;
revoke all on function public.jp_mark_account_ready() from public, anon;
revoke all on function public.jp_store_catalog() from public, anon;
revoke all on function public.jp_store_buy_skin(text) from public, anon;
revoke all on function public.jp_store_equip_skin(text) from public, anon;
revoke all on function public.jp_my_cosmetics() from public, anon;

grant execute on function public.jp_session_begin() to authenticated;
grant execute on function public.jp_session_ping(integer) to authenticated;
grant execute on function public.jp_mark_account_ready() to authenticated;
grant execute on function public.jp_store_catalog() to authenticated;
grant execute on function public.jp_store_buy_skin(text) to authenticated;
grant execute on function public.jp_store_equip_skin(text) to authenticated;
grant execute on function public.jp_my_cosmetics() to authenticated;

-- Bind friend_code once at account creation so code@login domain works
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
  if code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'Invalid login code';
  end if;

  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then
    insert into public.jp_profiles (id, display_name, friend_code, account_ready)
    values (uid, 'Player', code, false)
    on conflict (id) do nothing;
    select * into p from public.jp_profiles where id = uid for update;
  end if;

  if coalesce(p.account_ready, false) and p.friend_code is distinct from code then
    -- already finalized with different code
    return jsonb_build_object('ok', true, 'friend_code', p.friend_code, 'bound', false);
  end if;

  if exists (select 1 from public.jp_profiles x where x.friend_code = code and x.id <> uid) then
    raise exception 'Code unavailable — try again';
  end if;

  update public.jp_profiles
  set friend_code = code, account_ready = true, updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object('ok', true, 'friend_code', p.friend_code, 'bound', true);
end;
$$;

revoke all on function public.jp_bind_login_code(text) from public, anon;
grant execute on function public.jp_bind_login_code(text) to authenticated;
