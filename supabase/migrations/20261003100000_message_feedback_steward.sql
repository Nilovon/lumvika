-- Thumbs on the steward's replies. The steward has no sessions row: its conversations live in
-- steward_conversations, so a vote on one of them is keyed there, with agent_id and session_id null.

alter table public.message_feedback
    add column steward_conversation_id uuid references public.steward_conversations(id) on delete set null;

alter table public.message_feedback
    add constraint message_feedback_steward_conversation_message_key unique (steward_conversation_id, message_id);
