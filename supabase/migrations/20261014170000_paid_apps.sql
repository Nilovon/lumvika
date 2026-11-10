-- Paid apps: add-ons a workspace buys by the slot on its plan subscription, the way a Shopify store
-- installs an app. The first one is LinkedIn Pro, an account connected through Linkup that the
-- workspace's coworkers act with. Every row here follows the workspace: frozen while its box is
-- archived, uninstalled once the box is gone for good.

create table public.workspace_apps (
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    app_slug text not null,
    status text not null default 'active' check (status in ('active', 'frozen', 'uninstalled')),
    -- What the workspace may connect, held like max_agents: a decrease bought mid-period only lands
    -- when the period advances.
    slots integer not null default 0 check (slots >= 0),
    -- The subscriber's one free slot, kept off Stripe until the hourly sweep adds it. Settled once the
    -- sweep has tried, whether the charge went through or not: a declined card is not retried hourly.
    trial_ends_at timestamptz,
    trial_reminder_sent_at timestamptz,
    trial_settled_at timestamptz,
    frozen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, app_slug)
);

create table public.app_connections (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    app_slug text not null,
    -- Null until the provider answers the login: the row exists before the call, so the daily
    -- reconciliation can tell an account being connected from an orphan.
    provider_account_id text,
    -- The person behind the account, stable across reconnections. What the trial is claimed on.
    provider_member_id text,
    label text,
    -- Linkup signs each webhook with a secret of its own, handed over once when it is created.
    provider_webhook_id text,
    provider_webhook_secret text,
    connected_by uuid references public.users(id) on delete set null,
    status text not null default 'connecting' check (status in ('connecting', 'connected', 'needs_reconnect', 'paused', 'deleted')),
    paused_until timestamptz,
    pause_reason text,
    last_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index app_connections_provider_account_idx on public.app_connections (app_slug, provider_account_id) where provider_account_id is not null and status <> 'deleted';
create index app_connections_workspace_idx on public.app_connections (workspace_id, app_slug) where status <> 'deleted';

-- Which coworker acts with which account, and whether provider events wake it. One account per app
-- for a coworker. The trigger it is woken through is created on its engine by the hub, and its token
-- is what fires it.
create table public.app_connection_agents (
    agent_id uuid not null references public.agents(id) on delete cascade,
    app_slug text not null,
    connection_id uuid not null references public.app_connections(id) on delete cascade,
    wake_on_events text[] not null default '{}',
    trigger_slug text,
    trigger_token text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (agent_id, app_slug)
);

create index app_connection_agents_connection_idx on public.app_connection_agents (connection_id);

-- One free trial per workspace and per person behind the account, whichever comes first.
create table public.app_trial_claims (
    id uuid primary key default gen_random_uuid(),
    app_slug text not null,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    provider_member_id text not null,
    claimed_at timestamptz not null default now(),
    unique (app_slug, workspace_id),
    unique (app_slug, provider_member_id)
);

-- Counters behind the per-account quotas. `scope` is 'connection:<uuid>' or 'workspace:<id>';
-- `period` is a UTC day ('2026-10-14') or an ISO week ('2026-W42').
create table public.app_usage_counters (
    scope text not null,
    action text not null,
    period text not null,
    count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (scope, action, period)
);

-- Provider deliveries are at least once: the row is claimed before the handler runs and stamped
-- after it succeeds, like stripe_events.
create table public.app_webhook_events (
    event_id text primary key,
    app_slug text not null,
    received_at timestamptz not null default now(),
    processed_at timestamptz
);

alter table public.workspace_apps enable row level security;
alter table public.app_connections enable row level security;
alter table public.app_connection_agents enable row level security;
alter table public.app_trial_claims enable row level security;
alter table public.app_usage_counters enable row level security;
alter table public.app_webhook_events enable row level security;

revoke all on table public.workspace_apps from anon, authenticated;
revoke all on table public.app_connections from anon, authenticated;
revoke all on table public.app_connection_agents from anon, authenticated;
revoke all on table public.app_trial_claims from anon, authenticated;
revoke all on table public.app_usage_counters from anon, authenticated;
revoke all on table public.app_webhook_events from anon, authenticated;

grant select on table public.workspace_apps to authenticated;
-- The webhook secret authenticates Linkup's deliveries, so it stays server-side.
grant select (id, workspace_id, app_slug, provider_account_id, provider_member_id, label, connected_by, status, paused_until, pause_reason, last_event_at, created_at, updated_at) on table public.app_connections to authenticated;
-- The trigger token fires the coworker from the public webhook URL, so it stays server-side.
grant select (agent_id, app_slug, connection_id, wake_on_events, created_at, updated_at) on table public.app_connection_agents to authenticated;

create policy "workspace_apps_select_workspace_members"
    on public.workspace_apps
    for select
    to authenticated
    using (workspace_id in (select workspace_members.workspace_id from public.workspace_members where workspace_members.user_id = auth.uid()));

create policy "app_connections_select_workspace_members"
    on public.app_connections
    for select
    to authenticated
    using (workspace_id in (select workspace_members.workspace_id from public.workspace_members where workspace_members.user_id = auth.uid()));

create policy "app_connection_agents_select_workspace_members"
    on public.app_connection_agents
    for select
    to authenticated
    using (connection_id in (
        select app_connections.id from public.app_connections
        where app_connections.workspace_id in (select workspace_members.workspace_id from public.workspace_members where workspace_members.user_id = auth.uid())
    ));

-- Takes `p_amount` out of every (period, max) window of one action at once, or nothing at all:
-- an invitation counts against both its day and its week, and a refusal must not eat either.
-- Rows are locked in a fixed order so two calls on the same scope queue up instead of deadlocking.
create or replace function public.claim_app_quota(p_scope text, p_action text, p_periods text[], p_maxes integer[], p_amount integer default 1)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_index integer;
    v_count integer;
begin
    if p_amount <= 0 or coalesce(array_length(p_periods, 1), 0) = 0 or array_length(p_periods, 1) <> array_length(p_maxes, 1) then
        return false;
    end if;

    for v_index in 1 .. array_length(p_periods, 1) loop
        insert into public.app_usage_counters (scope, action, period) values (p_scope, p_action, p_periods[v_index]) on conflict do nothing;
    end loop;

    perform 1 from public.app_usage_counters
    where scope = p_scope and action = p_action and period = any (p_periods)
    order by period
    for update;

    for v_index in 1 .. array_length(p_periods, 1) loop
        select count into v_count from public.app_usage_counters where scope = p_scope and action = p_action and period = p_periods[v_index];
        if v_count + p_amount > p_maxes[v_index] then
            return false;
        end if;
    end loop;

    update public.app_usage_counters
    set count = count + p_amount, updated_at = now()
    where scope = p_scope and action = p_action and period = any (p_periods);
    return true;
end;
$$;

revoke execute on function public.claim_app_quota(text, text, text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.claim_app_quota(text, text, text[], integer[], integer) to service_role;

-- The catalogue row coworkers install LinkedIn Pro from. Disabled until the launch: enabling it is
-- what shows the app in every library, the chat's and the hub's included.
insert into public.services (slug, name, category, summary, enabled, icon, manifest)
values (
  'linkedin-pro',
  'LinkedIn Pro',
  'marketing',
  'Search, invite, message and comment on LinkedIn as you, and wake up when someone replies.',
  false,
  (select icon from public.services where slug = 'linkedin'),
  jsonb_build_object(
    'slug', 'linkedin-pro',
    'name', 'LinkedIn Pro',
    'category', 'marketing',
    'summary', 'Search, invite, message and comment on LinkedIn as you, and wake up when someone replies.',
    'description', 'Your coworker acts from a LinkedIn account connected to the workspace: it searches people, reads profiles, sends invitations and messages, follows the inbox, reacts and comments. A reply or an accepted invitation can wake it up. Daily limits keep the account clear of LinkedIn restrictions. Billed by the slot on your plan.',
    'authMethods', jsonb_build_array(
      jsonb_build_object(
        'id', 'app',
        'label', 'Pick a LinkedIn account',
        'kind', 'app',
        'recommended', true,
        'app', jsonb_build_object('appSlug', 'linkedin'),
        'inputs', '[]'::jsonb,
        'envKeys', '[]'::jsonb,
        'mcpServers', jsonb_build_array(jsonb_build_object(
          'name', 'linkedin_pro', 'transport', 'http', 'url', '${RERUN_HUB_BASE_URL}/api/mcp/apps/linkedin',
          'args', '[]'::jsonb, 'env', '{}'::jsonb,
          'headers', jsonb_build_object('x-rerun-key', '${RERUN_API_KEY}', 'x-rerun-agent', '${agent.id}')
        ))
      )
    ),
    'skills', jsonb_build_array(jsonb_build_object(
      'name', 'linkedin-pro-usage', 'description', 'How to act on LinkedIn as the user without getting the account restricted',
      'body', '# LinkedIn Pro' || E'\n\n' ||
        'You act from the user''s own LinkedIn account. Everything you send carries their name.' || E'\n\n' ||
        '- Before an invitation, check linkedin_pro_check_invitation so nobody is invited twice. Keep notes short and personal, never a sales pitch.' || E'\n' ||
        '- Before a message, read the conversation with linkedin_pro_get_conversation. Never send the same message twice, never follow up more than once without an answer.' || E'\n' ||
        '- Daily limits protect the account. When a tool says a limit is reached, stop that action for the day and tell the user.' || E'\n' ||
        '- For bulk lead lists or enrichment, use the paid data tools, not this account.' || E'\n' ||
        '- Publish a post only when the user asked for it or approved the text.'
    ))
  )
)
on conflict (slug) do nothing;
