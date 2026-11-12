-- A Stop pressed on the first message of a new assistant chat comes before the engine named its
-- conversation, so there was nothing to stop yet and the run went on. The hub now keeps when Stop was
-- last asked for on the chat: the turn that names the conversation stops its run if Stop came after
-- the turn began, and a Stop that comes later finds the conversation on the row.
alter table public.assistant_chats add column if not exists stop_requested_at timestamptz;
