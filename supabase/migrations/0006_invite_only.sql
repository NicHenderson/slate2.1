-- Invite-only. Nobody signs themselves up any more (Authentication → Sign
-- In / Providers → "Allow new users to sign up" is off): accounts are made
-- by hand in Authentication → Users → Add user, with a temporary password
-- sent to the new member. At their first login Slate asks for a password
-- of their own (js/auth.js) and, once it's saved, sets password_chosen in
-- their user metadata.
--
-- This marks every account that exists today as already having its own
-- password, so none of them is asked. Run it once, before making the first
-- account by hand: anyone made before it runs would be marked too, and
-- never asked to replace their temporary password.

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"password_chosen": true}'::jsonb;
