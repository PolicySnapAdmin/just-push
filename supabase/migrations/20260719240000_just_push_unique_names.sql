-- Unique display names (except default "Player"), 3 renames/day, vacated-name cooldown.
-- Identity (wallet, scores, friends, PvP) is ALWAYS user_id / friend_code — never display_name.

-- Rename tracking on profile
alter table public.jp_profiles
  add column if not exists name_changes_day date,
  add column if not exists name_changes_count integer not null default 0 check (name_changes_count >= 0);

-- History of vacated names (prevents sniping old identity / confusion)
create table if not exists public.jp_name_history (
  id bigserial primary key,
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  name_norm text not null,
  display_name text not null,
  vacated_at timestamptz not null default now(),
  free_at timestamptz not null
);

create index if not exists jp_name_history_norm_free_idx
  on public.jp_name_history (name_norm, free_at);

create index if not exists jp_name_history_user_idx
  on public.jp_name_history (user_id, vacated_at desc);

alter table public.jp_name_history enable row level security;
drop policy if exists "jp_name_history_select_own" on public.jp_name_history;
create policy "jp_name_history_select_own" on public.jp_name_history
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.jp_name_history from anon, public;
grant select on table public.jp_name_history to authenticated;

-- Active names unique case-insensitively (many guests may keep "Player")
create unique index if not exists jp_profiles_display_name_unique_ci
  on public.jp_profiles (lower(trim(display_name)))
  where lower(trim(display_name)) <> 'player'
    and trim(display_name) <> '';

create or replace function public.jp_normalize_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(trim(both from coalesce(p_name, '')));
$$;

create or replace function public.jp_name_is_available(p_name text, p_except_user uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  n text := public.jp_normalize_name(p_name);
begin
  if n = '' or n = 'player' then
    return true; -- default guest name always ok (not unique)
  end if;

  -- Taken by another active profile?
  if exists (
    select 1 from public.jp_profiles p
    where public.jp_normalize_name(p.display_name) = n
      and (p_except_user is null or p.id <> p_except_user)
  ) then
    return false;
  end if;

  -- Held in cooldown by another user (vacated recently)?
  if exists (
    select 1 from public.jp_name_history h
    where h.name_norm = n
      and h.free_at > now()
      and (p_except_user is null or h.user_id <> p_except_user)
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- Block direct REST/client renames; only RPC may change display_name
create or replace function public.jp_profiles_guard_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.display_name is distinct from old.display_name
     and current_setting('jp.allow_name_change', true) is distinct from 'on' then
    new.display_name := old.display_name;
  end if;
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_display_name on public.jp_profiles;
create trigger jp_profiles_guard_display_name
  before update on public.jp_profiles
  for each row execute function public.jp_profiles_guard_display_name();

-- Insert: if claimed unique name is taken, force "Player" (first rename via RPC)
create or replace function public.jp_profiles_guard_name_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
begin
  n := public.jp_normalize_name(new.display_name);
  if n = '' then
    new.display_name := 'Player';
    return new;
  end if;
  if n <> 'player' and not public.jp_name_is_available(new.display_name, new.id) then
    new.display_name := 'Player';
  end if;
  -- clamp length
  new.display_name := left(trim(new.display_name), 16);
  if new.display_name = '' then
    new.display_name := 'Player';
  end if;
  return new;
end;
$$;

drop trigger if exists jp_profiles_guard_name_insert on public.jp_profiles;
create trigger jp_profiles_guard_name_insert
  before insert on public.jp_profiles
  for each row execute function public.jp_profiles_guard_name_insert();

-- Authoritative rename RPC
create or replace function public.jp_set_display_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  raw text := trim(both from coalesce(p_name, ''));
  n text;
  old_name text;
  old_norm text;
  today date := (now() at time zone 'utc')::date;
  changes int;
  first_claim boolean;
  p public.jp_profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  if char_length(raw) < 1 or char_length(raw) > 16 then
    raise exception 'Name must be 1–16 characters';
  end if;

  -- Basic sanitization: no control chars
  if raw ~ '[[:cntrl:]]' then
    raise exception 'Name contains invalid characters';
  end if;

  n := public.jp_normalize_name(raw);
  if n = '' then raise exception 'Enter a name'; end if;

  select * into p from public.jp_profiles where id = uid for update;
  if p.id is null then raise exception 'Profile not found'; end if;

  old_name := p.display_name;
  old_norm := public.jp_normalize_name(old_name);

  -- No-op same name (case/space insensitive)
  if n = old_norm and trim(old_name) = raw then
    return jsonb_build_object(
      'ok', true,
      'display_name', p.display_name,
      'changed', false,
      'changes_today', coalesce(p.name_changes_count, 0),
      'changes_limit', 3
    );
  end if;

  -- Availability (active + vacated cooldown)
  if n <> 'player' and not public.jp_name_is_available(raw, uid) then
    raise exception 'That name is taken or temporarily reserved';
  end if;

  -- First real name from default "Player" does not count toward daily limit
  first_claim := (old_norm = 'player' and n <> 'player');

  if not first_claim then
    if p.name_changes_day is distinct from today then
      changes := 0;
    else
      changes := coalesce(p.name_changes_count, 0);
    end if;
    if changes >= 3 then
      raise exception 'Name change limit reached (3 per day, resets UTC midnight)';
    end if;
    changes := changes + 1;
  else
    if p.name_changes_day is distinct from today then
      changes := coalesce(p.name_changes_count, 0);
    else
      changes := coalesce(p.name_changes_count, 0);
    end if;
  end if;

  -- Vacate old unique name into history (7-day hold for others)
  if old_norm <> '' and old_norm <> 'player' and old_norm is distinct from n then
    insert into public.jp_name_history (user_id, name_norm, display_name, vacated_at, free_at)
    values (uid, old_norm, old_name, now(), now() + interval '7 days');
  end if;

  perform set_config('jp.allow_name_change', 'on', true);

  update public.jp_profiles
  set
    display_name = raw,
    name_changes_day = case when first_claim then name_changes_day else today end,
    name_changes_count = case
      when first_claim then coalesce(name_changes_count, 0)
      when name_changes_day is distinct from today then 1
      else changes
    end,
    updated_at = now()
  where id = uid
  returning * into p;

  return jsonb_build_object(
    'ok', true,
    'display_name', p.display_name,
    'changed', true,
    'first_claim', first_claim,
    'changes_today', case
      when first_claim then coalesce(p.name_changes_count, 0)
      else p.name_changes_count
    end,
    'changes_limit', 3,
    'previous_name', old_name
  );
end;
$$;

create or replace function public.jp_name_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  p public.jp_profiles;
  today date := (now() at time zone 'utc')::date;
  used int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.jp_profiles where id = uid;
  if p.id is null then
    return jsonb_build_object('display_name', 'Player', 'changes_today', 0, 'changes_limit', 3, 'remaining', 3);
  end if;
  if p.name_changes_day is distinct from today then
    used := 0;
  else
    used := coalesce(p.name_changes_count, 0);
  end if;
  return jsonb_build_object(
    'display_name', p.display_name,
    'changes_today', used,
    'changes_limit', 3,
    'remaining', greatest(3 - used, 0)
  );
end;
$$;

-- Check availability for UI (optional)
create or replace function public.jp_check_name_available(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  raw text := trim(both from coalesce(p_name, ''));
  n text := public.jp_normalize_name(raw);
  ok boolean;
begin
  if char_length(raw) < 1 or char_length(raw) > 16 then
    return jsonb_build_object('available', false, 'reason', 'length');
  end if;
  ok := public.jp_name_is_available(raw, uid);
  return jsonb_build_object(
    'available', ok,
    'name', raw,
    'reason', case when ok then null else 'taken_or_reserved' end
  );
end;
$$;

revoke all on function public.jp_normalize_name(text) from public, anon;
revoke all on function public.jp_name_is_available(text, uuid) from public, anon, authenticated;
revoke all on function public.jp_set_display_name(text) from public, anon;
revoke all on function public.jp_name_status() from public, anon;
revoke all on function public.jp_check_name_available(text) from public, anon;

grant execute on function public.jp_set_display_name(text) to authenticated;
grant execute on function public.jp_name_status() to authenticated;
grant execute on function public.jp_check_name_available(text) to authenticated;

-- Seed history empty; existing unique names keep working via unique index
