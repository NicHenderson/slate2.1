-- Deleting your own account: Settings → Delete account calls
-- delete_my_account() (js/deleteAccount.js).
--
-- Accounts live in auth.users, which the app can't touch from the browser.
-- This function runs with its owner's rights (security definer) but can only
-- ever delete the account of whoever calls it: auth.uid(), the signed-in
-- user. Everything of theirs goes with it — movies, shows and collections
-- (ON DELETE CASCADE since 0004, collection items following their
-- collection), settings (0001), profile (0002), and their sessions (Auth's
-- own tables cascade from auth.users).
--
-- The app asks for the password again before calling it; the function
-- itself only needs a valid session.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = '' -- nothing resolved through a schema the caller could shadow
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

-- Functions are callable by everyone by default: signed-in users only.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
