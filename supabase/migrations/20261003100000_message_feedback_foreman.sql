-- Thumbs on the foreman's replies. The foreman has no sessions row: its conversations live in
-- foreman_conversations, so a vote on one of them is keyed there, with agent_id and session_id null.

alter table public.message_feedback
    add column foreman_conversation_id uuid references public.foreman_conversations(id) on delete set null;

alter table public.message_feedback
    add constraint message_feedback_foreman_conversation_message_key unique (foreman_conversation_id, message_id);
