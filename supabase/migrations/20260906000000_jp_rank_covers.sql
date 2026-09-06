-- Rank covers: one unique button skin per level (rank-01 … rank-99).
-- Earned on level-up, never sold in the store. Auto-equip the newest on claim.

create or replace function public.jp_rank_cover_id(p_level integer)
returns text
language sql
immutable
as $$
  select 'rank-' || lpad(greatest(1, least(99, coalesce(p_level, 1)))::text, 2, '0');
$$;

create or replace function public.jp_sync_rank_covers(p_equip boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  life bigint;
  to_lv int;
  lv int;
  ids text[] := array[]::text[];
  top_id text;
  p public.jp_profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select coalesce(lifetime_count, 0) into life from public.jp_profiles where id = uid;
  to_lv := public.jp_level_from_xp(coalesce(life, 0));
  if to_lv < 1 then to_lv := 1; end if;

  for lv in 1..to_lv loop
    ids := ids || array[public.jp_rank_cover_id(lv)];
  end loop;
  top_id := public.jp_rank_cover_id(to_lv);

  perform set_config('jp.allow_skins', 'on', true);
  update public.jp_profiles
  set
    owned_skins = array(
      select distinct unnest(coalesce(owned_skins, array['rose']::text[]) || ids)
    ),
    theme_button = case when p_equip then top_id else theme_button end,
    updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object(
    'ok', true,
    'level', to_lv,
    'equipped', p.theme_button,
    'owned_skins', to_jsonb(p.owned_skins)
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
  covers jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  w := public.jp_wallet_ensure(uid);
  select coalesce(lifetime_count, 0) into life from public.jp_profiles where id = uid;
  level := public.jp_level_from_xp(life);
  from_lv := greatest(w.level_rewarded, 1);
  to_lv := level;

  if to_lv <= from_lv then
    covers := public.jp_sync_rank_covers(false);
    return jsonb_build_object(
      'ok', true,
      'amount', 0,
      'balance', w.balance,
      'level', level,
      'from_level', from_lv,
      'to_level', to_lv,
      'covers', covers
    );
  end if;

  for lv in (from_lv + 1)..to_lv loop
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

  -- Grant every rank cover through current level and equip the newest.
  covers := public.jp_sync_rank_covers(true);

  return jsonb_build_object(
    'ok', true,
    'amount', total,
    'balance', w.balance,
    'level', level,
    'from_level', from_lv,
    'to_level', to_lv,
    'covers', covers,
    'equipped', covers->>'equipped'
  );
end;
$$;

create or replace function public.jp_my_cosmetics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.jp_profiles;
  covers jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  covers := public.jp_sync_rank_covers(false);
  select * into p from public.jp_profiles where id = uid;
  if p.id is null then
    return jsonb_build_object('owned_skins', jsonb_build_array('rose'), 'equipped', 'rose');
  end if;
  return jsonb_build_object(
    'owned_skins', to_jsonb(coalesce(p.owned_skins, array['rose']::text[])),
    'equipped', p.theme_button,
    'friend_code', p.friend_code,
    'account_ready', p.account_ready,
    'session_epoch', p.session_epoch,
    'covers', covers
  );
end;
$$;

revoke all on function public.jp_sync_rank_covers(boolean) from public, anon;
revoke all on function public.jp_rank_cover_id(integer) from public, anon;
grant execute on function public.jp_sync_rank_covers(boolean) to authenticated;
grant execute on function public.jp_claim_level_rewards() to authenticated;
grant execute on function public.jp_my_cosmetics() to authenticated;
