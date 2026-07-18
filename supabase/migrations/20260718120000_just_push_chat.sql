-- Just Push — community board + friend DMs
-- Safe on shared project (jp_* only). Run after 20260718000000_just_push.sql.

-- Community message board (all signed-in players can read & post)
create table if not exists public.jp_board_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.jp_profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists jp_board_posts_created_at_idx
  on public.jp_board_posts (created_at desc);

create index if not exists jp_board_posts_user_id_idx
  on public.jp_board_posts (user_id);

-- Private messages between friends only
create table if not exists public.jp_friend_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.jp_profiles (id) on delete cascade,
  recipient_id uuid not null references public.jp_profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists jp_friend_messages_thread_idx
  on public.jp_friend_messages (sender_id, recipient_id, created_at desc);

create index if not exists jp_friend_messages_inbox_idx
  on public.jp_friend_messages (recipient_id, created_at desc);

-- Helper: are these two users friends? (either direction row is enough;
-- app inserts mutual rows, so user→friend is the usual check)
create or replace function public.jp_are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jp_friendships f
    where f.user_id = a and f.friend_id = b
  );
$$;

revoke all on function public.jp_are_friends(uuid, uuid) from public;
grant execute on function public.jp_are_friends(uuid, uuid) to authenticated;

-- RLS
alter table public.jp_board_posts enable row level security;
alter table public.jp_friend_messages enable row level security;

-- Board: anyone authenticated can read
drop policy if exists "jp_board_posts_select" on public.jp_board_posts;
create policy "jp_board_posts_select" on public.jp_board_posts
  for select to authenticated using (true);

drop policy if exists "jp_board_posts_insert" on public.jp_board_posts;
create policy "jp_board_posts_insert" on public.jp_board_posts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "jp_board_posts_delete_own" on public.jp_board_posts;
create policy "jp_board_posts_delete_own" on public.jp_board_posts
  for delete to authenticated
  using (user_id = auth.uid());

-- DMs: only participants can read
drop policy if exists "jp_friend_messages_select" on public.jp_friend_messages;
create policy "jp_friend_messages_select" on public.jp_friend_messages
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- DMs: send only as yourself, only to a friend
drop policy if exists "jp_friend_messages_insert" on public.jp_friend_messages;
create policy "jp_friend_messages_insert" on public.jp_friend_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.jp_are_friends(auth.uid(), recipient_id)
  );

-- DMs: delete your own sent messages
drop policy if exists "jp_friend_messages_delete_own" on public.jp_friend_messages;
create policy "jp_friend_messages_delete_own" on public.jp_friend_messages
  for delete to authenticated
  using (sender_id = auth.uid());

-- Mark read (recipient only)
drop policy if exists "jp_friend_messages_update_read" on public.jp_friend_messages;
create policy "jp_friend_messages_update_read" on public.jp_friend_messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
