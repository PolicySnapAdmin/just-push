-- Store economy v2: leaner passive Tokens, featured daily deal, catalog refresh.
-- Cosmetics only — never more clicks / XP.

-- ——— Leaner free Token grants ———

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
    -- was 25 + (level/5)*5 max 100 → leaner: 12 + (level/8)*3 max 40
    'daily_amount', least(40, 12 + (level / 8) * 3),
    'level', level,
    'level_rewarded', w.level_rewarded,
    'pending_level_rewards', greatest(level - w.level_rewarded, 0),
    'drops_today', w.drops_today,
    'drops_cap', 5
  );
end;
$$;

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
  amt := least(40, 12 + (level / 8) * 3);

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
    -- was 10 * level max 500 → 5 * level max 120
    piece := least(120, 5 * lv);
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
  cap int := 5;
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

  -- ~1.5% per throttled client call (was ~2.5%)
  roll := random();
  if roll > 0.015 then
    return jsonb_build_object('hit', false, 'balance', w.balance, 'drops_today', w.drops_today);
  end if;

  if roll < 0.001 then
    amt := 60;
  elsif roll < 0.004 then
    amt := 25;
  else
    amt := 5 + floor(random() * 11)::int; -- 5–15
  end if;

  update public.jp_wallets
  set drops_today = drops_today + 1, drops_day = today, updated_at = now()
  where user_id = uid;

  w := public.jp_wallet_credit(uid, amt, 'loot_box', jsonb_build_object('tier', case when amt >= 50 then 'rare' when amt >= 20 then 'uncommon' else 'common' end));

  return jsonb_build_object(
    'hit', true,
    'amount', amt,
    'balance', w.balance,
    'drops_today', w.drops_today,
    'drops_cap', cap
  );
end;
$$;

-- ——— Catalog + daily featured deal (20% off one paid skin, UTC day rotation) ———

create or replace function public.jp_store_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  skins jsonb;
  paid jsonb;
  n int;
  idx int;
  feat jsonb;
  base_cost int;
  feat_cost int;
  day_key int;
begin
  skins := jsonb_build_array(
    jsonb_build_object('id','rose','label','Rose','value','#ff4d6d','cost',0,'free',true,'cat','classic','rarity','common'),
    jsonb_build_object('id','coral','label','Coral','value','#ff7a59','cost',0,'free',true,'cat','classic','rarity','common'),
    jsonb_build_object('id','amber','label','Amber','value','#f5a524','cost',0,'free',true,'cat','classic','rarity','common'),
    jsonb_build_object('id','lime','label','Lime','value','#84cc16','cost',60,'free',false,'cat','classic','rarity','common'),
    jsonb_build_object('id','mint','label','Mint','value','#2dd4a8','cost',60,'free',false,'cat','classic','rarity','common'),
    jsonb_build_object('id','sky','label','Sky','value','#38bdf8','cost',90,'free',false,'cat','classic','rarity','common'),
    jsonb_build_object('id','blue','label','Azure','value','#4f7cff','cost',90,'free',false,'cat','classic','rarity','common'),
    jsonb_build_object('id','violet','label','Violet','value','#a78bfa','cost',160,'free',false,'cat','classic','rarity','uncommon'),
    jsonb_build_object('id','pink','label','Blush','value','#f472b6','cost',160,'free',false,'cat','classic','rarity','uncommon'),
    jsonb_build_object('id','white','label','Pearl','value','#e8e8f0','cost',200,'free',false,'cat','classic','rarity','uncommon'),
    jsonb_build_object('id','iron','label','Iron','value','#94a3b8','cost',120,'free',false,'cat','metal','rarity','common'),
    jsonb_build_object('id','copper','label','Copper','value','#d97706','cost',160,'free',false,'cat','metal','rarity','common'),
    jsonb_build_object('id','gold','label','Gold Rush','value','#fbbf24','cost',400,'free',false,'cat','metal','rarity','rare'),
    jsonb_build_object('id','platinum','label','Platinum','value','#e2e8f0','cost',700,'free',false,'cat','metal','rarity','epic'),
    jsonb_build_object('id','obsidian','label','Obsidian','value','#1e1b2e','cost',480,'free',false,'cat','metal','rarity','rare'),
    jsonb_build_object('id','knight','label','Knight Plate','value','#64748b','cost',450,'free',false,'cat','armor','rarity','rare'),
    jsonb_build_object('id','dragonscale','label','Dragonscale','value','#15803d','cost',800,'free',false,'cat','armor','rarity','epic'),
    jsonb_build_object('id','runic','label','Runic Guard','value','#7c3aed','cost',1100,'free',false,'cat','armor','rarity','legendary'),
    jsonb_build_object('id','crimson','label','Crimson Mail','value','#991b1b','cost',750,'free',false,'cat','armor','rarity','epic'),
    jsonb_build_object('id','nebula','label','Nebula','value','#7c3aed','cost',650,'free',false,'cat','space','rarity','epic'),
    jsonb_build_object('id','void','label','Void','value','#0f172a','cost',850,'free',false,'cat','space','rarity','epic'),
    jsonb_build_object('id','comet','label','Comet Trail','value','#22d3ee','cost',500,'free',false,'cat','space','rarity','rare'),
    jsonb_build_object('id','solar','label','Solar Flare','value','#f97316','cost',550,'free',false,'cat','space','rarity','rare'),
    jsonb_build_object('id','neon','label','Neon Pulse','value','#22d3ee','cost',450,'free',false,'cat','space','rarity','rare'),
    jsonb_build_object('id','earth','label','Terra','value','#2563eb','cost',280,'free',false,'cat','world','rarity','uncommon'),
    jsonb_build_object('id','mars','label','Mars','value','#dc2626','cost',320,'free',false,'cat','world','rarity','uncommon'),
    jsonb_build_object('id','jupiter','label','Jupiter','value','#d97706','cost',500,'free',false,'cat','world','rarity','rare'),
    jsonb_build_object('id','moon','label','Lunar','value','#cbd5e1','cost',280,'free',false,'cat','world','rarity','uncommon'),
    jsonb_build_object('id','magma','label','Magma','value','#ef4444','cost',450,'free',false,'cat','element','rarity','rare'),
    jsonb_build_object('id','frost','label','Frostbite','value','#7dd3fc','cost',450,'free',false,'cat','element','rarity','rare'),
    jsonb_build_object('id','storm','label','Storm','value','#6366f1','cost',500,'free',false,'cat','element','rarity','rare'),
    jsonb_build_object('id','toxic','label','Toxic','value','#a3e635','cost',320,'free',false,'cat','element','rarity','uncommon'),
    jsonb_build_object('id','shadow','label','Shadow','value','#475569','cost',200,'free',false,'cat','element','rarity','common')
  );

  select coalesce(jsonb_agg(s), '[]'::jsonb) into paid
  from jsonb_array_elements(skins) s
  where coalesce((s->>'free')::boolean, false) = false
    and coalesce((s->>'cost')::int, 0) > 0;

  n := jsonb_array_length(paid);
  if n > 0 then
    day_key := (extract(epoch from (date_trunc('day', now() at time zone 'utc'))) / 86400)::int;
    idx := abs(day_key) % n;
    feat := paid->idx;
    base_cost := coalesce((feat->>'cost')::int, 0);
    feat_cost := greatest(1, (base_cost * 80) / 100); -- 20% off
  end if;

  return jsonb_build_object(
    'skins', skins,
    'featured', case when feat is null then null else jsonb_build_object(
      'id', feat->>'id',
      'label', feat->>'label',
      'value', feat->>'value',
      'rarity', feat->>'rarity',
      'cat', feat->>'cat',
      'cost', base_cost,
      'deal_cost', feat_cost,
      'discount_pct', 20,
      'resets', 'UTC midnight'
    ) end,
    'token_packs', jsonb_build_array(
      jsonb_build_object('id','pack_s','label','Spark Pack','tokens',120,'price_label','$0.99','iap',true,'enabled',false,'tag','starter'),
      jsonb_build_object('id','pack_m','label','Charge Pack','tokens',650,'price_label','$4.99','iap',true,'enabled',false,'tag','popular'),
      jsonb_build_object('id','pack_l','label','Nova Pack','tokens',1500,'price_label','$9.99','iap',true,'enabled',false,'tag','best')
    ),
    'economy', jsonb_build_object(
      'daily_base', 12,
      'daily_max', 40,
      'level_per', 5,
      'level_cap', 120,
      'loot_cap', 5,
      'note', 'Tokens are cosmetic currency only'
    ),
    'note', 'Tap a skin to preview. Buy to unlock forever on this account. Cosmetic only — never more clicks or XP.'
  );
end;
$$;

-- Buy applies featured deal_cost when skin is today's feature
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
      'ok', true,
      'owned', true,
      'equipped', sid,
      'spent', 0,
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
    'spent', spent,
    'balance', coalesce(w.balance, 0),
    'owned_skins', to_jsonb(p.owned_skins),
    'deal', (feat is not null and feat->>'id' = sid and spent > 0)
  );
end;
$$;

grant execute on function public.jp_wallet_me() to authenticated;
grant execute on function public.jp_claim_daily_bonus() to authenticated;
grant execute on function public.jp_claim_level_rewards() to authenticated;
grant execute on function public.jp_try_loot_drop() to authenticated;
grant execute on function public.jp_store_catalog() to authenticated;
grant execute on function public.jp_store_buy_skin(text) to authenticated;
