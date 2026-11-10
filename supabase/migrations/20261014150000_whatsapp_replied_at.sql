-- The trial sequence stops for someone who answered one of its messages: from then on they are in a
-- conversation with a person in the Bird inbox, not in a sequence. Written by the Bird webhook on
-- whatsapp.received.
alter table public.user_phones add column if not exists whatsapp_replied_at timestamptz;
