-- Push Thru — namespaced tables (jp_*)

-- Profiles (1:1 with auth.users)
create table if not exists public.jp_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 16),
  friend_code text not null unique,
  high_score integer not null default 0 check (high_score >= 0),
  challenge_best integer not null default 0 check (challenge_best >= 0),
  lifetime_count bigint not null default 0 check (lifetime_count >= 0),
  sessions_played integer not null default 0 check (sessions_played >= 0),
  theme_button text not null default 'rose',
  theme_bg text not null default 'midnight',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jp_profiles_friend_code_idx on public.jp_profiles (friend_code);
create index if not exists jp_profiles_high_score_idx on public.jp_profiles (high_score desc);
create index if not exists jp_profiles_challenge_best_idx on public.jp_profiles (challenge_best desc);

-- Friendships (directed: user_id → friend_id). App inserts both directions for mutual lists.
create table if not exists public.jp_friendships (
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  friend_id uuid not null references public.jp_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists jp_friendships_friend_id_idx on public.jp_friendships (friend_id);

-- Groups
create table if not exists public.jp_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  invite_code text not null unique,
  created_by uuid not null references public.jp_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists jp_groups_invite_code_idx on public.jp_groups (invite_code);

create table if not exists public.jp_group_members (
  group_id uuid not null references public.jp_groups (id) on delete cascade,
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists jp_group_members_user_id_idx on public.jp_group_members (user_id);

-- Auto-create profile on signup (anonymous or OAuth)
create or replace function public.jp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  tries int := 0;
begin
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.jp_profiles (id, display_name, friend_code)
      values (
        new.id,
        coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Player'),
        code
      );
      exit;
    exception
      when unique_violation then
        tries := tries + 1;
        if tries > 8 then
          raise;
        end if;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_jp on auth.users;
create trigger on_auth_user_created_jp
  after insert on auth.users
  for each row execute function public.jp_handle_new_user();

-- updated_at helper
create or replace function public.jp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jp_profiles_updated_at on public.jp_profiles;
create trigger jp_profiles_updated_at
  before update on public.jp_profiles
  for each row execute function public.jp_set_updated_at();

-- RLS
alter table public.jp_profiles enable row level security;
alter table public.jp_friendships enable row level security;
alter table public.jp_groups enable row level security;
alter table public.jp_group_members enable row level security;

-- Profiles: authenticated read (leaderboards / friend lookup); own row write
drop policy if exists "jp_profiles_select" on public.jp_profiles;
create policy "jp_profiles_select" on public.jp_profiles
  for select to authenticated using (true);

drop policy if exists "jp_profiles_update_own" on public.jp_profiles;
create policy "jp_profiles_update_own" on public.jp_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "jp_profiles_insert_own" on public.jp_profiles;
create policy "jp_profiles_insert_own" on public.jp_profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Friendships
drop policy if exists "jp_friendships_select" on public.jp_friendships;
create policy "jp_friendships_select" on public.jp_friendships
  for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "jp_friendships_insert" on public.jp_friendships;
create policy "jp_friendships_insert" on public.jp_friendships
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "jp_friendships_delete" on public.jp_friendships;
create policy "jp_friendships_delete" on public.jp_friendships
  for delete to authenticated
  using (user_id = auth.uid());

-- Groups: readable by all authenticated (join by code); create own; no random updates
drop policy if exists "jp_groups_select" on public.jp_groups;
create policy "jp_groups_select" on public.jp_groups
  for select to authenticated using (true);

drop policy if exists "jp_groups_insert" on public.jp_groups;
create policy "jp_groups_insert" on public.jp_groups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "jp_groups_delete" on public.jp_groups;
create policy "jp_groups_delete" on public.jp_groups
  for delete to authenticated
  using (created_by = auth.uid());

-- Group members
drop policy if exists "jp_group_members_select" on public.jp_group_members;
create policy "jp_group_members_select" on public.jp_group_members
  for select to authenticated
  using (
    exists (
      select 1 from public.jp_group_members gm
      where gm.group_id = jp_group_members.group_id
        and gm.user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- Allow reading members of a group you're joining: broaden select for authenticated
drop policy if exists "jp_group_members_select" on public.jp_group_members;
create policy "jp_group_members_select" on public.jp_group_members
  for select to authenticated using (true);

drop policy if exists "jp_group_members_insert" on public.jp_group_members;
create policy "jp_group_members_insert" on public.jp_group_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "jp_group_members_delete" on public.jp_group_members;
create policy "jp_group_members_delete" on public.jp_group_members
  for delete to authenticated
  using (user_id = auth.uid());

-- Mutual friend helper (RLS only allows insert where user_id = auth.uid())
create or replace function public.jp_add_friend_by_code(p_code text)
returns public.jp_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other public.jp_profiles;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select * into other
  from public.jp_profiles
  where friend_code = upper(trim(p_code));

  if other.id is null then
    raise exception 'No player with that code';
  end if;

  if other.id = me then
    raise exception 'That is your own code';
  end if;

  insert into public.jp_friendships (user_id, friend_id)
  values (me, other.id)
  on conflict do nothing;

  insert into public.jp_friendships (user_id, friend_id)
  values (other.id, me)
  on conflict do nothing;

  return other;
end;
$$;

revoke all on function public.jp_add_friend_by_code(text) from public;
grant execute on function public.jp_add_friend_by_code(text) to authenticated;

create or replace function public.jp_remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.jp_friendships
  where (user_id = me and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = me);
end;
$$;

revoke all on function public.jp_remove_friend(uuid) from public;
grant execute on function public.jp_remove_friend(uuid) to authenticated;

-- Realtime (optional — enable in dashboard if desired)
-- alter publication supabase_realtime add table public.jp_profiles;
