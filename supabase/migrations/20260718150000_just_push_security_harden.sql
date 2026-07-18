-- Push Thru — security harden: DMs can only flip read_at (not body/sender)

-- Recipients previously could PATCH any column on messages they received
-- (including body). Restrict updates so only read_at may change.

create or replace function public.jp_friend_messages_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the recipient may update; enforce even if policies change later
  if auth.uid() is null or auth.uid() <> old.recipient_id then
    raise exception 'Not allowed to update this message';
  end if;

  -- Immutable fields
  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Only read_at may be updated on friend messages';
  end if;

  return new;
end;
$$;

drop trigger if exists jp_friend_messages_guard_update on public.jp_friend_messages;
create trigger jp_friend_messages_guard_update
  before update on public.jp_friend_messages
  for each row execute function public.jp_friend_messages_guard_update();

-- Optional: revoke table privileges from anon explicitly (RLS already empty for anon)
revoke all on table public.jp_profiles from anon;
revoke all on table public.jp_friendships from anon;
revoke all on table public.jp_groups from anon;
revoke all on table public.jp_group_members from anon;
revoke all on table public.jp_board_posts from anon;
revoke all on table public.jp_friend_messages from anon;

grant select, insert, update, delete on table public.jp_profiles to authenticated;
grant select, insert, delete on table public.jp_friendships to authenticated;
grant select, insert, delete on table public.jp_groups to authenticated;
grant select, insert, delete on table public.jp_group_members to authenticated;
grant select, insert, delete on table public.jp_board_posts to authenticated;
grant select, insert, update, delete on table public.jp_friend_messages to authenticated;
