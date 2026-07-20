-- Code+password accounts use synthetic emails: {CODE}@login.pushthrugames.com
-- Those can never open a confirmation link. If Supabase "Confirm email" is ON,
-- sign-up returns no session and sign-in fails with "Email not confirmed".
-- Auto-confirm only the synthetic login domain (real emails still follow dashboard settings).

create or replace function public.jp_auto_confirm_login_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and lower(new.email) like '%@login.pushthrugames.com' then
    if new.email_confirmed_at is null then
      new.email_confirmed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jp_auto_confirm_login_email on auth.users;
create trigger jp_auto_confirm_login_email
  before insert or update of email, email_confirmed_at on auth.users
  for each row
  execute function public.jp_auto_confirm_login_email();

-- Unstick accounts already created while Confirm email was required
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email is not null
  and lower(email) like '%@login.pushthrugames.com'
  and email_confirmed_at is null;
