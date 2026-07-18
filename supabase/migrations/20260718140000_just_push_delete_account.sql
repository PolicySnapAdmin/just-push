-- Push Thru — account self-deletion (App Store readiness)
-- Deletes the caller's auth user; jp_profiles and related rows cascade.

create or replace function public.jp_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Explicit cleanup first (safe if FKs already cascade)
  delete from public.jp_friend_messages
  where sender_id = uid or recipient_id = uid;

  delete from public.jp_board_posts
  where user_id = uid;

  delete from public.jp_friendships
  where user_id = uid or friend_id = uid;

  delete from public.jp_group_members
  where user_id = uid;

  -- Groups created solely by this user (members already removed above for them)
  delete from public.jp_groups
  where created_by = uid
    and not exists (
      select 1 from public.jp_group_members gm where gm.group_id = jp_groups.id
    );

  delete from public.jp_profiles
  where id = uid;

  delete from auth.users
  where id = uid;
end;
$$;

revoke all on function public.jp_delete_my_account() from public;
grant execute on function public.jp_delete_my_account() to authenticated;
