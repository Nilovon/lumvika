-- La charge des hôtes bare metal dans le temps, pour les courbes de la home de /admin. Chaque
-- hôte pousse un échantillon par minute (infra/incus-host/push-metrics.sh → POST /api/host-metrics):
-- une ligne pour l'hôte, une par box. Les débits (CPU %, octets/s, cœurs d'une box) arrivent déjà
-- calculés par l'hôte, qui garde l'échantillon précédent. RLS sans policy: seule la service role y
-- touche, comme engine_hosts. La purge (90 j hôte, 7 j box) se fait à l'ingestion.
create table "public"."engine_host_metrics" (
    "host_id" uuid not null,
    "sampled_at" timestamp with time zone not null,
    "cpu_pct" real,
    "load1" real not null,
    "load5" real not null,
    "load15" real not null,
    "cores" smallint not null,
    "mem_total_mb" integer not null,
    "mem_available_mb" integer not null,
    "arc_mb" integer,
    "swap_total_mb" integer not null,
    "swap_used_mb" integer not null,
    "psi_cpu" real,
    "psi_mem" real,
    "psi_io" real,
    "disk_total_gb" real,
    "disk_used_gb" real,
    "net_rx_bps" bigint,
    "net_tx_bps" bigint,
    "boxes_running" smallint not null,
    "boxes_total" smallint not null,
    "active_runs" smallint not null
);

alter table "public"."engine_host_metrics" enable row level security;

alter table "public"."engine_host_metrics" add constraint "engine_host_metrics_pkey" primary key ("host_id", "sampled_at");
alter table "public"."engine_host_metrics" add constraint "engine_host_metrics_host_id_fkey"
    foreign key ("host_id") references "public"."engine_hosts"("id") on delete cascade;

create table "public"."engine_box_metrics" (
    "host_id" uuid not null,
    "box_name" text not null,
    "sampled_at" timestamp with time zone not null,
    "running" boolean not null,
    -- RSS du process QEMU sur l'hôte: la RAM que la box coûte vraiment, pas celle que le guest croit utiliser.
    "rss_mb" integer,
    -- Cœurs hôte consommés en moyenne sur la dernière minute (2,0 = ses deux vCPU à fond).
    "cpu_cores" real,
    "active_runs" smallint,
    "engine_ok" boolean not null
);

alter table "public"."engine_box_metrics" enable row level security;

alter table "public"."engine_box_metrics" add constraint "engine_box_metrics_pkey" primary key ("host_id", "box_name", "sampled_at");
alter table "public"."engine_box_metrics" add constraint "engine_box_metrics_host_id_fkey"
    foreign key ("host_id") references "public"."engine_hosts"("id") on delete cascade;

create index engine_box_metrics_host_sampled_idx on "public"."engine_box_metrics" ("host_id", "sampled_at");

-- Les courbes d'un hôte par tranche de p_bucket depuis p_from: moyennes, plus les pics de CPU et
-- de load, qu'une moyenne sur une heure effacerait. Une ligne par hôte, ses points en jsonb:
-- PostgREST coupe une réponse à max_rows (1000), qu'une ligne par point dépasserait vite.
create or replace function public.engine_host_metric_series(p_from timestamptz, p_bucket interval)
returns table (host_id uuid, points jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
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

-- Les courbes des boxes d'un hôte, limitées aux p_top plus grosses en RAM et aux p_top plus
-- gourmandes en CPU sur la fenêtre: au-delà, un graphe à 50 courbes ne se lit plus. Une ligne
-- par box, pour la même raison de max_rows.
create or replace function public.engine_box_metric_series(p_host_id uuid, p_from timestamptz, p_bucket interval, p_top integer)
returns table (box_name text, points jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
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

-- Lues par le hub avec la service role uniquement: l'utilisation des machines n'a rien à faire
-- dans le navigateur d'un client.
revoke execute on function public.engine_host_metric_series(timestamptz, interval) from public, anon, authenticated;
revoke execute on function public.engine_box_metric_series(uuid, timestamptz, interval, integer) from public, anon, authenticated;
