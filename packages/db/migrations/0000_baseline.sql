-- Lumvika's schema as it stood on 2026-11-09, squashed from the Supabase migrations, with the pieces
-- Supabase provided rebuilt here: the `anon` and `authenticated` roles the policies are written for,
-- an `auth` schema holding Better Auth's tables, and `auth.uid()` reading the user a transaction
-- runs for (see packages/db/src/scope.ts).

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
END
$$;
--> statement-breakpoint
-- The login role switches to these per transaction; the two never own a table, so every policy applies.
GRANT anon, authenticated TO CURRENT_USER;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('lumvika.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE TABLE auth.users (
    id uuid PRIMARY KEY NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    is_anonymous boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_email_unique UNIQUE (email)
);
--> statement-breakpoint
CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL,
    CONSTRAINT sessions_token_unique UNIQUE (token)
);
--> statement-breakpoint
ALTER TABLE auth.sessions ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);
--> statement-breakpoint
CREATE TABLE auth.accounts (
    id uuid PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE auth.accounts ADD CONSTRAINT accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX accounts_user_id_idx ON auth.accounts USING btree (user_id);
--> statement-breakpoint
CREATE TABLE auth.verifications (
    id uuid PRIMARY KEY NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX verifications_identifier_idx ON auth.verifications USING btree (identifier);
--> statement-breakpoint
CREATE TABLE auth.rate_limits (
    id text PRIMARY KEY NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL,
    CONSTRAINT rate_limits_key_unique UNIQUE (key)
);
--> statement-breakpoint
SET check_function_bodies = false;
--
-- PostgreSQL database dump
--

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

--
-- Name: account_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_role AS ENUM (
    'member',
    'expert'
);

--
-- Name: agent_service_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_service_status AS ENUM (
    'active',
    'needs_config',
    'error'
);

--
-- Name: agent_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_status AS ENUM (
    'idle',
    'working',
    'error',
    'waiting_human',
    'offline'
);

--
-- Name: cloud_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cloud_provider AS ENUM (
    'incus'
);

--
-- Name: engine_pool_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.engine_pool_status AS ENUM (
    'provisioning',
    'available',
    'claimed',
    'error',
    'updating'
);

--
-- Name: engine_update_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.engine_update_status AS ENUM (
    'success',
    'error',
    'deferred',
    'abandoned'
);

--
-- Name: expert_application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expert_application_status AS ENUM (
    'pending',
    'accepted',
    'rejected'
);

--
-- Name: expert_availability; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expert_availability AS ENUM (
    'available',
    'soon',
    'unavailable'
);

--
-- Name: expert_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expert_source AS ENUM (
    'seed',
    'import',
    'application'
);

--
-- Name: expert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expert_status AS ENUM (
    'draft',
    'invited',
    'published',
    'declined'
);

--
-- Name: expert_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expert_type AS ENUM (
    'studio',
    'freelancer',
    'expert'
);

--
-- Name: lifecycle_email_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lifecycle_email_status AS ENUM (
    'sent',
    'failed'
);

--
-- Name: newsletter_recipient_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.newsletter_recipient_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'skipped'
);

--
-- Name: newsletter_send_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.newsletter_send_status AS ENUM (
    'queued',
    'sending',
    'sent',
    'failed',
    'canceled'
);

--
-- Name: notification_email_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_email_status AS ENUM (
    'sent',
    'suppressed',
    'digested',
    'skipped'
);

--
-- Name: notification_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_kind AS ENUM (
    'info',
    'question',
    'approval',
    'done',
    'error',
    'connector'
);

--
-- Name: session_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_kind AS ENUM (
    'general',
    'thread'
);

--
-- Name: session_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_outcome AS ENUM (
    'done',
    'nothing',
    'failed'
);

--
-- Name: session_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_source AS ENUM (
    'dashboard',
    'builder',
    'schedule',
    'agent',
    'delegate',
    'api',
    'trigger'
);

--
-- Name: session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_status AS ENUM (
    'idle',
    'working',
    'error',
    'waiting_human',
    'awaiting_question',
    'awaiting_approval',
    'awaiting_connector',
    'awaiting_ack'
);

--
-- Name: template_pricing_model; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.template_pricing_model AS ENUM (
    'free',
    'one_time',
    'recurring'
);

--
-- Name: template_purchase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.template_purchase_status AS ENUM (
    'pending',
    'active',
    'past_due',
    'canceled',
    'refunded'
);

--
-- Name: template_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.template_status AS ENUM (
    'draft',
    'in_review',
    'published',
    'unlisted',
    'archived'
);

--
-- Name: workspace_archive_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_archive_reason AS ENUM (
    'access_ended',
    'inactivity',
    'manual'
);

--
-- Name: workspace_archive_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_archive_status AS ENUM (
    'archiving',
    'archived',
    'restoring',
    'restored',
    'failed'
);

--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'admin',
    'member'
);

--
-- Name: claim_app_quota(text, text, text[], integer[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_app_quota(p_scope text, p_action text, p_periods text[], p_maxes integer[], p_amount integer DEFAULT 1) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

--
-- Name: claim_email_sign_up(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_email_sign_up(p_ip text, p_ip_max integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_scope text := 'ip:' || p_ip;
    v_count integer;
begin
    delete from public.email_sign_up_limits where window_started_at < now() - make_interval(secs => p_window_seconds);

    insert into public.email_sign_up_limits (scope) values (v_scope) on conflict (scope) do nothing;
    select sign_up_count into v_count from public.email_sign_up_limits where scope = v_scope for update;

    if v_count >= p_ip_max then
        return false;
    end if;

    update public.email_sign_up_limits set sign_up_count = sign_up_count + 1 where scope = v_scope;
    return true;
end;
$$;

--
-- Name: claim_published_gate_attempt(text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_published_gate_attempt(p_scopes text[], p_max integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
    v_scope text;
    v_count integer;
    v_allowed boolean := true;
begin
    delete from public.published_gate_attempts where window_started_at < v_cutoff;

    foreach v_scope in array p_scopes loop
        insert into public.published_gate_attempts (scope) values (v_scope) on conflict (scope) do nothing;
        update public.published_gate_attempts set attempt_count = attempt_count + 1 where scope = v_scope returning attempt_count into v_count;
        if v_count > p_max then
            v_allowed := false;
        end if;
    end loop;

    return v_allowed;
end;
$$;

--
-- Name: consume_lumvika_credit(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_lumvika_credit(p_workspace_id bigint, p_micros bigint) RETURNS void
    LANGUAGE sql
    AS $$
    update workspaces set
        lumvika_used_micros = lumvika_used_micros + p_micros,
        lumvika_topup_micros = greatest(
            lumvika_topup_micros - greatest(p_micros - greatest(lumvika_budget_micros - lumvika_used_micros, 0), 0), 0)
    where id = p_workspace_id;
$$;

--
-- Name: current_admin_workspace_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_admin_workspace_ids() RETURNS SETOF bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select workspace_id from public.workspace_members where user_id = auth.uid() and role = 'admin'
$$;

--
-- Name: current_workspace_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_workspace_ids() RETURNS SETOF bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select workspace_id from public.workspace_members where user_id = auth.uid()
$$;

--
-- Name: email_domain_is_blocked(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_domain_is_blocked(p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists (
        select 1 from public.blocked_email_domains b
        where split_part(lower(trim(p_email)), '@', 2) <> ''
          and (
              lower(b.domain) = split_part(lower(trim(p_email)), '@', 2)
              or split_part(lower(trim(p_email)), '@', 2) like '%.' || lower(b.domain)
          )
    );
$$;

--
-- Name: engine_box_metric_series(uuid, timestamp with time zone, interval, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engine_box_metric_series(p_host_id uuid, p_from timestamp with time zone, p_bucket interval, p_top integer) RETURNS TABLE(box_name text, points jsonb)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    with window_rows as (
        select * from public.engine_box_metrics m
        where m.host_id = p_host_id and m.sampled_at >= p_from and m.running
    ),
    top_rss as (
        select w.box_name from window_rows w group by w.box_name order by avg(w.rss_mb) desc nulls last limit p_top
    ),
    top_cpu as (
        select w.box_name from window_rows w group by w.box_name order by avg(w.cpu_cores) desc nulls last limit p_top
    ),
    buckets as (
        select
            w.box_name,
            date_bin(p_bucket, w.sampled_at, timestamptz '2000-01-01') as t,
            avg(w.rss_mb) as rss_mb,
            avg(w.cpu_cores) as cpu_cores,
            max(w.cpu_cores) as cpu_cores_max,
            max(w.active_runs) as active_runs
        from window_rows w
        where w.box_name in (select top_rss.box_name from top_rss union select top_cpu.box_name from top_cpu)
        group by w.box_name, t
    )
    select
        b.box_name,
        jsonb_agg(
            jsonb_build_object(
                't', b.t,
                'rssMb', round(b.rss_mb),
                'cpuCores', round(b.cpu_cores::numeric, 3),
                'cpuCoresMax', round(b.cpu_cores_max::numeric, 3),
                'activeRuns', b.active_runs
            )
            order by b.t
        )
    from buckets b
    group by b.box_name
$$;

--
-- Name: engine_host_metric_series(timestamp with time zone, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engine_host_metric_series(p_from timestamp with time zone, p_bucket interval) RETURNS TABLE(host_id uuid, points jsonb)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    with buckets as (
        select
            m.host_id,
            date_bin(p_bucket, m.sampled_at, timestamptz '2000-01-01') as t,
            avg(m.cpu_pct) as cpu_pct,
            max(m.cpu_pct) as cpu_pct_max,
            avg(m.load1) as load1,
            max(m.load1) as load1_max,
            max(m.cores) as cores,
            max(m.mem_total_mb) as mem_total_mb,
            avg(m.mem_total_mb - m.mem_available_mb) as mem_used_mb,
            avg(m.arc_mb) as arc_mb,
            avg(m.swap_used_mb) as swap_used_mb,
            avg(m.psi_cpu) as psi_cpu,
            avg(m.psi_mem) as psi_mem,
            avg(m.psi_io) as psi_io,
            avg(100 * m.disk_used_gb / nullif(m.disk_total_gb, 0)) as disk_used_pct,
            avg(m.net_rx_bps) as net_rx_bps,
            avg(m.net_tx_bps) as net_tx_bps,
            avg(m.boxes_running) as boxes_running,
            max(m.active_runs) as active_runs
        from public.engine_host_metrics m
        where m.sampled_at >= p_from
        group by m.host_id, t
    )
    select
        b.host_id,
        jsonb_agg(
            jsonb_build_object(
                't', b.t,
                'cpuPct', round(b.cpu_pct::numeric, 1),
                'cpuPctMax', round(b.cpu_pct_max::numeric, 1),
                'load1', round(b.load1::numeric, 2),
                'load1Max', round(b.load1_max::numeric, 2),
                'cores', b.cores,
                'memTotalMb', b.mem_total_mb,
                'memUsedMb', round(b.mem_used_mb),
                'arcMb', round(b.arc_mb),
                'swapUsedMb', round(b.swap_used_mb),
                'psiCpu', round(b.psi_cpu::numeric, 2),
                'psiMem', round(b.psi_mem::numeric, 2),
                'psiIo', round(b.psi_io::numeric, 2),
                'diskUsedPct', round(b.disk_used_pct::numeric, 1),
                'netRxBps', round(b.net_rx_bps),
                'netTxBps', round(b.net_tx_bps),
                'boxesRunning', round(b.boxes_running::numeric, 1),
                'activeRuns', b.active_runs
            )
            order by b.t
        )
    from buckets b
    group by b.host_id
$$;

--
-- Name: getting_started_on_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.getting_started_on_agent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    perform public.mark_getting_started(new.workspace_id, 'first_agent');
    return null;
end
$$;

--
-- Name: getting_started_on_invitation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.getting_started_on_invitation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    perform public.mark_getting_started(new.workspace_id, 'invite');
    return null;
end
$$;

--
-- Name: getting_started_on_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.getting_started_on_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if (select count(*) from public.workspace_members where workspace_id = new.workspace_id) > 1 then
        perform public.mark_getting_started(new.workspace_id, 'invite');
    end if;
    return null;
end
$$;

--
-- Name: grant_lumvika_topup(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_lumvika_topup(p_workspace_id bigint, p_micros bigint) RETURNS void
    LANGUAGE sql
    AS $$
    update workspaces set lumvika_topup_micros = lumvika_topup_micros + p_micros where id = p_workspace_id;
$$;

--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--
-- Name: lumvika_credit_usage(bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lumvika_credit_usage(p_workspace_id bigint, p_since timestamp with time zone) RETURNS TABLE(day date, kind text, source text, engine_agent_id text, micros bigint, calls bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    select
        (u.created_at at time zone 'UTC')::date as day,
        'ai' as kind,
        coalesce(u.tier, 'balanced') as source,
        u.engine_agent_id,
        sum(u.cost_micros)::bigint as micros,
        count(*) as calls
    from public.lumvika_usage_events u
    where u.workspace_id = p_workspace_id and u.created_at >= p_since and u.billed
    group by 1, 3, 4
    union all
    select
        (p.created_at at time zone 'UTC')::date as day,
        'data' as kind,
        regexp_replace(p.capability, '^treg\.', '') as source,
        p.engine_agent_id,
        sum(p.billed_micros)::bigint as micros,
        count(*) as calls
    from public.paid_data_events p
    where p.workspace_id = p_workspace_id and p.created_at >= p_since and p.billed_micros > 0
    group by 1, 3, 4
$$;

--
-- Name: manageable_agent_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manageable_agent_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select a.id from public.agents a where a.space_id in (select public.manageable_space_ids())
$$;

--
-- Name: manageable_space_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manageable_space_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select s.id from public.spaces s
    where s.workspace_id in (select public.current_admin_workspace_ids())
    union
    select m.space_id from public.space_members m where m.user_id = auth.uid() and m.access = 'manage'
$$;

--
-- Name: mark_getting_started(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_getting_started(p_workspace_id bigint, p_item text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    insert into public.workspace_getting_started (workspace_id, item)
    values (p_workspace_id, p_item)
    on conflict do nothing
$$;

--
-- Name: match_services(public.vector, integer, double precision, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_services(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.0, filter_category text DEFAULT NULL::text) RETURNS TABLE(slug text, name text, category text, summary text, icon text, manifest jsonb, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    select s.slug, s.name, s.category, s.summary, s.icon, s.manifest,
           1 - (s.embedding <=> query_embedding) as similarity
    from public.services s
    where s.enabled
      and s.embedding is not null
      and (filter_category is null or s.category = filter_category)
      and 1 - (s.embedding <=> query_embedding) >= match_threshold
    order by s.embedding <=> query_embedding
    limit match_count;
$$;

--
-- Name: open_notification_incident(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_notification_incident(p_user_id uuid, p_source_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    with opened as (
        insert into public.notification_incidents (user_id, source_key)
        values (p_user_id, p_source_key)
        on conflict (user_id, source_key) do update
            set opened_at = now(), resolved_at = null
            where notification_incidents.resolved_at is not null
        returning 1
    )
    select exists (select 1 from opened);
$$;

--
-- Name: prevent_user_workspace_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_user_workspace_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
    if new.workspace_id is distinct from old.workspace_id
       and current_user in ('authenticated', 'anon') then
        raise exception 'workspace_id is immutable';
    end if;
    return new;
end;
$$;

--
-- Name: resolve_notification_incidents(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_notification_incidents(p_source_key text) RETURNS SETOF uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    update public.notification_incidents
    set resolved_at = now()
    where source_key = p_source_key and resolved_at is null
    returning user_id;
$$;

--
-- Name: session_reads_stamp_seen_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_reads_stamp_seen_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.seen_at := now();
    return new;
end $$;

--
-- Name: touch_sandbox_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_sandbox_activity(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    update public.workspaces w
    set last_active_at = now()
    from public.users u
    where u.id = p_user_id
      and w.id = u.workspace_id
      and w.is_sandbox
      and (w.last_active_at is null or w.last_active_at < now() - interval '1 hour');
$$;

--
-- Name: unseen_runs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unseen_runs(p_workspace_id integer) RETURNS TABLE(session_id uuid, agent_id uuid, title text, source public.session_source, slug text, message text, last_at timestamp with time zone, run_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
            select
                s.id,
                s.agent_id,
                s.title,
                s.source,
                (array_agg(coalesce(n.metadata ->> 'scheduleSlug', n.metadata ->> 'triggerSlug') order by n.created_at desc))[1],
                (array_agg(n.message order by n.created_at desc))[1],
                max(n.created_at),
                count(*)::integer
            from public.notifications n
            join public.sessions s on s.agent_id = n.agent_id and s.engine_session_id = n.engine_session_id
            left join public.session_reads r on r.session_id = s.id and r.user_id = auth.uid()
            where n.workspace_id = p_workspace_id
              and n.kind = 'done'
              and n.recipients ? auth.uid()::text
              and n.created_at > coalesce(r.seen_at, '2026-11-10 17:15:58.835553+00'::timestamptz)
            group by s.id
            order by max(n.created_at) desc
            limit 500
        $$;

--
-- Name: update_agent_status_from_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_status_from_sessions() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  update agents set status = (
    case
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'working') then 'working'
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'error') then 'error'
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'waiting_human') then 'waiting_human'
      else 'idle'
    end
  )::agent_status where id = new.agent_id;
  return new;
end;
$$;

--
-- Name: visible_agent_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visible_agent_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select a.id from public.agents a where a.space_id in (select public.visible_space_ids())
$$;

--
-- Name: visible_space_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visible_space_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select s.id
    from public.spaces s
    join public.workspace_members wm on wm.workspace_id = s.workspace_id and wm.user_id = auth.uid()
    where wm.role = 'admin'
       or exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = auth.uid())
       or (wm.box_scope = 'all' and s.visibility = 'workspace')
$$;

--
-- Name: agent_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    workspace_id bigint NOT NULL,
    created_by uuid,
    source_agent_id uuid,
    source_agent_name text NOT NULL,
    preview jsonb NOT NULL,
    archive_path text NOT NULL,
    archive_bytes bigint NOT NULL,
    engine_commit text,
    include_memories boolean DEFAULT false NOT NULL,
    include_database boolean DEFAULT false NOT NULL,
    include_files boolean DEFAULT true NOT NULL,
    install_count integer DEFAULT 0 NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: COLUMN agent_shares.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_shares.token IS 'Capability: whoever holds it can install the agent. Never expose it in a grant or a policy.';

--
-- Name: COLUMN agent_shares.preview; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_shares.preview IS 'Frozen public card. Redacted by construction: projected from the archive plan, never from the agent folder.';

--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    status public.agent_status DEFAULT 'idle'::public.agent_status NOT NULL,
    col integer DEFAULT 0 NOT NULL,
    "row" integer DEFAULT 0 NOT NULL,
    workspace_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    space_id uuid NOT NULL,
    engine_agent_id text,
    handle text,
    template_id uuid,
    disabled_at timestamp with time zone,
    disabled_reason text,
    disabled_schedule_slugs text[] DEFAULT '{}'::text[] NOT NULL
);

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    created_by text,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    expires_at timestamp with time zone,
    scope text DEFAULT 'account'::text NOT NULL,
    bound_agent_id uuid,
    CONSTRAINT api_keys_scope_check CHECK ((scope = ANY (ARRAY['account'::text, 'agent_import'::text])))
);

--
-- Name: app_connection_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connection_agents (
    agent_id uuid NOT NULL,
    app_slug text NOT NULL,
    connection_id uuid NOT NULL,
    wake_on_events text[] DEFAULT '{}'::text[] NOT NULL,
    trigger_slug text,
    trigger_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    app_slug text NOT NULL,
    provider_account_id text,
    provider_member_id text,
    label text,
    provider_webhook_id text,
    provider_webhook_secret text,
    connected_by uuid,
    status text DEFAULT 'connecting'::text NOT NULL,
    paused_until timestamp with time zone,
    pause_reason text,
    last_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_connections_status_check CHECK ((status = ANY (ARRAY['connecting'::text, 'connected'::text, 'needs_reconnect'::text, 'paused'::text, 'deleted'::text])))
);

--
-- Name: app_trial_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_trial_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_slug text NOT NULL,
    workspace_id bigint NOT NULL,
    provider_member_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_usage_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_usage_counters (
    scope text NOT NULL,
    action text NOT NULL,
    period text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_webhook_events (
    event_id text NOT NULL,
    app_slug text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);

--
-- Name: blocked_email_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_email_domains (
    domain text NOT NULL,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text,
    category text NOT NULL,
    cover_url text,
    author_name text,
    author_avatar text,
    body_mdx text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meta_title text,
    meta_description text,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    related_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: changelog_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.changelog_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    body_md text NOT NULL,
    image_url text,
    image_alt text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dialog_image_url text,
    image_dark_url text,
    dialog_image_dark_url text
);

--
-- Name: connector_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint,
    agent_id text,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: creator_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_accounts (
    user_id uuid NOT NULL,
    stripe_account_id text NOT NULL,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    details_submitted boolean DEFAULT false NOT NULL,
    disabled_reason text,
    requirements_due text[] DEFAULT '{}'::text[] NOT NULL,
    country text,
    default_currency text,
    onboarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    app_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: email_sign_up_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sign_up_limits (
    scope text NOT NULL,
    sign_up_count integer DEFAULT 0 NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: engine_box_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_box_metrics (
    host_id uuid NOT NULL,
    box_name text NOT NULL,
    sampled_at timestamp with time zone NOT NULL,
    running boolean NOT NULL,
    rss_mb integer,
    cpu_cores real,
    active_runs smallint,
    engine_ok boolean NOT NULL
);

--
-- Name: engine_host_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_host_metrics (
    host_id uuid NOT NULL,
    sampled_at timestamp with time zone NOT NULL,
    cpu_pct real,
    load1 real NOT NULL,
    load5 real NOT NULL,
    load15 real NOT NULL,
    cores smallint NOT NULL,
    mem_total_mb integer NOT NULL,
    mem_available_mb integer NOT NULL,
    arc_mb integer,
    swap_total_mb integer NOT NULL,
    swap_used_mb integer NOT NULL,
    psi_cpu real,
    psi_mem real,
    psi_io real,
    disk_total_gb real,
    disk_used_gb real,
    net_rx_bps bigint,
    net_tx_bps bigint,
    boxes_running smallint NOT NULL,
    boxes_total smallint NOT NULL,
    active_runs smallint NOT NULL
);

--
-- Name: engine_hosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_hosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    public_ip text NOT NULL,
    ssh_user text DEFAULT 'root'::text NOT NULL,
    max_boxes smallint DEFAULT 40 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engine_hosts_max_boxes_check CHECK (((max_boxes >= 1) AND (max_boxes <= 100)))
);

--
-- Name: engine_pairing_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_pairing_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    token_hash text NOT NULL,
    created_by uuid,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: engine_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_pool (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.cloud_provider DEFAULT 'incus'::public.cloud_provider NOT NULL,
    provider_server_id text,
    region text,
    server_type text,
    engine_host text,
    engine_api_key text NOT NULL,
    status public.engine_pool_status DEFAULT 'provisioning'::public.engine_pool_status NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update_at timestamp with time zone,
    last_update_status public.engine_update_status,
    last_update_log text,
    host_id uuid,
    box_index smallint,
    claimed_by_workspace_id bigint
);

--
-- Name: expert_email_opt_outs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_email_opt_outs (
    email text NOT NULL,
    expert_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: expert_hire_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_hire_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company_url text,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: experts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    type public.expert_type NOT NULL,
    location text,
    bio text,
    budget text,
    avatar_url text,
    banner_url text NOT NULL,
    skills text[] DEFAULT '{}'::text[] NOT NULL,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    x_url text,
    linkedin_url text,
    github_url text,
    website_url text,
    featured boolean DEFAULT false NOT NULL,
    status public.expert_status DEFAULT 'draft'::public.expert_status NOT NULL,
    invited_at timestamp with time zone,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_token text DEFAULT encode(public.gen_random_bytes(16), 'hex'::text) NOT NULL,
    availability public.expert_availability DEFAULT 'available'::public.expert_availability NOT NULL,
    email text,
    seo_indexed boolean DEFAULT true NOT NULL,
    timezone text,
    invite_scheduled_at timestamp with time zone,
    invite_run_id text,
    source public.expert_source DEFAULT 'import'::public.expert_source NOT NULL,
    application_status public.expert_application_status,
    application_reviewed_at timestamp with time zone,
    application_reviewed_by uuid,
    application_note text,
    creator_token text,
    creator_joined_at timestamp with time zone,
    creator_terms_accepted_at timestamp with time zone
);

--
-- Name: invitation_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    plan text NOT NULL,
    max_uses integer,
    uses integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: invitation_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_id uuid NOT NULL,
    workspace_id integer NOT NULL,
    user_id uuid,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lifecycle_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lifecycle_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id bigint NOT NULL,
    sequence_key text NOT NULL,
    agent_id uuid,
    status public.lifecycle_email_status DEFAULT 'sent'::public.lifecycle_email_status NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);

--
-- Name: lumvika_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lumvika_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    space_id uuid,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cost_micros bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tier text,
    engine_agent_id text,
    billed boolean DEFAULT true NOT NULL
);

--
-- Name: message_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    user_id uuid,
    agent_id uuid,
    session_id uuid,
    message_id text NOT NULL,
    rating text NOT NULL,
    category text,
    details text,
    message_text text NOT NULL,
    transcript jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    steward_conversation_id uuid,
    CONSTRAINT message_feedback_rating_check CHECK ((rating = ANY (ARRAY['up'::text, 'down'::text])))
);

--
-- Name: newsletter_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    send_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    status public.newsletter_recipient_status DEFAULT 'pending'::public.newsletter_recipient_status NOT NULL,
    email_id text,
    error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: newsletter_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    subject text NOT NULL,
    status public.newsletter_send_status DEFAULT 'queued'::public.newsletter_send_status NOT NULL,
    audience_size integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    run_id text,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone
);

--
-- Name: notification_email_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_email_dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_id integer NOT NULL,
    source_key text NOT NULL,
    kind public.notification_kind NOT NULL,
    status public.notification_email_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    digested_at timestamp with time zone
);

--
-- Name: notification_email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_key text NOT NULL,
    suppressed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_event_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone
);

--
-- Name: notification_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_incidents (
    user_id uuid NOT NULL,
    source_key text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);

--
-- Name: notification_push_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_push_dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id integer NOT NULL,
    space_id uuid,
    agent_id uuid,
    engine_agent_id text,
    engine_session_id text,
    engine_run_id text,
    event text DEFAULT 'agent.notification'::text NOT NULL,
    kind public.notification_kind DEFAULT 'info'::public.notification_kind NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    read_at timestamp with time zone,
    notified_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.session_source,
    recipients jsonb
);

--
-- Name: oauth_pending_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_pending_grants (
    jti text NOT NULL,
    agent_id text NOT NULL,
    workspace_id bigint NOT NULL,
    user_id uuid NOT NULL,
    kind text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

--
-- Name: paid_data_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_data_events (
    id bigint NOT NULL,
    workspace_id bigint NOT NULL,
    engine_agent_id text,
    tool text NOT NULL,
    capability text NOT NULL,
    served_by text,
    outcome text NOT NULL,
    provider_cost_micros bigint DEFAULT 0 NOT NULL,
    billed_micros bigint DEFAULT 0 NOT NULL,
    treg_status integer,
    treg_call_id text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paid_data_events_outcome_check CHECK ((outcome = ANY (ARRAY['ok'::text, 'miss'::text, 'pending'::text, 'error'::text])))
);

--
-- Name: paid_data_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.paid_data_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.paid_data_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: published_access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.published_access_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    published_file_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: published_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.published_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id integer NOT NULL,
    space_id uuid,
    agent_id uuid NOT NULL,
    source_path text NOT NULL,
    storage_key text NOT NULL,
    content_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    public_url text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'file'::text NOT NULL,
    files text[],
    access text DEFAULT 'workspace'::text NOT NULL,
    invited text[] DEFAULT '{}'::text[] NOT NULL,
    password_hash text,
    requested_access text,
    access_version integer DEFAULT 1 NOT NULL,
    title text,
    thumbnail_key text,
    CONSTRAINT published_files_access_check CHECK ((access = ANY (ARRAY['public'::text, 'workspace'::text, 'password'::text, 'invited'::text]))),
    CONSTRAINT published_files_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'site'::text]))),
    CONSTRAINT published_files_requested_access_check CHECK ((requested_access = 'public'::text))
);

--
-- Name: published_gate_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.published_gate_attempts (
    scope text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: service_alternatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_alternatives (
    service_slug text NOT NULL,
    alternative_slug text NOT NULL,
    probability real NOT NULL,
    confidence real NOT NULL,
    model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_alternatives_check CHECK ((service_slug <> alternative_slug)),
    CONSTRAINT service_alternatives_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT service_alternatives_probability_check CHECK (((probability >= (0)::double precision) AND (probability <= (1)::double precision)))
);

--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    slug text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    icon text,
    manifest jsonb NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding public.vector(1536),
    verified boolean DEFAULT false NOT NULL,
    CONSTRAINT services_category_check CHECK ((category = ANY (ARRAY['payments'::text, 'ecommerce'::text, 'crm'::text, 'marketing'::text, 'seo'::text, 'analytics'::text, 'dev'::text, 'productivity'::text, 'other'::text])))
);

--
-- Name: session_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_participants (
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: session_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_reads (
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    title text DEFAULT 'New conversation'::text NOT NULL,
    engine_session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.session_status DEFAULT 'idle'::public.session_status NOT NULL,
    origin_agent_id uuid,
    source public.session_source DEFAULT 'builder'::public.session_source NOT NULL,
    automation_name text,
    outcome public.session_outcome,
    kind public.session_kind DEFAULT 'thread'::public.session_kind NOT NULL,
    first_message text
);

--
-- Name: space_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_members (
    space_id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_id bigint NOT NULL,
    access text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT space_members_access_check CHECK ((access = ANY (ARRAY['use'::text, 'manage'::text])))
);

--
-- Name: spaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id integer NOT NULL,
    name text DEFAULT 'Untitled Space'::text,
    col_start integer NOT NULL,
    row_start integer NOT NULL,
    col_end integer NOT NULL,
    row_end integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    visibility text DEFAULT 'workspace'::text NOT NULL,
    CONSTRAINT spaces_visibility_check CHECK ((visibility = ANY (ARRAY['workspace'::text, 'restricted'::text])))
);

--
-- Name: steward_builds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.steward_builds (
    workspace_id bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    result jsonb
);

--
-- Name: steward_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.steward_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    user_id uuid NOT NULL,
    title text,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    backend text DEFAULT 'hub'::text NOT NULL,
    engine_session_id text,
    CONSTRAINT steward_conversations_backend_check CHECK ((backend = ANY (ARRAY['hub'::text, 'engine'::text])))
);

--
-- Name: stripe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_events (
    id text NOT NULL,
    type text NOT NULL,
    connected_account_id text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);

--
-- Name: template_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    template_id uuid NOT NULL,
    creator_id uuid,
    purchased_by uuid,
    pricing_model public.template_pricing_model NOT NULL,
    status public.template_purchase_status DEFAULT 'pending'::public.template_purchase_status NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    stripe_connected_account_id text,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: template_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    template_slug text NOT NULL,
    template_title text NOT NULL,
    creator_id uuid,
    workspace_id bigint,
    purchase_id uuid,
    kind text NOT NULL,
    gross_cents integer NOT NULL,
    application_fee_cents integer DEFAULT 0 NOT NULL,
    net_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_charge_id text,
    stripe_invoice_id text,
    stripe_connected_account_id text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_cents integer DEFAULT 0 NOT NULL,
    stripe_transfer_id text,
    CONSTRAINT template_sales_kind_check CHECK ((kind = ANY (ARRAY['one_time'::text, 'recurring'::text, 'refund'::text])))
);

--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    long_description text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    gallery jsonb DEFAULT '[]'::jsonb NOT NULL,
    video_url text,
    og_image_url text,
    meta_title text,
    meta_description text,
    setup_minutes integer DEFAULT 5 NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    status public.template_status DEFAULT 'draft'::public.template_status NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    show_in_marketplace boolean DEFAULT true NOT NULL,
    show_in_library boolean DEFAULT true NOT NULL,
    agents jsonb DEFAULT '[]'::jsonb NOT NULL,
    connectors jsonb DEFAULT '[]'::jsonb NOT NULL,
    agent_count integer GENERATED ALWAYS AS (COALESCE(jsonb_array_length(agents), 0)) STORED,
    agent_archives jsonb DEFAULT '[]'::jsonb NOT NULL,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    creator_id uuid,
    submitted_at timestamp with time zone,
    review_note text,
    pricing_model public.template_pricing_model DEFAULT 'free'::public.template_pricing_model NOT NULL,
    price_amount_cents integer DEFAULT 0 NOT NULL,
    price_currency text DEFAULT 'usd'::text NOT NULL,
    stripe_product_id text,
    stripe_price_id text,
    price_synced_at timestamp with time zone,
    card_image_dark_url text,
    card_image_light_url text,
    story jsonb DEFAULT '[]'::jsonb NOT NULL,
    lead_magnet boolean DEFAULT false NOT NULL,
    role_page jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT templates_category_check CHECK ((category = ANY (ARRAY['agencies'::text, 'ecommerce'::text, 'saas'::text, 'sales'::text, 'recruiting'::text, 'real-estate'::text, 'legal'::text, 'creators'::text, 'productivity'::text, 'other'::text]))),
    CONSTRAINT templates_price_coherent CHECK ((((pricing_model = 'free'::public.template_pricing_model) AND (price_amount_cents = 0)) OR ((pricing_model <> 'free'::public.template_pricing_model) AND ((price_amount_cents >= 100) AND (price_amount_cents <= 200000))))),
    CONSTRAINT templates_price_currency_check CHECK ((price_currency = 'usd'::text)),
    CONSTRAINT templates_title_length_check CHECK ((char_length(title) <= 50))
);

--
-- Name: COLUMN templates.card_image_dark_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.card_image_dark_url IS 'Isogrid board capture, dark theme, served by the template cards. Written by the card renderer, never by the editor.';

--
-- Name: COLUMN templates.card_image_light_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.card_image_light_url IS 'Isogrid board capture, light theme, served by the template cards. Written by the card renderer, never by the editor.';

--
-- Name: COLUMN templates.story; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.story IS 'Template story steps (templateStoryStepSchema in @lumvika/contracts). Authored in the admin editor only.';

--
-- Name: COLUMN templates.lead_magnet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.lead_magnet IS 'Opens the call-to-action sheet on the public page for direct mobile visits. Set in the admin editor only.';

--
-- Name: COLUMN templates.role_page; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.role_page IS 'Role landing sections (templateRolePageSchema in @lumvika/contracts). Authored in the admin editor only.';

--
-- Name: trial_card_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_card_fingerprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fingerprint text NOT NULL,
    workspace_id bigint,
    stripe_customer_id text,
    stripe_subscription_id text,
    payment_method_id text,
    trial_skipped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: COLUMN trial_card_fingerprints.fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trial_card_fingerprints.fingerprint IS 'Stripe payment_method.card.fingerprint: stable across customers for one physical card, and not reversible to a PAN.';

--
-- Name: COLUMN trial_card_fingerprints.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trial_card_fingerprints.created_at IS 'Backdated by the audit script to the real trial_start, so "first claim wins" is historically true and not an artefact of the backfill order.';

--
-- Name: user_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_presence (
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
)
WITH (fillfactor='70');

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id bigint NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    onboarding_answers jsonb,
    onboarding_completed_at timestamp with time zone,
    email_notification_prefs jsonb DEFAULT '{"done": false, "info": false, "error": false, "billing": true, "product": true, "approval": false, "progress": false, "question": false}'::jsonb NOT NULL,
    account_role public.account_role DEFAULT 'member'::public.account_role NOT NULL,
    expert_profile_id uuid,
    signed_up_at timestamp with time zone,
    changelog_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    locale text,
    CONSTRAINT users_locale_format CHECK (((locale IS NULL) OR (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)))
);

--
-- Name: web_fetch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_fetch_events (
    id bigint NOT NULL,
    workspace_id bigint NOT NULL,
    engine_agent_id text,
    url text NOT NULL,
    host text,
    direct_status integer,
    outcome text NOT NULL,
    provider_status integer,
    page_status integer,
    content_chars integer DEFAULT 0 NOT NULL,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_fetch_events_outcome_check CHECK ((outcome = ANY (ARRAY['ok'::text, 'empty'::text, 'error'::text])))
);

--
-- Name: web_fetch_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.web_fetch_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.web_fetch_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: web_search_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_search_cache (
    query_key text NOT NULL,
    results jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: web_search_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_search_events (
    id bigint NOT NULL,
    workspace_id bigint NOT NULL,
    engine_agent_id text,
    query text NOT NULL,
    outcome text NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    provider_status integer,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cached boolean DEFAULT false NOT NULL,
    CONSTRAINT web_search_events_outcome_check CHECK ((outcome = ANY (ARRAY['ok'::text, 'empty'::text, 'error'::text])))
);

--
-- Name: web_search_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.web_search_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.web_search_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id bigint,
    agent_id uuid,
    phone text NOT NULL,
    template_key text NOT NULL,
    language text NOT NULL,
    category text NOT NULL,
    dedupe_key text,
    bird_message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_code text,
    meta_error_code text,
    error text,
    CONSTRAINT whatsapp_messages_category_check CHECK ((category = ANY (ARRAY['marketing'::text, 'utility'::text]))),
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'rejected'::text])))
);

--
-- Name: workspace_apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_apps (
    workspace_id bigint NOT NULL,
    app_slug text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    slots integer DEFAULT 0 NOT NULL,
    trial_ends_at timestamp with time zone,
    trial_reminder_sent_at timestamp with time zone,
    trial_settled_at timestamp with time zone,
    frozen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_apps_slots_check CHECK ((slots >= 0)),
    CONSTRAINT workspace_apps_status_check CHECK ((status = ANY (ARRAY['active'::text, 'frozen'::text, 'uninstalled'::text])))
);

--
-- Name: workspace_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    status public.workspace_archive_status DEFAULT 'archiving'::public.workspace_archive_status NOT NULL,
    object_key text NOT NULL,
    bytes bigint,
    sha256 text,
    raw_bytes bigint,
    data_version integer,
    engine_commit text,
    source_host_id uuid,
    source_host_name text NOT NULL,
    source_box text NOT NULL,
    restored_to_instance_id uuid,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    restored_at timestamp with time zone,
    expires_at timestamp with time zone,
    reason public.workspace_archive_reason DEFAULT 'access_ended'::public.workspace_archive_reason NOT NULL,
    reactivation_requested_at timestamp with time zone,
    reactivation_request_note text,
    reactivation_approved_at timestamp with time zone,
    reactivation_rejected_at timestamp with time zone,
    reactivation_reviewed_by uuid
);

--
-- Name: workspace_getting_started; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_getting_started (
    workspace_id bigint NOT NULL,
    item text NOT NULL,
    done_at timestamp with time zone DEFAULT now() NOT NULL,
    reported_at timestamp with time zone,
    CONSTRAINT workspace_getting_started_item_check CHECK ((item = ANY (ARRAY['first_agent'::text, 'ai_provider'::text, 'invite'::text, 'schedule'::text, 'payment_method'::text, 'reward'::text, 'dismissed'::text])))
);

--
-- Name: workspace_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    invited_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    box_scope text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT workspace_invitations_box_scope_check CHECK ((box_scope = ANY (ARRAY['all'::text, 'assigned'::text])))
);

--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    user_id uuid NOT NULL,
    workspace_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.workspace_role DEFAULT 'admin'::public.workspace_role NOT NULL,
    box_scope text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT workspace_members_box_scope_check CHECK ((box_scope = ANY (ARRAY['all'::text, 'assigned'::text])))
);

--
-- Name: workspace_onboarding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_onboarding (
    workspace_id bigint NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_findings jsonb,
    agent_ideas jsonb
);

--
-- Name: workspace_rewind_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_rewind_views (
    rewind_id uuid NOT NULL,
    user_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: workspace_rewinds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_rewinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    week_start date NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying,
    plan character varying DEFAULT 'pro'::character varying NOT NULL,
    stripe_customer_id character varying,
    trial_ends_at timestamp with time zone,
    max_agents integer DEFAULT 1,
    max_seats integer,
    model_access text DEFAULT 'best'::text,
    custom_integrations boolean DEFAULT false NOT NULL,
    stripe_subscription_id text,
    stripe_price_id text,
    subscription_status text,
    current_period_end timestamp with time zone,
    icon_url text,
    lumvika_budget_micros bigint DEFAULT 0 NOT NULL,
    lumvika_used_micros bigint DEFAULT 0 NOT NULL,
    lumvika_period_anchor timestamp with time zone,
    is_sandbox boolean DEFAULT false NOT NULL,
    lumvika_topup_micros bigint DEFAULT 0 NOT NULL,
    subscription_cancel_at timestamp with time zone,
    first_paid_at timestamp with time zone,
    boxes_disabled_at timestamp with time zone,
    boxes_deleted_at timestamp with time zone,
    waitlisted_at timestamp with time zone,
    onboarded_at timestamp with time zone,
    boxes_archived_at timestamp with time zone,
    renewal_reminder_at timestamp with time zone,
    renewal_reminder_user_id uuid,
    last_active_at timestamp with time zone,
    price_arm text,
    payment_failed_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    lumvika_credit_paused_at timestamp with time zone,
    publish_policy text,
    locale text DEFAULT 'en'::text NOT NULL,
    CONSTRAINT workspaces_locale_format CHECK ((locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)),
    CONSTRAINT workspaces_lumvika_topup_non_negative CHECK ((lumvika_topup_micros >= 0)),
    CONSTRAINT workspaces_price_arm_check CHECK ((price_arm = ANY (ARRAY['29'::text, '49'::text]))),
    CONSTRAINT workspaces_publish_policy_check CHECK ((publish_policy = ANY (ARRAY['people'::text, 'anyone'::text, 'never'::text])))
);

--
-- Name: workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.workspaces_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: agent_shares agent_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_shares
    ADD CONSTRAINT agent_shares_pkey PRIMARY KEY (id);

--
-- Name: agent_shares agent_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_shares
    ADD CONSTRAINT agent_shares_token_key UNIQUE (token);

--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);

--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

--
-- Name: app_connection_agents app_connection_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_agents
    ADD CONSTRAINT app_connection_agents_pkey PRIMARY KEY (agent_id, app_slug);

--
-- Name: app_connections app_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_pkey PRIMARY KEY (id);

--
-- Name: app_trial_claims app_trial_claims_app_slug_provider_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_trial_claims
    ADD CONSTRAINT app_trial_claims_app_slug_provider_member_id_key UNIQUE (app_slug, provider_member_id);

--
-- Name: app_trial_claims app_trial_claims_app_slug_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_trial_claims
    ADD CONSTRAINT app_trial_claims_app_slug_workspace_id_key UNIQUE (app_slug, workspace_id);

--
-- Name: app_trial_claims app_trial_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_trial_claims
    ADD CONSTRAINT app_trial_claims_pkey PRIMARY KEY (id);

--
-- Name: app_usage_counters app_usage_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_usage_counters
    ADD CONSTRAINT app_usage_counters_pkey PRIMARY KEY (scope, action, period);

--
-- Name: app_webhook_events app_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_webhook_events
    ADD CONSTRAINT app_webhook_events_pkey PRIMARY KEY (event_id);

--
-- Name: blocked_email_domains blocked_email_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_email_domains
    ADD CONSTRAINT blocked_email_domains_pkey PRIMARY KEY (domain);

--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);

--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);

--
-- Name: changelog_entries changelog_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.changelog_entries
    ADD CONSTRAINT changelog_entries_pkey PRIMARY KEY (id);

--
-- Name: changelog_entries changelog_entries_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.changelog_entries
    ADD CONSTRAINT changelog_entries_slug_key UNIQUE (slug);

--
-- Name: connector_requests connector_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_requests
    ADD CONSTRAINT connector_requests_pkey PRIMARY KEY (id);

--
-- Name: creator_accounts creator_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_accounts
    ADD CONSTRAINT creator_accounts_pkey PRIMARY KEY (user_id);

--
-- Name: creator_accounts creator_accounts_stripe_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_accounts
    ADD CONSTRAINT creator_accounts_stripe_account_id_key UNIQUE (stripe_account_id);

--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);

--
-- Name: device_tokens device_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_token_key UNIQUE (token);

--
-- Name: email_sign_up_limits email_sign_up_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sign_up_limits
    ADD CONSTRAINT email_sign_up_limits_pkey PRIMARY KEY (scope);

--
-- Name: engine_box_metrics engine_box_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_box_metrics
    ADD CONSTRAINT engine_box_metrics_pkey PRIMARY KEY (host_id, box_name, sampled_at);

--
-- Name: engine_host_metrics engine_host_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_host_metrics
    ADD CONSTRAINT engine_host_metrics_pkey PRIMARY KEY (host_id, sampled_at);

--
-- Name: engine_hosts engine_hosts_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_hosts
    ADD CONSTRAINT engine_hosts_name_key UNIQUE (name);

--
-- Name: engine_hosts engine_hosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_hosts
    ADD CONSTRAINT engine_hosts_pkey PRIMARY KEY (id);

--
-- Name: engine_hosts engine_hosts_public_ip_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_hosts
    ADD CONSTRAINT engine_hosts_public_ip_key UNIQUE (public_ip);

--
-- Name: engine_pairing_tokens engine_pairing_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pairing_tokens
    ADD CONSTRAINT engine_pairing_tokens_pkey PRIMARY KEY (id);

--
-- Name: engine_pairing_tokens engine_pairing_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pairing_tokens
    ADD CONSTRAINT engine_pairing_tokens_token_hash_key UNIQUE (token_hash);

--
-- Name: engine_pool engine_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pool
    ADD CONSTRAINT engine_pool_pkey PRIMARY KEY (id);

--
-- Name: expert_email_opt_outs expert_email_opt_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_email_opt_outs
    ADD CONSTRAINT expert_email_opt_outs_pkey PRIMARY KEY (email);

--
-- Name: expert_hire_requests expert_hire_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_hire_requests
    ADD CONSTRAINT expert_hire_requests_pkey PRIMARY KEY (id);

--
-- Name: experts experts_claim_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_claim_token_key UNIQUE (claim_token);

--
-- Name: experts experts_creator_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_creator_token_key UNIQUE (creator_token);

--
-- Name: experts experts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_pkey PRIMARY KEY (id);

--
-- Name: experts experts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_slug_key UNIQUE (slug);

--
-- Name: invitation_codes invitation_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_codes
    ADD CONSTRAINT invitation_codes_code_key UNIQUE (code);

--
-- Name: invitation_codes invitation_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_codes
    ADD CONSTRAINT invitation_codes_pkey PRIMARY KEY (id);

--
-- Name: invitation_redemptions invitation_redemptions_code_id_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_redemptions
    ADD CONSTRAINT invitation_redemptions_code_id_workspace_id_key UNIQUE (code_id, workspace_id);

--
-- Name: invitation_redemptions invitation_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_redemptions
    ADD CONSTRAINT invitation_redemptions_pkey PRIMARY KEY (id);

--
-- Name: lifecycle_emails lifecycle_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lifecycle_emails
    ADD CONSTRAINT lifecycle_emails_pkey PRIMARY KEY (id);

--
-- Name: lumvika_usage_events lumvika_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumvika_usage_events
    ADD CONSTRAINT lumvika_usage_events_pkey PRIMARY KEY (id);

--
-- Name: message_feedback message_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_pkey PRIMARY KEY (id);

--
-- Name: message_feedback message_feedback_session_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_session_id_message_id_key UNIQUE (session_id, message_id);

--
-- Name: message_feedback message_feedback_steward_conversation_message_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_steward_conversation_message_key UNIQUE (steward_conversation_id, message_id);

--
-- Name: newsletter_recipients newsletter_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_pkey PRIMARY KEY (id);

--
-- Name: newsletter_sends newsletter_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_sends
    ADD CONSTRAINT newsletter_sends_pkey PRIMARY KEY (id);

--
-- Name: notification_email_dispatches notification_email_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_dispatches
    ADD CONSTRAINT notification_email_dispatches_pkey PRIMARY KEY (id);

--
-- Name: notification_email_suppressions notification_email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_suppressions
    ADD CONSTRAINT notification_email_suppressions_pkey PRIMARY KEY (id);

--
-- Name: notification_incidents notification_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_incidents
    ADD CONSTRAINT notification_incidents_pkey PRIMARY KEY (user_id, source_key);

--
-- Name: notification_push_dispatches notification_push_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_push_dispatches
    ADD CONSTRAINT notification_push_dispatches_pkey PRIMARY KEY (id);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: oauth_pending_grants oauth_pending_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_pending_grants
    ADD CONSTRAINT oauth_pending_grants_pkey PRIMARY KEY (jti);

--
-- Name: paid_data_events paid_data_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_data_events
    ADD CONSTRAINT paid_data_events_pkey PRIMARY KEY (id);

--
-- Name: published_access_codes published_access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_access_codes
    ADD CONSTRAINT published_access_codes_pkey PRIMARY KEY (id);

--
-- Name: published_files published_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_files
    ADD CONSTRAINT published_files_pkey PRIMARY KEY (id);

--
-- Name: published_gate_attempts published_gate_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_gate_attempts
    ADD CONSTRAINT published_gate_attempts_pkey PRIMARY KEY (scope);

--
-- Name: service_alternatives service_alternatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_alternatives
    ADD CONSTRAINT service_alternatives_pkey PRIMARY KEY (service_slug, alternative_slug);

--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (slug);

--
-- Name: session_participants session_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_pkey PRIMARY KEY (session_id, user_id);

--
-- Name: session_reads session_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reads
    ADD CONSTRAINT session_reads_pkey PRIMARY KEY (session_id, user_id);

--
-- Name: sessions sessions_hermes_conversation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_hermes_conversation_key UNIQUE (engine_session_id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: space_members space_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_members
    ADD CONSTRAINT space_members_pkey PRIMARY KEY (space_id, user_id);

--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);

--
-- Name: steward_builds steward_builds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steward_builds
    ADD CONSTRAINT steward_builds_pkey PRIMARY KEY (workspace_id);

--
-- Name: steward_conversations steward_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steward_conversations
    ADD CONSTRAINT steward_conversations_pkey PRIMARY KEY (id);

--
-- Name: stripe_events stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_events
    ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);

--
-- Name: template_purchases template_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_pkey PRIMARY KEY (id);

--
-- Name: template_sales template_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sales
    ADD CONSTRAINT template_sales_pkey PRIMARY KEY (id);

--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

--
-- Name: templates templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_slug_key UNIQUE (slug);

--
-- Name: trial_card_fingerprints trial_card_fingerprints_fingerprint_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_card_fingerprints
    ADD CONSTRAINT trial_card_fingerprints_fingerprint_workspace_id_key UNIQUE (fingerprint, workspace_id);

--
-- Name: trial_card_fingerprints trial_card_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_card_fingerprints
    ADD CONSTRAINT trial_card_fingerprints_pkey PRIMARY KEY (id);

--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (user_id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: web_fetch_events web_fetch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_fetch_events
    ADD CONSTRAINT web_fetch_events_pkey PRIMARY KEY (id);

--
-- Name: web_search_cache web_search_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_search_cache
    ADD CONSTRAINT web_search_cache_pkey PRIMARY KEY (query_key);

--
-- Name: web_search_events web_search_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_search_events
    ADD CONSTRAINT web_search_events_pkey PRIMARY KEY (id);

--
-- Name: whatsapp_messages whatsapp_messages_bird_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_bird_message_id_key UNIQUE (bird_message_id);

--
-- Name: whatsapp_messages whatsapp_messages_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_dedupe_key_key UNIQUE (dedupe_key);

--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);

--
-- Name: workspace_apps workspace_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_apps
    ADD CONSTRAINT workspace_apps_pkey PRIMARY KEY (workspace_id, app_slug);

--
-- Name: workspace_archives workspace_archives_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_object_key_key UNIQUE (object_key);

--
-- Name: workspace_archives workspace_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_pkey PRIMARY KEY (id);

--
-- Name: workspace_getting_started workspace_getting_started_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_getting_started
    ADD CONSTRAINT workspace_getting_started_pkey PRIMARY KEY (workspace_id, item);

--
-- Name: workspace_invitations workspace_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);

--
-- Name: workspace_invitations workspace_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_token_key UNIQUE (token);

--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (user_id, workspace_id);

--
-- Name: workspace_onboarding workspace_onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_onboarding
    ADD CONSTRAINT workspace_onboarding_pkey PRIMARY KEY (workspace_id);

--
-- Name: workspace_rewind_views workspace_rewind_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewind_views
    ADD CONSTRAINT workspace_rewind_views_pkey PRIMARY KEY (rewind_id, user_id);

--
-- Name: workspace_rewinds workspace_rewinds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewinds
    ADD CONSTRAINT workspace_rewinds_pkey PRIMARY KEY (id);

--
-- Name: workspace_rewinds workspace_rewinds_workspace_id_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewinds
    ADD CONSTRAINT workspace_rewinds_workspace_id_week_start_key UNIQUE (workspace_id, week_start);

--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

--
-- Name: agent_shares_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_shares_active_idx ON public.agent_shares USING btree (workspace_id) WHERE (revoked_at IS NULL);

--
-- Name: agent_shares_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_shares_workspace_idx ON public.agent_shares USING btree (workspace_id);

--
-- Name: agents_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_created_at_idx ON public.agents USING btree (created_at);

--
-- Name: agents_disabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_disabled_idx ON public.agents USING btree (workspace_id) WHERE (disabled_at IS NOT NULL);

--
-- Name: agents_template_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_template_id_idx ON public.agents USING btree (template_id) WHERE (template_id IS NOT NULL);

--
-- Name: agents_workspace_handle_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agents_workspace_handle_key ON public.agents USING btree (workspace_id, handle) WHERE (handle IS NOT NULL);

--
-- Name: api_keys_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_workspace_id_idx ON public.api_keys USING btree (workspace_id);

--
-- Name: app_connection_agents_connection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_agents_connection_idx ON public.app_connection_agents USING btree (connection_id);

--
-- Name: app_connections_provider_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_connections_provider_account_idx ON public.app_connections USING btree (app_slug, provider_account_id) WHERE ((provider_account_id IS NOT NULL) AND (status <> 'deleted'::text));

--
-- Name: app_connections_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connections_workspace_idx ON public.app_connections USING btree (workspace_id, app_slug) WHERE (status <> 'deleted'::text);

--
-- Name: blog_posts_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_category_idx ON public.blog_posts USING btree (category);

--
-- Name: blog_posts_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_published_idx ON public.blog_posts USING btree (published, published_at DESC);

--
-- Name: changelog_entries_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX changelog_entries_published_idx ON public.changelog_entries USING btree (published_at DESC) WHERE (published_at IS NOT NULL);

--
-- Name: device_tokens_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_tokens_user_active_idx ON public.device_tokens USING btree (user_id) WHERE (revoked_at IS NULL);

--
-- Name: engine_box_metrics_host_sampled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engine_box_metrics_host_sampled_idx ON public.engine_box_metrics USING btree (host_id, sampled_at);

--
-- Name: engine_pairing_tokens_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engine_pairing_tokens_workspace_id_idx ON public.engine_pairing_tokens USING btree (workspace_id);

--
-- Name: engine_pool_claimed_by_workspace_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engine_pool_claimed_by_workspace_id_key ON public.engine_pool USING btree (claimed_by_workspace_id) WHERE (claimed_by_workspace_id IS NOT NULL);

--
-- Name: engine_pool_engine_api_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engine_pool_engine_api_key_key ON public.engine_pool USING btree (engine_api_key);

--
-- Name: engine_pool_host_box_index_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engine_pool_host_box_index_key ON public.engine_pool USING btree (host_id, box_index) WHERE (host_id IS NOT NULL);

--
-- Name: engine_pool_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engine_pool_status_idx ON public.engine_pool USING btree (status);

--
-- Name: expert_hire_requests_expert_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expert_hire_requests_expert_id_idx ON public.expert_hire_requests USING btree (expert_id);

--
-- Name: experts_application_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experts_application_status_idx ON public.experts USING btree (application_status) WHERE (application_status IS NOT NULL);

--
-- Name: experts_claim_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experts_claim_token_idx ON public.experts USING btree (claim_token);

--
-- Name: experts_invite_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experts_invite_scheduled_at_idx ON public.experts USING btree (invite_scheduled_at) WHERE (invite_scheduled_at IS NOT NULL);

--
-- Name: experts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experts_status_idx ON public.experts USING btree (status);

--
-- Name: idx_agents_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_workspace_id ON public.agents USING btree (workspace_id);

--
-- Name: idx_sessions_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_agent_id ON public.sessions USING btree (agent_id);

--
-- Name: lifecycle_emails_once_per_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lifecycle_emails_once_per_agent_idx ON public.lifecycle_emails USING btree (agent_id, sequence_key) WHERE (agent_id IS NOT NULL);

--
-- Name: lifecycle_emails_once_per_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lifecycle_emails_once_per_user_idx ON public.lifecycle_emails USING btree (user_id, sequence_key) WHERE (sequence_key = ANY (ARRAY['onboarding_resume'::text, 'agent_recommendations'::text, 'creator_pitch'::text]));

--
-- Name: lifecycle_emails_once_per_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lifecycle_emails_once_per_workspace_idx ON public.lifecycle_emails USING btree (workspace_id, sequence_key) WHERE (sequence_key = ANY (ARRAY['team_invite'::text, 'trial_started'::text, 'trial_ended'::text, 'trial_ending_2h'::text, 'trial_ending_3d'::text, 'subscription_ending_7d'::text, 'subscription_ending_3d'::text, 'subscription_ending_24h'::text]));

--
-- Name: lifecycle_emails_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lifecycle_emails_user_recent_idx ON public.lifecycle_emails USING btree (user_id, sent_at DESC);

--
-- Name: lumvika_usage_events_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lumvika_usage_events_workspace_idx ON public.lumvika_usage_events USING btree (workspace_id, created_at DESC);

--
-- Name: message_feedback_rating_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_feedback_rating_idx ON public.message_feedback USING btree (rating, created_at DESC);

--
-- Name: message_feedback_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_feedback_recent_idx ON public.message_feedback USING btree (created_at DESC);

--
-- Name: message_feedback_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_feedback_workspace_idx ON public.message_feedback USING btree (workspace_id);

--
-- Name: newsletter_recipients_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_recipients_pending_idx ON public.newsletter_recipients USING btree (send_id, status, user_id);

--
-- Name: newsletter_recipients_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX newsletter_recipients_unique_idx ON public.newsletter_recipients USING btree (send_id, user_id);

--
-- Name: newsletter_sends_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_sends_created_at_idx ON public.newsletter_sends USING btree (created_at DESC);

--
-- Name: newsletter_sends_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX newsletter_sends_slug_idx ON public.newsletter_sends USING btree (slug) WHERE (status <> 'canceled'::public.newsletter_send_status);

--
-- Name: notification_email_dispatches_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_dispatches_pending_idx ON public.notification_email_dispatches USING btree (user_id, created_at) WHERE (status = 'suppressed'::public.notification_email_status);

--
-- Name: notification_email_dispatches_source_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_dispatches_source_window_idx ON public.notification_email_dispatches USING btree (user_id, source_key, created_at DESC);

--
-- Name: notification_email_dispatches_user_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_dispatches_user_window_idx ON public.notification_email_dispatches USING btree (user_id, created_at DESC);

--
-- Name: notification_email_suppressions_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_email_suppressions_active_key ON public.notification_email_suppressions USING btree (user_id, source_key) WHERE (released_at IS NULL);

--
-- Name: notification_email_suppressions_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_suppressions_source_idx ON public.notification_email_suppressions USING btree (source_key) WHERE (released_at IS NULL);

--
-- Name: notification_incidents_open_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_incidents_open_source_idx ON public.notification_incidents USING btree (source_key) WHERE (resolved_at IS NULL);

--
-- Name: notification_push_dispatches_user_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_push_dispatches_user_window_idx ON public.notification_push_dispatches USING btree (user_id, created_at DESC);

--
-- Name: notifications_agent_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_agent_event_idx ON public.notifications USING btree (agent_id, event) WHERE (agent_id IS NOT NULL);

--
-- Name: notifications_space_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_space_idx ON public.notifications USING btree (space_id);

--
-- Name: notifications_space_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_space_unread_idx ON public.notifications USING btree (space_id) WHERE (read_at IS NULL);

--
-- Name: notifications_workspace_done_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_workspace_done_idx ON public.notifications USING btree (workspace_id, created_at DESC) WHERE (kind = 'done'::public.notification_kind);

--
-- Name: notifications_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_workspace_idx ON public.notifications USING btree (workspace_id);

--
-- Name: oauth_pending_grants_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_pending_grants_expires_at_idx ON public.oauth_pending_grants USING btree (expires_at);

--
-- Name: paid_data_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paid_data_events_created_idx ON public.paid_data_events USING btree (created_at DESC);

--
-- Name: paid_data_events_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paid_data_events_workspace_created_idx ON public.paid_data_events USING btree (workspace_id, created_at DESC);

--
-- Name: published_access_codes_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX published_access_codes_lookup_idx ON public.published_access_codes USING btree (published_file_id, email);

--
-- Name: published_files_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX published_files_agent_idx ON public.published_files USING btree (agent_id);

--
-- Name: published_files_agent_path_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX published_files_agent_path_key ON public.published_files USING btree (agent_id, source_path);

--
-- Name: published_files_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX published_files_slug_key ON public.published_files USING btree (slug);

--
-- Name: published_files_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX published_files_workspace_idx ON public.published_files USING btree (workspace_id);

--
-- Name: service_alternatives_alternative_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_alternatives_alternative_slug_idx ON public.service_alternatives USING btree (alternative_slug);

--
-- Name: session_participants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_participants_user_idx ON public.session_participants USING btree (user_id);

--
-- Name: session_reads_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_reads_user_idx ON public.session_reads USING btree (user_id);

--
-- Name: sessions_general_per_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_general_per_agent_idx ON public.sessions USING btree (agent_id) WHERE (kind = 'general'::public.session_kind);

--
-- Name: sessions_origin_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_origin_agent_idx ON public.sessions USING btree (origin_agent_id);

--
-- Name: space_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX space_members_user_idx ON public.space_members USING btree (user_id, workspace_id);

--
-- Name: space_members_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX space_members_workspace_idx ON public.space_members USING btree (workspace_id);

--
-- Name: spaces_id_workspace_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX spaces_id_workspace_id_key ON public.spaces USING btree (id, workspace_id);

--
-- Name: steward_conversations_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX steward_conversations_recent_idx ON public.steward_conversations USING btree (workspace_id, user_id, updated_at DESC);

--
-- Name: stripe_events_unprocessed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_events_unprocessed_idx ON public.stripe_events USING btree (claimed_at) WHERE (processed_at IS NULL);

--
-- Name: template_purchases_checkout_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX template_purchases_checkout_key ON public.template_purchases USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);

--
-- Name: template_purchases_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_purchases_creator_idx ON public.template_purchases USING btree (creator_id);

--
-- Name: template_purchases_subscription_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX template_purchases_subscription_key ON public.template_purchases USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);

--
-- Name: template_purchases_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_purchases_template_idx ON public.template_purchases USING btree (template_id);

--
-- Name: template_purchases_workspace_template_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX template_purchases_workspace_template_key ON public.template_purchases USING btree (workspace_id, template_id);

--
-- Name: template_sales_charge_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX template_sales_charge_key ON public.template_sales USING btree (stripe_charge_id) WHERE (stripe_charge_id IS NOT NULL);

--
-- Name: template_sales_creator_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_sales_creator_occurred_idx ON public.template_sales USING btree (creator_id, occurred_at DESC);

--
-- Name: template_sales_invoice_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX template_sales_invoice_key ON public.template_sales USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);

--
-- Name: template_sales_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_sales_template_idx ON public.template_sales USING btree (template_id);

--
-- Name: template_sales_transfer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_sales_transfer_idx ON public.template_sales USING btree (stripe_transfer_id);

--
-- Name: templates_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_category_idx ON public.templates USING btree (category);

--
-- Name: templates_creator_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_creator_id_idx ON public.templates USING btree (creator_id) WHERE (creator_id IS NOT NULL);

--
-- Name: templates_featured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_featured_idx ON public.templates USING btree (featured) WHERE featured;

--
-- Name: templates_library_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_library_idx ON public.templates USING btree (show_in_library) WHERE show_in_library;

--
-- Name: templates_marketplace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_marketplace_idx ON public.templates USING btree (show_in_marketplace) WHERE show_in_marketplace;

--
-- Name: templates_pricing_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_pricing_model_idx ON public.templates USING btree (pricing_model) WHERE (pricing_model <> 'free'::public.template_pricing_model);

--
-- Name: templates_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_status_idx ON public.templates USING btree (status);

--
-- Name: templates_stripe_price_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX templates_stripe_price_id_key ON public.templates USING btree (stripe_price_id) WHERE (stripe_price_id IS NOT NULL);

--
-- Name: templates_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_tags_idx ON public.templates USING gin (tags);

--
-- Name: users_expert_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_expert_profile_id_key ON public.users USING btree (expert_profile_id) WHERE (expert_profile_id IS NOT NULL);

--
-- Name: users_onboarding_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_onboarding_completed_idx ON public.users USING btree (onboarding_completed_at) WHERE (onboarding_completed_at IS NOT NULL);

--
-- Name: users_signed_up_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_signed_up_idx ON public.users USING btree (signed_up_at) WHERE (signed_up_at IS NOT NULL);

--
-- Name: web_fetch_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_fetch_events_created_idx ON public.web_fetch_events USING btree (created_at DESC);

--
-- Name: web_fetch_events_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_fetch_events_workspace_created_idx ON public.web_fetch_events USING btree (workspace_id, created_at DESC);

--
-- Name: web_search_cache_fetched_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_search_cache_fetched_at_idx ON public.web_search_cache USING btree (fetched_at);

--
-- Name: web_search_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_search_events_created_idx ON public.web_search_events USING btree (created_at DESC);

--
-- Name: web_search_events_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_search_events_workspace_created_idx ON public.web_search_events USING btree (workspace_id, created_at DESC);

--
-- Name: whatsapp_messages_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_messages_user_recent_idx ON public.whatsapp_messages USING btree (user_id, created_at DESC);

--
-- Name: workspace_archives_one_job_per_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_archives_one_job_per_workspace_idx ON public.workspace_archives USING btree (workspace_id) WHERE (status = ANY (ARRAY['archiving'::public.workspace_archive_status, 'restoring'::public.workspace_archive_status]));

--
-- Name: workspace_archives_reactivation_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_archives_reactivation_pending_idx ON public.workspace_archives USING btree (reactivation_requested_at) WHERE ((reactivation_requested_at IS NOT NULL) AND (reactivation_approved_at IS NULL) AND (reactivation_rejected_at IS NULL));

--
-- Name: workspace_archives_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_archives_workspace_idx ON public.workspace_archives USING btree (workspace_id, created_at DESC);

--
-- Name: workspace_invitations_pending_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_invitations_pending_uniq ON public.workspace_invitations USING btree (workspace_id, lower(email)) WHERE (status = 'pending'::text);

--
-- Name: workspace_members_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_id_idx ON public.workspace_members USING btree (workspace_id);

--
-- Name: workspace_members_workspace_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_role_idx ON public.workspace_members USING btree (workspace_id, role);

--
-- Name: workspace_rewinds_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_rewinds_recent_idx ON public.workspace_rewinds USING btree (workspace_id, week_start DESC);

--
-- Name: workspaces_boxes_archived_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_boxes_archived_at_idx ON public.workspaces USING btree (boxes_archived_at) WHERE (boxes_archived_at IS NOT NULL);

--
-- Name: workspaces_is_sandbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_is_sandbox_idx ON public.workspaces USING btree (is_sandbox) WHERE is_sandbox;

--
-- Name: workspaces_onboarded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_onboarded_at_idx ON public.workspaces USING btree (onboarded_at) WHERE (onboarded_at IS NOT NULL);

--
-- Name: workspaces_renewal_reminder_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_renewal_reminder_at_idx ON public.workspaces USING btree (renewal_reminder_at) WHERE (renewal_reminder_at IS NOT NULL);

--
-- Name: workspaces_subscription_cancel_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_subscription_cancel_at_idx ON public.workspaces USING btree (subscription_cancel_at) WHERE (subscription_cancel_at IS NOT NULL);

--
-- Name: workspaces_trial_ends_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_trial_ends_at_idx ON public.workspaces USING btree (trial_ends_at) WHERE (trial_ends_at IS NOT NULL);

--
-- Name: agents getting_started_on_agent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER getting_started_on_agent AFTER INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION public.getting_started_on_agent();

--
-- Name: workspace_invitations getting_started_on_invitation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER getting_started_on_invitation AFTER INSERT ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION public.getting_started_on_invitation();

--
-- Name: workspace_members getting_started_on_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER getting_started_on_member AFTER INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.getting_started_on_member();

--
-- Name: session_reads session_reads_stamp_seen_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_reads_stamp_seen_at BEFORE INSERT OR UPDATE ON public.session_reads FOR EACH ROW EXECUTE FUNCTION public.session_reads_stamp_seen_at();

--
-- Name: sessions sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

--
-- Name: sessions trg_session_status_to_agent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_session_status_to_agent AFTER INSERT OR UPDATE OF status ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_agent_status_from_sessions();

--
-- Name: users users_lock_workspace_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_lock_workspace_id BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.prevent_user_workspace_change();

--
-- Name: agent_shares agent_shares_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_shares
    ADD CONSTRAINT agent_shares_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: agent_shares agent_shares_source_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_shares
    ADD CONSTRAINT agent_shares_source_agent_id_fkey FOREIGN KEY (source_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

--
-- Name: agent_shares agent_shares_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_shares
    ADD CONSTRAINT agent_shares_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: agents agents_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_space_id_fkey FOREIGN KEY (space_id, workspace_id) REFERENCES public.spaces(id, workspace_id) ON DELETE CASCADE;

--
-- Name: agents agents_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;

--
-- Name: agents agents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: api_keys api_keys_bound_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_bound_agent_id_fkey FOREIGN KEY (bound_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: api_keys api_keys_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: api_keys api_keys_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: app_connection_agents app_connection_agents_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_agents
    ADD CONSTRAINT app_connection_agents_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: app_connection_agents app_connection_agents_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_agents
    ADD CONSTRAINT app_connection_agents_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.app_connections(id) ON DELETE CASCADE;

--
-- Name: app_connections app_connections_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: app_connections app_connections_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: app_trial_claims app_trial_claims_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_trial_claims
    ADD CONSTRAINT app_trial_claims_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: connector_requests connector_requests_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_requests
    ADD CONSTRAINT connector_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

--
-- Name: creator_accounts creator_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_accounts
    ADD CONSTRAINT creator_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: device_tokens device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: engine_box_metrics engine_box_metrics_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_box_metrics
    ADD CONSTRAINT engine_box_metrics_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.engine_hosts(id) ON DELETE CASCADE;

--
-- Name: engine_host_metrics engine_host_metrics_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_host_metrics
    ADD CONSTRAINT engine_host_metrics_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.engine_hosts(id) ON DELETE CASCADE;

--
-- Name: engine_pairing_tokens engine_pairing_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pairing_tokens
    ADD CONSTRAINT engine_pairing_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: engine_pairing_tokens engine_pairing_tokens_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pairing_tokens
    ADD CONSTRAINT engine_pairing_tokens_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: engine_pool engine_pool_claimed_by_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pool
    ADD CONSTRAINT engine_pool_claimed_by_workspace_id_fkey FOREIGN KEY (claimed_by_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

--
-- Name: engine_pool engine_pool_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_pool
    ADD CONSTRAINT engine_pool_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.engine_hosts(id) ON DELETE SET NULL;

--
-- Name: expert_email_opt_outs expert_email_opt_outs_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_email_opt_outs
    ADD CONSTRAINT expert_email_opt_outs_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.experts(id) ON DELETE SET NULL;

--
-- Name: expert_hire_requests expert_hire_requests_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_hire_requests
    ADD CONSTRAINT expert_hire_requests_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.experts(id) ON DELETE CASCADE;

--
-- Name: experts experts_application_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_application_reviewed_by_fkey FOREIGN KEY (application_reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: invitation_redemptions invitation_redemptions_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_redemptions
    ADD CONSTRAINT invitation_redemptions_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.invitation_codes(id) ON DELETE CASCADE;

--
-- Name: invitation_redemptions invitation_redemptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_redemptions
    ADD CONSTRAINT invitation_redemptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: lifecycle_emails lifecycle_emails_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lifecycle_emails
    ADD CONSTRAINT lifecycle_emails_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: lifecycle_emails lifecycle_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lifecycle_emails
    ADD CONSTRAINT lifecycle_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: lifecycle_emails lifecycle_emails_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lifecycle_emails
    ADD CONSTRAINT lifecycle_emails_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: lumvika_usage_events lumvika_usage_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumvika_usage_events
    ADD CONSTRAINT lumvika_usage_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: message_feedback message_feedback_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

--
-- Name: message_feedback message_feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

--
-- Name: message_feedback message_feedback_steward_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_steward_conversation_id_fkey FOREIGN KEY (steward_conversation_id) REFERENCES public.steward_conversations(id) ON DELETE SET NULL;

--
-- Name: message_feedback message_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: message_feedback message_feedback_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_feedback
    ADD CONSTRAINT message_feedback_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: newsletter_recipients newsletter_recipients_send_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_send_id_fkey FOREIGN KEY (send_id) REFERENCES public.newsletter_sends(id) ON DELETE CASCADE;

--
-- Name: newsletter_recipients newsletter_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: newsletter_sends newsletter_sends_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_sends
    ADD CONSTRAINT newsletter_sends_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: notification_email_dispatches notification_email_dispatches_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_dispatches
    ADD CONSTRAINT notification_email_dispatches_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;

--
-- Name: notification_email_dispatches notification_email_dispatches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_dispatches
    ADD CONSTRAINT notification_email_dispatches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: notification_email_dispatches notification_email_dispatches_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_dispatches
    ADD CONSTRAINT notification_email_dispatches_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: notification_email_suppressions notification_email_suppressions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_suppressions
    ADD CONSTRAINT notification_email_suppressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: notification_incidents notification_incidents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_incidents
    ADD CONSTRAINT notification_incidents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: notification_push_dispatches notification_push_dispatches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_push_dispatches
    ADD CONSTRAINT notification_push_dispatches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: notifications notifications_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

--
-- Name: notifications notifications_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE SET NULL;

--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: paid_data_events paid_data_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_data_events
    ADD CONSTRAINT paid_data_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: published_access_codes published_access_codes_published_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_access_codes
    ADD CONSTRAINT published_access_codes_published_file_id_fkey FOREIGN KEY (published_file_id) REFERENCES public.published_files(id) ON DELETE CASCADE;

--
-- Name: published_files published_files_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_files
    ADD CONSTRAINT published_files_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: published_files published_files_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_files
    ADD CONSTRAINT published_files_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE SET NULL;

--
-- Name: published_files published_files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_files
    ADD CONSTRAINT published_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: service_alternatives service_alternatives_alternative_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_alternatives
    ADD CONSTRAINT service_alternatives_alternative_slug_fkey FOREIGN KEY (alternative_slug) REFERENCES public.services(slug) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: service_alternatives service_alternatives_service_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_alternatives
    ADD CONSTRAINT service_alternatives_service_slug_fkey FOREIGN KEY (service_slug) REFERENCES public.services(slug) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: session_participants session_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

--
-- Name: session_participants session_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: session_reads session_reads_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reads
    ADD CONSTRAINT session_reads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

--
-- Name: session_reads session_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reads
    ADD CONSTRAINT session_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: sessions sessions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: sessions sessions_origin_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_origin_agent_id_fkey FOREIGN KEY (origin_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

--
-- Name: space_members space_members_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_members
    ADD CONSTRAINT space_members_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: space_members space_members_space_id_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_members
    ADD CONSTRAINT space_members_space_id_workspace_id_fkey FOREIGN KEY (space_id, workspace_id) REFERENCES public.spaces(id, workspace_id) ON DELETE CASCADE;

--
-- Name: space_members space_members_user_id_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_members
    ADD CONSTRAINT space_members_user_id_workspace_id_fkey FOREIGN KEY (user_id, workspace_id) REFERENCES public.workspace_members(user_id, workspace_id) ON DELETE CASCADE;

--
-- Name: spaces spaces_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

--
-- Name: steward_builds steward_builds_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steward_builds
    ADD CONSTRAINT steward_builds_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: steward_conversations steward_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steward_conversations
    ADD CONSTRAINT steward_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: steward_conversations steward_conversations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steward_conversations
    ADD CONSTRAINT steward_conversations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: template_purchases template_purchases_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: template_purchases template_purchases_purchased_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_purchased_by_fkey FOREIGN KEY (purchased_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: template_purchases template_purchases_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE RESTRICT;

--
-- Name: template_purchases template_purchases_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: template_sales template_sales_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sales
    ADD CONSTRAINT template_sales_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: template_sales template_sales_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sales
    ADD CONSTRAINT template_sales_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.template_purchases(id) ON DELETE SET NULL;

--
-- Name: template_sales template_sales_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sales
    ADD CONSTRAINT template_sales_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;

--
-- Name: template_sales template_sales_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sales
    ADD CONSTRAINT template_sales_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

--
-- Name: templates templates_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: trial_card_fingerprints trial_card_fingerprints_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_card_fingerprints
    ADD CONSTRAINT trial_card_fingerprints_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

--
-- Name: user_presence user_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: users users_expert_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_expert_profile_id_fkey FOREIGN KEY (expert_profile_id) REFERENCES public.experts(id) ON DELETE SET NULL;

--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: users users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: web_fetch_events web_fetch_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_fetch_events
    ADD CONSTRAINT web_fetch_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: web_search_events web_search_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_search_events
    ADD CONSTRAINT web_search_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: whatsapp_messages whatsapp_messages_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

--
-- Name: whatsapp_messages whatsapp_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: whatsapp_messages whatsapp_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_apps workspace_apps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_apps
    ADD CONSTRAINT workspace_apps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_archives workspace_archives_reactivation_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_reactivation_reviewed_by_fkey FOREIGN KEY (reactivation_reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: workspace_archives workspace_archives_restored_to_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_restored_to_instance_id_fkey FOREIGN KEY (restored_to_instance_id) REFERENCES public.engine_pool(id) ON DELETE SET NULL;

--
-- Name: workspace_archives workspace_archives_source_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_source_host_id_fkey FOREIGN KEY (source_host_id) REFERENCES public.engine_hosts(id) ON DELETE SET NULL;

--
-- Name: workspace_archives workspace_archives_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_archives
    ADD CONSTRAINT workspace_archives_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_getting_started workspace_getting_started_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_getting_started
    ADD CONSTRAINT workspace_getting_started_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_invitations workspace_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: workspace_invitations workspace_invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_onboarding workspace_onboarding_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_onboarding
    ADD CONSTRAINT workspace_onboarding_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_rewind_views workspace_rewind_views_rewind_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewind_views
    ADD CONSTRAINT workspace_rewind_views_rewind_id_fkey FOREIGN KEY (rewind_id) REFERENCES public.workspace_rewinds(id) ON DELETE CASCADE;

--
-- Name: workspace_rewind_views workspace_rewind_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewind_views
    ADD CONSTRAINT workspace_rewind_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: workspace_rewinds workspace_rewinds_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_rewinds
    ADD CONSTRAINT workspace_rewinds_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspaces workspaces_renewal_reminder_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_renewal_reminder_user_id_fkey FOREIGN KEY (renewal_reminder_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: workspace_members Members can view their own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their own memberships" ON public.workspace_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: session_participants Members read the participants of their workspace sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read the participants of their workspace sessions" ON public.session_participants FOR SELECT TO authenticated USING ((session_id IN ( SELECT s.id
   FROM public.sessions s
  WHERE (s.agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)))));

--
-- Name: session_reads Members read their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read their own reads" ON public.session_reads FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: workspace_getting_started Members read their workspace checklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read their workspace checklist" ON public.workspace_getting_started FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

--
-- Name: workspace_onboarding Members read their workspace onboarding; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read their workspace onboarding" ON public.workspace_onboarding FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

--
-- Name: session_reads Members record their own reads in their workspace sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members record their own reads in their workspace sessions" ON public.session_reads FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (session_id IN ( SELECT s.id
   FROM public.sessions s
  WHERE (s.agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids))))));

--
-- Name: session_reads Members update their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update their own reads" ON public.session_reads FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: blog_posts Public can read published posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published posts" ON public.blog_posts FOR SELECT USING ((published = true));

--
-- Name: agents Users can delete agents in their workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete agents in their workspace" ON public.agents FOR DELETE USING ((id IN ( SELECT public.manageable_agent_ids() AS manageable_agent_ids)));

--
-- Name: sessions Users can delete sessions for their agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete sessions for their agents" ON public.sessions FOR DELETE USING ((agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: agents Users can insert agents in their workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert agents in their workspace" ON public.agents FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)) AND (space_id IN ( SELECT public.manageable_space_ids() AS manageable_space_ids))));

--
-- Name: sessions Users can insert sessions for their agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert sessions for their agents" ON public.sessions FOR INSERT WITH CHECK ((agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: agents Users can update agents in their workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update agents in their workspace" ON public.agents FOR UPDATE USING ((id IN ( SELECT public.manageable_agent_ids() AS manageable_agent_ids))) WITH CHECK ((space_id IN ( SELECT public.manageable_space_ids() AS manageable_space_ids)));

--
-- Name: sessions Users can update sessions for their agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update sessions for their agents" ON public.sessions FOR UPDATE USING ((agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: users Users can update their own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own record" ON public.users FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

--
-- Name: agents Users can view agents in their workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agents in their workspace" ON public.agents FOR SELECT USING ((id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: sessions Users can view sessions for their agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view sessions for their agents" ON public.sessions FOR SELECT USING ((agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: users Users can view their own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own record" ON public.users FOR SELECT USING ((auth.uid() = id));

--
-- Name: workspaces Users can view their workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their workspace" ON public.workspaces FOR SELECT TO authenticated USING ((id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

--
-- Name: agent_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: templates anon reads public templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon reads public templates" ON public.templates FOR SELECT TO anon USING (((status = 'unlisted'::public.template_status) OR ((status = 'published'::public.template_status) AND show_in_marketplace)));

--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connection_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connection_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connection_agents app_connection_agents_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_connection_agents_select_workspace_members ON public.app_connection_agents FOR SELECT TO authenticated USING ((agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids)));

--
-- Name: app_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connections app_connections_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_connections_select_workspace_members ON public.app_connections FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));

--
-- Name: app_trial_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_trial_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: app_usage_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_usage_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: app_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: blocked_email_domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: changelog_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: changelog_entries changelog_entries_select_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY changelog_entries_select_published ON public.changelog_entries FOR SELECT TO authenticated, anon USING (((published_at IS NOT NULL) AND (published_at <= now())));

--
-- Name: connector_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connector_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: creator_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.creator_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sign_up_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sign_up_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_box_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_box_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_host_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_host_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_hosts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_hosts ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_pairing_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_pairing_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_pool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_pool ENABLE ROW LEVEL SECURITY;

--
-- Name: expert_email_opt_outs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expert_email_opt_outs ENABLE ROW LEVEL SECURITY;

--
-- Name: expert_hire_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expert_hire_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: experts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experts ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: lifecycle_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lifecycle_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: lumvika_usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lumvika_usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: templates members read listed templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read listed templates" ON public.templates FOR SELECT TO authenticated USING (((status = 'unlisted'::public.template_status) OR ((status = 'published'::public.template_status) AND (show_in_marketplace OR show_in_library))));

--
-- Name: message_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_email_dispatches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_email_dispatches ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_push_dispatches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_push_dispatches ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_workspace_members ON public.notifications FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)) AND ((agent_id IS NULL) OR (agent_id IN ( SELECT public.visible_agent_ids() AS visible_agent_ids))) AND ((space_id IS NULL) OR (space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)))));

--
-- Name: oauth_pending_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_pending_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: space_members own rows or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own rows or admin" ON public.space_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (workspace_id IN ( SELECT public.current_admin_workspace_ids() AS current_admin_workspace_ids))));

--
-- Name: paid_data_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_data_events ENABLE ROW LEVEL SECURITY;

--
-- Name: services public read enabled services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read enabled services" ON public.services FOR SELECT TO authenticated, anon USING (enabled);

--
-- Name: experts public read published experts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read published experts" ON public.experts FOR SELECT TO authenticated, anon USING ((status = 'published'::public.expert_status));

--
-- Name: service_alternatives public read service alternatives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read service alternatives" ON public.service_alternatives FOR SELECT TO authenticated, anon USING (true);

--
-- Name: published_access_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.published_access_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: published_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.published_files ENABLE ROW LEVEL SECURITY;

--
-- Name: published_gate_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.published_gate_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: service_alternatives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_alternatives ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: session_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: session_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: space_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

--
-- Name: spaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

--
-- Name: spaces spaces_delete_own_workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spaces_delete_own_workspace ON public.spaces FOR DELETE USING ((id IN ( SELECT public.manageable_space_ids() AS manageable_space_ids)));

--
-- Name: spaces spaces_insert_own_workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spaces_insert_own_workspace ON public.spaces FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

--
-- Name: spaces spaces_select_own_workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spaces_select_own_workspace ON public.spaces FOR SELECT USING ((id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

--
-- Name: spaces spaces_update_own_workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spaces_update_own_workspace ON public.spaces FOR UPDATE USING ((id IN ( SELECT public.manageable_space_ids() AS manageable_space_ids))) WITH CHECK ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

--
-- Name: steward_builds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.steward_builds ENABLE ROW LEVEL SECURITY;

--
-- Name: steward_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.steward_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: steward_conversations steward_conversations_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY steward_conversations_select_own ON public.steward_conversations FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid())))));

--
-- Name: stripe_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

--
-- Name: template_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: template_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_card_fingerprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_card_fingerprints ENABLE ROW LEVEL SECURITY;

--
-- Name: user_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: web_fetch_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.web_fetch_events ENABLE ROW LEVEL SECURITY;

--
-- Name: web_search_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.web_search_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: web_search_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.web_search_events ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_apps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_apps ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_apps workspace_apps_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_apps_select_workspace_members ON public.workspace_apps FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));

--
-- Name: workspace_archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_getting_started; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_getting_started ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_onboarding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_onboarding ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_rewind_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_rewind_views ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_rewind_views workspace_rewind_views_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_rewind_views_insert_own ON public.workspace_rewind_views FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (rewind_id IN ( SELECT workspace_rewinds.id
   FROM public.workspace_rewinds
  WHERE (workspace_rewinds.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid())))))));

--
-- Name: workspace_rewind_views workspace_rewind_views_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_rewind_views_select_own ON public.workspace_rewind_views FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: workspace_rewinds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_rewinds ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_rewinds workspace_rewinds_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_rewinds_select_workspace_members ON public.workspace_rewinds FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

--
-- Name: FUNCTION claim_app_quota(p_scope text, p_action text, p_periods text[], p_maxes integer[], p_amount integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_app_quota(p_scope text, p_action text, p_periods text[], p_maxes integer[], p_amount integer) FROM PUBLIC;

--
-- Name: FUNCTION claim_email_sign_up(p_ip text, p_ip_max integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_email_sign_up(p_ip text, p_ip_max integer, p_window_seconds integer) FROM PUBLIC;

--
-- Name: FUNCTION claim_published_gate_attempt(p_scopes text[], p_max integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_published_gate_attempt(p_scopes text[], p_max integer, p_window_seconds integer) FROM PUBLIC;

--
-- Name: FUNCTION consume_lumvika_credit(p_workspace_id bigint, p_micros bigint); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION current_admin_workspace_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_admin_workspace_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_admin_workspace_ids() TO authenticated;

--
-- Name: FUNCTION current_workspace_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_workspace_ids() TO authenticated;

--
-- Name: FUNCTION email_domain_is_blocked(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.email_domain_is_blocked(p_email text) FROM PUBLIC;

--
-- Name: FUNCTION engine_box_metric_series(p_host_id uuid, p_from timestamp with time zone, p_bucket interval, p_top integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.engine_box_metric_series(p_host_id uuid, p_from timestamp with time zone, p_bucket interval, p_top integer) FROM PUBLIC;

--
-- Name: FUNCTION engine_host_metric_series(p_from timestamp with time zone, p_bucket interval); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.engine_host_metric_series(p_from timestamp with time zone, p_bucket interval) FROM PUBLIC;

--
-- Name: FUNCTION getting_started_on_agent(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.getting_started_on_agent() FROM PUBLIC;

--
-- Name: FUNCTION getting_started_on_invitation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.getting_started_on_invitation() FROM PUBLIC;

--
-- Name: FUNCTION getting_started_on_member(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.getting_started_on_member() FROM PUBLIC;

--
-- Name: FUNCTION grant_lumvika_topup(p_workspace_id bigint, p_micros bigint); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION lumvika_credit_usage(p_workspace_id bigint, p_since timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lumvika_credit_usage(p_workspace_id bigint, p_since timestamp with time zone) FROM PUBLIC;

--
-- Name: FUNCTION manageable_agent_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manageable_agent_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.manageable_agent_ids() TO authenticated;

--
-- Name: FUNCTION manageable_space_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manageable_space_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.manageable_space_ids() TO authenticated;

--
-- Name: FUNCTION mark_getting_started(p_workspace_id bigint, p_item text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_getting_started(p_workspace_id bigint, p_item text) FROM PUBLIC;

--
-- Name: FUNCTION match_services(query_embedding public.vector, match_count integer, match_threshold double precision, filter_category text); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION open_notification_incident(p_user_id uuid, p_source_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.open_notification_incident(p_user_id uuid, p_source_key text) FROM PUBLIC;

--
-- Name: FUNCTION prevent_user_workspace_change(); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION resolve_notification_incidents(p_source_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_notification_incidents(p_source_key text) FROM PUBLIC;

--
-- Name: FUNCTION session_reads_stamp_seen_at(); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION touch_sandbox_activity(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_sandbox_activity(p_user_id uuid) FROM PUBLIC;

--
-- Name: FUNCTION unseen_runs(p_workspace_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unseen_runs(p_workspace_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unseen_runs(p_workspace_id integer) TO authenticated;

--
-- Name: FUNCTION update_agent_status_from_sessions(); Type: ACL; Schema: public; Owner: -
--

--
-- Name: FUNCTION visible_agent_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visible_agent_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visible_agent_ids() TO authenticated;

--
-- Name: FUNCTION visible_space_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visible_space_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visible_space_ids() TO authenticated;

--
-- Name: TABLE agent_shares; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE agents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agents TO anon;
GRANT ALL ON TABLE public.agents TO authenticated;

--
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;

--
-- Name: TABLE app_connection_agents; Type: ACL; Schema: public; Owner: -
--

--
-- Name: COLUMN app_connection_agents.agent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(agent_id) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: COLUMN app_connection_agents.app_slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(app_slug) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: COLUMN app_connection_agents.connection_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connection_id) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: COLUMN app_connection_agents.wake_on_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wake_on_events) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: COLUMN app_connection_agents.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: COLUMN app_connection_agents.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.app_connection_agents TO authenticated;

--
-- Name: TABLE app_connections; Type: ACL; Schema: public; Owner: -
--

--
-- Name: COLUMN app_connections.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.workspace_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(workspace_id) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.app_slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(app_slug) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.provider_account_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider_account_id) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.provider_member_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider_member_id) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.label; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(label) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.connected_by; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connected_by) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.paused_until; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(paused_until) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.pause_reason; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(pause_reason) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.last_event_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_event_at) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.app_connections TO authenticated;

--
-- Name: COLUMN app_connections.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.app_connections TO authenticated;

--
-- Name: TABLE app_trial_claims; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE app_usage_counters; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE app_webhook_events; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE blocked_email_domains; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocked_email_domains TO anon;
GRANT ALL ON TABLE public.blocked_email_domains TO authenticated;

--
-- Name: TABLE blog_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blog_posts TO anon;
GRANT ALL ON TABLE public.blog_posts TO authenticated;

--
-- Name: TABLE changelog_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.changelog_entries TO anon;
GRANT SELECT ON TABLE public.changelog_entries TO authenticated;

--
-- Name: TABLE connector_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connector_requests TO anon;
GRANT ALL ON TABLE public.connector_requests TO authenticated;

--
-- Name: TABLE creator_accounts; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE device_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_tokens TO anon;
GRANT ALL ON TABLE public.device_tokens TO authenticated;

--
-- Name: TABLE email_sign_up_limits; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE engine_box_metrics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_box_metrics TO anon;
GRANT ALL ON TABLE public.engine_box_metrics TO authenticated;

--
-- Name: TABLE engine_host_metrics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_host_metrics TO anon;
GRANT ALL ON TABLE public.engine_host_metrics TO authenticated;

--
-- Name: TABLE engine_hosts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_hosts TO anon;
GRANT ALL ON TABLE public.engine_hosts TO authenticated;

--
-- Name: TABLE engine_pairing_tokens; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE engine_pool; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_pool TO anon;
GRANT ALL ON TABLE public.engine_pool TO authenticated;

--
-- Name: TABLE expert_email_opt_outs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expert_email_opt_outs TO anon;
GRANT ALL ON TABLE public.expert_email_opt_outs TO authenticated;

--
-- Name: TABLE expert_hire_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expert_hire_requests TO anon;
GRANT ALL ON TABLE public.expert_hire_requests TO authenticated;

--
-- Name: TABLE experts; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.experts TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.experts TO anon;
GRANT SELECT(id) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(slug) ON TABLE public.experts TO anon;
GRANT SELECT(slug) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.experts TO anon;
GRANT SELECT(name) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(type) ON TABLE public.experts TO anon;
GRANT SELECT(type) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.location; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(location) ON TABLE public.experts TO anon;
GRANT SELECT(location) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.bio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bio) ON TABLE public.experts TO anon;
GRANT SELECT(bio) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.budget; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(budget) ON TABLE public.experts TO anon;
GRANT SELECT(budget) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.avatar_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(avatar_url) ON TABLE public.experts TO anon;
GRANT SELECT(avatar_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.banner_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(banner_url) ON TABLE public.experts TO anon;
GRANT SELECT(banner_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.skills; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(skills) ON TABLE public.experts TO anon;
GRANT SELECT(skills) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.languages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(languages) ON TABLE public.experts TO anon;
GRANT SELECT(languages) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.x_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(x_url) ON TABLE public.experts TO anon;
GRANT SELECT(x_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.linkedin_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(linkedin_url) ON TABLE public.experts TO anon;
GRANT SELECT(linkedin_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.github_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(github_url) ON TABLE public.experts TO anon;
GRANT SELECT(github_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.website_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(website_url) ON TABLE public.experts TO anon;
GRANT SELECT(website_url) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.featured; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(featured) ON TABLE public.experts TO anon;
GRANT SELECT(featured) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.experts TO anon;
GRANT SELECT(status) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.experts TO anon;
GRANT SELECT(created_at) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.experts TO anon;
GRANT SELECT(updated_at) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.availability; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(availability) ON TABLE public.experts TO anon;
GRANT SELECT(availability) ON TABLE public.experts TO authenticated;

--
-- Name: COLUMN experts.seo_indexed; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(seo_indexed) ON TABLE public.experts TO anon;
GRANT SELECT(seo_indexed) ON TABLE public.experts TO authenticated;

--
-- Name: TABLE invitation_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitation_codes TO anon;
GRANT ALL ON TABLE public.invitation_codes TO authenticated;

--
-- Name: TABLE invitation_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitation_redemptions TO anon;
GRANT ALL ON TABLE public.invitation_redemptions TO authenticated;

--
-- Name: TABLE lifecycle_emails; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE lumvika_usage_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lumvika_usage_events TO anon;
GRANT ALL ON TABLE public.lumvika_usage_events TO authenticated;

--
-- Name: TABLE message_feedback; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE newsletter_recipients; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE newsletter_sends; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE notification_email_dispatches; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE notification_email_suppressions; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE notification_incidents; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE notification_push_dispatches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_push_dispatches TO anon;
GRANT ALL ON TABLE public.notification_push_dispatches TO authenticated;

--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;

--
-- Name: TABLE oauth_pending_grants; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE paid_data_events; Type: ACL; Schema: public; Owner: -
--

--
-- Name: SEQUENCE paid_data_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE ON SEQUENCE public.paid_data_events_id_seq TO anon;
GRANT UPDATE ON SEQUENCE public.paid_data_events_id_seq TO authenticated;

--
-- Name: TABLE published_access_codes; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE published_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.published_files TO anon;
GRANT ALL ON TABLE public.published_files TO authenticated;

--
-- Name: TABLE published_gate_attempts; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE service_alternatives; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.service_alternatives TO anon;
GRANT SELECT ON TABLE public.service_alternatives TO authenticated;

--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.services TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.services TO authenticated;

--
-- Name: COLUMN services.slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(slug) ON TABLE public.services TO anon;
GRANT SELECT(slug) ON TABLE public.services TO authenticated;

--
-- Name: COLUMN services.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.services TO anon;
GRANT SELECT(name) ON TABLE public.services TO authenticated;

--
-- Name: COLUMN services.category; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(category) ON TABLE public.services TO anon;
GRANT SELECT(category) ON TABLE public.services TO authenticated;

--
-- Name: COLUMN services.icon; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(icon) ON TABLE public.services TO anon;
GRANT SELECT(icon) ON TABLE public.services TO authenticated;

--
-- Name: COLUMN services.enabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(enabled) ON TABLE public.services TO anon;
GRANT SELECT(enabled) ON TABLE public.services TO authenticated;

--
-- Name: TABLE session_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_participants TO anon;
GRANT ALL ON TABLE public.session_participants TO authenticated;

--
-- Name: TABLE session_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_reads TO anon;
GRANT ALL ON TABLE public.session_reads TO authenticated;

--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sessions TO anon;
GRANT ALL ON TABLE public.sessions TO authenticated;

--
-- Name: TABLE space_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.space_members TO authenticated;

--
-- Name: TABLE spaces; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.spaces TO anon;
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id),INSERT(id),UPDATE(id) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.workspace_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(workspace_id),INSERT(workspace_id) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name),INSERT(name),UPDATE(name) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.col_start; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(col_start),INSERT(col_start),UPDATE(col_start) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.row_start; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(row_start),INSERT(row_start),UPDATE(row_start) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.col_end; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(col_end),INSERT(col_end),UPDATE(col_end) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.row_end; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(row_end),INSERT(row_end),UPDATE(row_end) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at),INSERT(created_at),UPDATE(created_at) ON TABLE public.spaces TO authenticated;

--
-- Name: COLUMN spaces.visibility; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(visibility) ON TABLE public.spaces TO authenticated;

--
-- Name: TABLE steward_builds; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE steward_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.steward_conversations TO authenticated;

--
-- Name: TABLE stripe_events; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE template_purchases; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE template_sales; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE templates; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.templates TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.templates TO anon;
GRANT SELECT(id) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(slug) ON TABLE public.templates TO anon;
GRANT SELECT(slug) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.title; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(title) ON TABLE public.templates TO anon;
GRANT SELECT(title) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.tagline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(tagline) ON TABLE public.templates TO anon;
GRANT SELECT(tagline) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.long_description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(long_description) ON TABLE public.templates TO anon;
GRANT SELECT(long_description) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.category; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(category) ON TABLE public.templates TO anon;
GRANT SELECT(category) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.tags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(tags) ON TABLE public.templates TO anon;
GRANT SELECT(tags) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.gallery; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(gallery) ON TABLE public.templates TO anon;
GRANT SELECT(gallery) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.video_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(video_url) ON TABLE public.templates TO anon;
GRANT SELECT(video_url) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.og_image_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(og_image_url) ON TABLE public.templates TO anon;
GRANT SELECT(og_image_url) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.meta_title; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(meta_title) ON TABLE public.templates TO anon;
GRANT SELECT(meta_title) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.meta_description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(meta_description) ON TABLE public.templates TO anon;
GRANT SELECT(meta_description) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.setup_minutes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(setup_minutes) ON TABLE public.templates TO anon;
GRANT SELECT(setup_minutes) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.featured; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(featured) ON TABLE public.templates TO anon;
GRANT SELECT(featured) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.templates TO anon;
GRANT SELECT(status) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.published_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(published_at) ON TABLE public.templates TO anon;
GRANT SELECT(published_at) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.templates TO anon;
GRANT SELECT(created_at) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.templates TO anon;
GRANT SELECT(updated_at) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.show_in_marketplace; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(show_in_marketplace) ON TABLE public.templates TO anon;
GRANT SELECT(show_in_marketplace) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.show_in_library; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(show_in_library) ON TABLE public.templates TO anon;
GRANT SELECT(show_in_library) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.agents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(agents) ON TABLE public.templates TO anon;
GRANT SELECT(agents) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.connectors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connectors) ON TABLE public.templates TO anon;
GRANT SELECT(connectors) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.agent_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(agent_count) ON TABLE public.templates TO anon;
GRANT SELECT(agent_count) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.faq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(faq) ON TABLE public.templates TO anon;
GRANT SELECT(faq) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.pricing_model; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(pricing_model) ON TABLE public.templates TO anon;
GRANT SELECT(pricing_model) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.price_amount_cents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price_amount_cents) ON TABLE public.templates TO anon;
GRANT SELECT(price_amount_cents) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.price_currency; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price_currency) ON TABLE public.templates TO anon;
GRANT SELECT(price_currency) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.card_image_dark_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(card_image_dark_url) ON TABLE public.templates TO anon;
GRANT SELECT(card_image_dark_url) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.card_image_light_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(card_image_light_url) ON TABLE public.templates TO anon;
GRANT SELECT(card_image_light_url) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.story; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(story) ON TABLE public.templates TO anon;
GRANT SELECT(story) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.lead_magnet; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(lead_magnet) ON TABLE public.templates TO anon;
GRANT SELECT(lead_magnet) ON TABLE public.templates TO authenticated;

--
-- Name: COLUMN templates.role_page; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(role_page) ON TABLE public.templates TO anon;
GRANT SELECT(role_page) ON TABLE public.templates TO authenticated;

--
-- Name: TABLE trial_card_fingerprints; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE user_presence; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.users TO authenticated;

--
-- Name: TABLE web_fetch_events; Type: ACL; Schema: public; Owner: -
--

--
-- Name: SEQUENCE web_fetch_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE ON SEQUENCE public.web_fetch_events_id_seq TO anon;
GRANT UPDATE ON SEQUENCE public.web_fetch_events_id_seq TO authenticated;

--
-- Name: TABLE web_search_cache; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE web_search_events; Type: ACL; Schema: public; Owner: -
--

--
-- Name: SEQUENCE web_search_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE ON SEQUENCE public.web_search_events_id_seq TO anon;
GRANT UPDATE ON SEQUENCE public.web_search_events_id_seq TO authenticated;

--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE workspace_apps; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.workspace_apps TO authenticated;

--
-- Name: TABLE workspace_archives; Type: ACL; Schema: public; Owner: -
--

--
-- Name: TABLE workspace_getting_started; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.workspace_getting_started TO authenticated;

--
-- Name: TABLE workspace_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_invitations TO anon;
GRANT ALL ON TABLE public.workspace_invitations TO authenticated;

--
-- Name: TABLE workspace_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_members TO anon;
GRANT ALL ON TABLE public.workspace_members TO authenticated;

--
-- Name: TABLE workspace_onboarding; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.workspace_onboarding TO authenticated;

--
-- Name: TABLE workspace_rewind_views; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.workspace_rewind_views TO authenticated;

--
-- Name: TABLE workspace_rewinds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.workspace_rewinds TO authenticated;

--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;

--
-- Name: SEQUENCE workspaces_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE ON SEQUENCE public.workspaces_id_seq TO anon;
GRANT UPDATE ON SEQUENCE public.workspaces_id_seq TO authenticated;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- PostgreSQL database dump complete
--
--> statement-breakpoint
-- A table created later is reachable by both roles at once and closed only by its policies:
-- packages/db/src/rls.test.ts fails while a public table has row level security off.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
