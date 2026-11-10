-- A foreman conversation now runs either on the hub, as before, or on the workspace's engine. The
-- backend is fixed when the conversation starts: a conversation never changes loop halfway, since
-- neither side has seen the other's transcript.
--
-- An engine conversation keeps no messages here, the engine holds them under `engine_session_id`.
-- The row is what lists it for its user, since engine sessions know nothing of who wrote them.

alter table public.foreman_conversations
    add column backend text not null default 'hub' check (backend in ('hub', 'engine')),
    add column engine_session_id text;
