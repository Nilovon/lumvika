-- Connectors that can do the job of another one, to offer a way out when a user connects a service.
-- Computed by apps/ui/scripts/service-alternatives.ts with TypeSafe's Jev: `probability` is Jev's
-- probability that `alternative_slug` is a direct replacement for `service_slug`. The relation is
-- directed on purpose: Brevo replaces Mailchimp's transactional connector, not the reverse.
create table public.service_alternatives (
  service_slug text not null references public.services (slug) on update cascade on delete cascade,
  alternative_slug text not null references public.services (slug) on update cascade on delete cascade,
  probability real not null check (probability between 0 and 1),
  confidence real not null check (confidence between 0 and 1),
  model text not null,
  created_at timestamptz not null default now(),
  primary key (service_slug, alternative_slug),
  check (service_slug <> alternative_slug)
);

create index service_alternatives_alternative_slug_idx on public.service_alternatives (alternative_slug);

alter table public.service_alternatives enable row level security;

-- Supabase grants everything on a new public table to anon and authenticated, truncate included,
-- which RLS does not cover. Cf. 20260907143000_revoke_agent_shares_defaults.sql.
revoke all on table public.service_alternatives from anon, authenticated;
grant select on table public.service_alternatives to anon, authenticated;

create policy "public read service alternatives"
  on public.service_alternatives
  as permissive
  for select
  to anon, authenticated
using (true);
