-- The creator program: a public application on the landing, reviewed in the admin, and on
-- acceptance an emailed link that turns the applicant into an expert account with a sandbox.
--
-- All of it hangs off the existing `experts` row rather than a table of its own: the fiche is
-- already what the marketplace, the claim link and `users.expert_profile_id` point at.

-- Where the fiche came from. `import` is the default because every row that predates this
-- migration was either scraped from LinkedIn/X or hand-seeded, and only `application` gates
-- anything (an applicant must never receive the cold outreach invite).
create type public.expert_source as enum ('seed', 'import', 'application');

-- Null means "not an application", which is what keeps expert accounts flagged by hand before
-- this flow existed out of the terms wall.
create type public.expert_application_status as enum ('pending', 'accepted', 'rejected');

alter table public.experts
    add column source public.expert_source not null default 'import',
    add column application_status public.expert_application_status,
    add column application_reviewed_at timestamptz,
    add column application_reviewed_by uuid references public.users(id) on delete set null,
    add column application_note text,
    -- Minted on acceptance, not at insert: an unreviewed fiche never carries a usable link.
    add column creator_token text unique,
    add column creator_invited_at timestamptz,
    add column creator_joined_at timestamptz,
    -- Signed or not. No version, no per-item trace: when the terms change, creators get notified.
    -- It lives here and not on `users` because a user can UPDATE their own `users` row through
    -- RLS, which would make the acceptance self-signable from PostgREST.
    add column creator_terms_accepted_at timestamptz;

create index experts_application_status_idx on public.experts (application_status)
    where application_status is not null;

-- No grant on any of these columns: `experts` is granted column by column to anon, so a new
-- column is private by default. `creator_token` in particular is a capability.
