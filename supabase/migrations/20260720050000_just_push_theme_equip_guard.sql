-- Only equip skins the account owns (or free classics). Prevents REST theme spoof of locked looks.

create or replace function public.jp_profiles_guard_locked_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_ids text[] := array['rose','coral','amber'];
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if current_setting('jp.allow_skins', true) is distinct from 'on' then
    new.owned_skins := old.owned_skins;
  end if;

  if current_setting('jp.allow_identity', true) is distinct from 'on' then
    new.friend_code := old.friend_code;
    new.account_ready := old.account_ready;
    new.session_epoch := old.session_epoch;
  end if;

  if current_setting('jp.allow_name_change', true) is distinct from 'on' then
    new.name_changes_day := old.name_changes_day;
    new.name_changes_count := old.name_changes_count;
  end if;

  -- theme_button: free classics or owned only
  if new.theme_button is distinct from old.theme_button then
    if not (
      new.theme_button = any (free_ids)
      or new.theme_button = any (coalesce(new.owned_skins, array['rose']::text[]))
    ) then
      new.theme_button := old.theme_button;
    end if;
  end if;

  return new;
end;
$$;

-- Strip residual privileges some roles re-accumulate
revoke delete, truncate, references, trigger on table public.jp_profiles from authenticated;
revoke delete, truncate, references, trigger, insert, update on table public.jp_wallets from authenticated;
revoke delete, truncate, references, trigger, insert, update on table public.jp_wallet_ledger from authenticated;
grant select, insert, update on table public.jp_profiles to authenticated;
grant select on table public.jp_wallets to authenticated;
grant select on table public.jp_wallet_ledger to authenticated;
