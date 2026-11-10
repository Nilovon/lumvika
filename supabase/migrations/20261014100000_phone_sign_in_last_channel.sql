-- The channel the last code to a number went by. Bird keeps one verification per number with its
-- plan of channels, so a code asked for on the other channel has to move that verification along
-- its plan rather than ask for a new one, and only waits a short while to do so.
alter table public.phone_sign_in_sends add column if not exists last_channel text check (last_channel in ('sms', 'whatsapp'));
