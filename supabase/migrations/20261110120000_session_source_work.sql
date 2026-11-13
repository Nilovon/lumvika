-- A conversation can now start from an issue (an agent working on it) or from a channel (an agent
-- answering a mention). Alone in its own file: a value added to an enum cannot be used in the
-- transaction that adds it. Safe to push before any code that writes the new values.
alter type public.session_source add value if not exists 'issue';
alter type public.session_source add value if not exists 'channel';
