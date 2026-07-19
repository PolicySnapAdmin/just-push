-- Friend requests (accept required) + open PvP (duel anyone by code, not just friends)

-- ——— Friend requests ———
create table if not exists public.jp_friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.jp_profiles (id) on delete cascade,
  to_id uuid not null references public.jp_profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);

create unique index if not exists jp_friend_requests_pending_pair
  on public.jp_friend_requests (from_id, to_id)
  where status = 'pending';

create index if not exists jp_friend_requests_to_pending
  on public.jp_friend_requests (to_id, created_at desc)
  where status = 'pending';

create index if not exists jp_friend_requests_from_pending
  on public.jp_friend_requests (from_id, created_at desc)
  where status = 'pending';

alter table public.jp_friend_requests enable row level security;

drop policy if exists "jp_friend_requests_select_mine" on public.jp_friend_requests;
create policy "jp_friend_requests_select_mine" on public.jp_friend_requests
  for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Send friend request by friend code (replaces instant mutual add)
drop function if exists public.jp_add_friend_by_code(text);
create or replace function public.jp_add_friend_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other public.jp_profiles;
  req public.jp_friend_requests;
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

  -- Already friends?
  if exists (
    select 1 from public.jp_friendships f
    where f.user_id = me and f.friend_id = other.id
  ) and exists (
    select 1 from public.jp_friendships f
    where f.user_id = other.id and f.friend_id = me
  ) then
    raise exception 'Already friends with %', other.display_name;
  end if;

  -- They already sent you a request → auto-accept
  select * into req
  from public.jp_friend_requests r
  where r.from_id = other.id and r.to_id = me and r.status = 'pending'
  limit 1;

  if req.id is not null then
    update public.jp_friend_requests
    set status = 'accepted', responded_at = now()
    where id = req.id;

    insert into public.jp_friendships (user_id, friend_id)
    values (me, other.id)
    on conflict do nothing;
    insert into public.jp_friendships (user_id, friend_id)
    values (other.id, me)
    on conflict do nothing;

    return jsonb_build_object(
      'status', 'accepted',
      'display_name', other.display_name,
      'friend_code', other.friend_code,
      'id', other.id,
      'message', 'You are now friends'
    );
  end if;

  -- Already pending from us?
  if exists (
    select 1 from public.jp_friend_requests r
    where r.from_id = me and r.to_id = other.id and r.status = 'pending'
  ) then
    raise exception 'Friend request already sent to %', other.display_name;
  end if;

  insert into public.jp_friend_requests (from_id, to_id, status)
  values (me, other.id, 'pending')
  returning * into req;

  return jsonb_build_object(
    'status', 'pending',
    'display_name', other.display_name,
    'friend_code', other.friend_code,
    'id', other.id,
    'request_id', req.id,
    'message', 'Friend request sent — they must accept'
  );
end;
$$;

create or replace function public.jp_friend_request_respond(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.jp_friend_requests;
  other public.jp_profiles;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into req from public.jp_friend_requests where id = p_request_id for update;
  if req.id is null then raise exception 'Request not found'; end if;
  if req.to_id <> me then raise exception 'Only the recipient can respond'; end if;
  if req.status <> 'pending' then raise exception 'Request is no longer pending'; end if;

  select * into other from public.jp_profiles where id = req.from_id;

  if coalesce(p_accept, false) then
    update public.jp_friend_requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id;

    insert into public.jp_friendships (user_id, friend_id)
    values (me, req.from_id)
    on conflict do nothing;
    insert into public.jp_friendships (user_id, friend_id)
    values (req.from_id, me)
    on conflict do nothing;

    return jsonb_build_object(
      'status', 'accepted',
      'display_name', coalesce(other.display_name, 'Player'),
      'id', req.from_id
    );
  else
    update public.jp_friend_requests
    set status = 'declined', responded_at = now()
    where id = p_request_id;

    return jsonb_build_object(
      'status', 'declined',
      'display_name', coalesce(other.display_name, 'Player'),
      'id', req.from_id
    );
  end if;
end;
$$;

create or replace function public.jp_friend_request_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  update public.jp_friend_requests
  set status = 'cancelled', responded_at = now()
  where id = p_request_id
    and from_id = me
    and status = 'pending';
end;
$$;

create or replace function public.jp_friend_requests_inbox()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('incoming', '[]'::jsonb, 'outgoing', '[]'::jsonb); end if;

  return jsonb_build_object(
    'incoming', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
      from (
        select
          r.id,
          r.from_id,
          r.to_id,
          r.status,
          r.created_at,
          p.display_name,
          p.friend_code,
          p.lifetime_count,
          p.challenge_best,
          p.high_score
        from public.jp_friend_requests r
        join public.jp_profiles p on p.id = r.from_id
        where r.to_id = me and r.status = 'pending'
        order by r.created_at desc
        limit 40
      ) x
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
      from (
        select
          r.id,
          r.from_id,
          r.to_id,
          r.status,
          r.created_at,
          p.display_name,
          p.friend_code,
          p.lifetime_count,
          p.challenge_best,
          p.high_score
        from public.jp_friend_requests r
        join public.jp_profiles p on p.id = r.to_id
        where r.from_id = me and r.status = 'pending'
        order by r.created_at desc
        limit 40
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Cancel pending requests both ways when unfriending
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

  update public.jp_friend_requests
  set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and (
      (from_id = me and to_id = p_friend_id)
      or (from_id = p_friend_id and to_id = me)
    );
end;
$$;

-- ——— Open PvP: duel anyone by profile id or friend code ———
create or replace function public.jp_pvp_challenge(p_opponent_id uuid, p_duration integer default 10)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dur int := case when coalesce(p_duration, 10) = 25 then 25 else 10 end;
  row public.jp_pvp_matches;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent_id is null or p_opponent_id = uid then
    raise exception 'Pick someone to duel';
  end if;

  if not exists (select 1 from public.jp_profiles p where p.id = p_opponent_id) then
    raise exception 'Player not found';
  end if;

  -- Open match between the pair (friends or not)
  if exists (
    select 1 from public.jp_pvp_matches m
    where m.status in ('pending', 'accepted', 'running')
      and (
        (m.challenger_id = uid and m.opponent_id = p_opponent_id)
        or (m.challenger_id = p_opponent_id and m.opponent_id = uid)
      )
  ) then
    raise exception 'You already have an open duel with this player';
  end if;

  insert into public.jp_pvp_matches (challenger_id, opponent_id, duration_sec, status)
  values (uid, p_opponent_id, dur, 'pending')
  returning * into row;

  return row;
end;
$$;

create or replace function public.jp_pvp_challenge_by_code(p_code text, p_duration integer default 10)
returns public.jp_pvp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other public.jp_profiles;
  code text := upper(trim(coalesce(p_code, '')));
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if code = '' or char_length(code) < 4 then
    raise exception 'Enter a player code';
  end if;

  select * into other from public.jp_profiles where friend_code = code;
  if other.id is null then
    raise exception 'No player with that code';
  end if;
  if other.id = uid then
    raise exception 'That is your own code';
  end if;

  return public.jp_pvp_challenge(other.id, p_duration);
end;
$$;

revoke all on function public.jp_add_friend_by_code(text) from public;
revoke all on function public.jp_friend_request_respond(uuid, boolean) from public;
revoke all on function public.jp_friend_request_cancel(uuid) from public;
revoke all on function public.jp_friend_requests_inbox() from public;
revoke all on function public.jp_remove_friend(uuid) from public;
revoke all on function public.jp_pvp_challenge(uuid, integer) from public;
revoke all on function public.jp_pvp_challenge_by_code(text, integer) from public;

grant execute on function public.jp_add_friend_by_code(text) to authenticated;
grant execute on function public.jp_friend_request_respond(uuid, boolean) to authenticated;
grant execute on function public.jp_friend_request_cancel(uuid) to authenticated;
grant execute on function public.jp_friend_requests_inbox() to authenticated;
grant execute on function public.jp_remove_friend(uuid) to authenticated;
grant execute on function public.jp_pvp_challenge(uuid, integer) to authenticated;
grant execute on function public.jp_pvp_challenge_by_code(text, integer) to authenticated;
