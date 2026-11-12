-- `issue_touches` (migration 20261112170000): the last touch of each issue by its assignee, by
-- anyone else and by a person's comment, exact per issue however much activity the workspace holds,
-- and readable only by the service role.
-- Runs with `pnpm exec supabase test db` on the local stack; everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(10);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000b101', 'touches-admin@lumvika.test');
insert into public.workspaces (id, icon_url, name) values (990201, '', 'Touches test');
insert into public.users (id, workspace_id) values ('00000000-0000-0000-0000-00000000b101', 990201)
on conflict (id) do update set workspace_id = excluded.workspace_id;
insert into public.workspace_members (user_id, workspace_id, role, box_scope) values ('00000000-0000-0000-0000-00000000b101', 990201, 'admin', 'all');
insert into public.spaces (id, workspace_id, name, col_start, row_start, col_end, row_end) values ('00000000-0000-0000-0000-0000000db001', 990201, 'Here', 0, 0, 3, 3);
insert into public.agents (id, workspace_id, space_id, name) values
    ('00000000-0000-0000-0000-0000000eb001', 990201, '00000000-0000-0000-0000-0000000db001', 'writer'),
    ('00000000-0000-0000-0000-0000000eb002', 990201, '00000000-0000-0000-0000-0000000db001', 'scout');
insert into public.projects (id, workspace_id, key, name, visibility) values ('00000000-0000-0000-0000-0000000fb001', 990201, 'TCH', 'Touches', 'workspace');
insert into public.issues (id, workspace_id, project_id, title, status, assignee_agent_id) values
    ('00000000-0000-0000-0000-0000001b0001', 990201, '00000000-0000-0000-0000-0000000fb001', 'worked', 'blocked', '00000000-0000-0000-0000-0000000eb001'),
    ('00000000-0000-0000-0000-0000001b0002', 990201, '00000000-0000-0000-0000-0000000fb001', 'quiet', 'todo', '00000000-0000-0000-0000-0000000eb001');

insert into public.activity_events (workspace_id, project_id, issue_id, entity_type, entity_id, action, actor_user_id, actor_agent_id, created_at) values
    (990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0001', 'issue', '00000000-0000-0000-0000-0000001b0001', 'issue.created', null, '00000000-0000-0000-0000-0000000eb001', '2026-11-01T09:00:00Z'),
    (990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0001', 'issue', '00000000-0000-0000-0000-0000001b0001', 'issue.checked_out', null, '00000000-0000-0000-0000-0000000eb001', '2026-11-01T10:00:00Z'),
    (990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0001', 'issue', '00000000-0000-0000-0000-0000001b0001', 'issue.commented', '00000000-0000-0000-0000-00000000b101', null, '2026-11-01T11:00:00Z'),
    (990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0001', 'issue', '00000000-0000-0000-0000-0000001b0001', 'issue.commented', null, '00000000-0000-0000-0000-0000000eb002', '2026-11-01T12:00:00Z'),
    (990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0001', 'issue', '00000000-0000-0000-0000-0000001b0001', 'issue.released', null, null, '2026-11-01T13:00:00Z');

-- Far more activity than any window the queue used to read, all on the other issue and newer.
insert into public.activity_events (workspace_id, project_id, issue_id, entity_type, entity_id, action, actor_user_id, created_at)
select 990201, '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000001b0002', 'issue', '00000000-0000-0000-0000-0000001b0002', 'issue.updated', '00000000-0000-0000-0000-00000000b101', '2026-11-02T00:00:00Z'::timestamptz + n * interval '1 second'
from generate_series(1, 2500) as n;

select is(
    (select assignee_touched_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0001'::uuid])),
    '2026-11-01T10:00:00Z'::timestamptz,
    'the assignee touched it last when it checked it out, its own creation does not count'
);
select is(
    (select others_touched_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0001'::uuid])),
    '2026-11-01T12:00:00Z'::timestamptz,
    'another coworker commenting counts as someone else, the system releasing it does not'
);
select is(
    (select person_commented_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0001'::uuid])),
    '2026-11-01T11:00:00Z'::timestamptz,
    'the last comment of a person is kept apart'
);
select is(
    (select assignee_touched_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0001'::uuid, '00000000-0000-0000-0000-0000001b0002'::uuid]) where issue_id = '00000000-0000-0000-0000-0000001b0001'),
    '2026-11-01T10:00:00Z'::timestamptz,
    'an issue with old activity keeps it next to one with thousands of newer events'
);
select is(
    (select others_touched_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0002'::uuid])),
    '2026-11-02T00:41:40Z'::timestamptz,
    'the busy issue reads its own newest event'
);
select is(
    (select assignee_touched_at from public.issue_touches(990201, array['00000000-0000-0000-0000-0000001b0002'::uuid])),
    null,
    'an issue its assignee never touched reads null'
);
select is((select count(*)::integer from public.issue_touches(990202, array['00000000-0000-0000-0000-0000001b0001'::uuid])), 0, 'another workspace reads nothing of these issues');

delete from public.projects where id = '00000000-0000-0000-0000-0000000fb001';
select is((select count(*)::integer from public.activity_events where workspace_id = 990201), 0, 'activity goes with the project, so no touch outlives its issue');

select ok(not has_function_privilege('authenticated', 'public.issue_touches(bigint, uuid[])', 'execute'), 'a signed-in user cannot call it');
select ok(has_function_privilege('service_role', 'public.issue_touches(bigint, uuid[])', 'execute'), 'the service role can');

select * from finish();
rollback;
