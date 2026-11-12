-- RLS and triggers of the work layer (migrations 20261110120100 to 20261110120400): projects,
-- issues, channels and assistant chats seen from an admin, a member scoped to `all`, a member scoped
-- to `assigned` and someone from another workspace; the issue numbers; the reporting line of agents.
-- Runs with `pnpm exec supabase test db` on the local stack; everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(38);

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000a101', 'work-admin@lumvika.test'),
    ('00000000-0000-0000-0000-00000000a102', 'work-full@lumvika.test'),
    ('00000000-0000-0000-0000-00000000a103', 'work-assigned@lumvika.test'),
    ('00000000-0000-0000-0000-00000000a104', 'work-outsider@lumvika.test');
insert into public.workspaces (id, icon_url, name) values (990101, '', 'Work test'), (990102, '', 'Elsewhere');
insert into public.users (id, workspace_id) values
    ('00000000-0000-0000-0000-00000000a101', 990101),
    ('00000000-0000-0000-0000-00000000a102', 990101),
    ('00000000-0000-0000-0000-00000000a103', 990101),
    ('00000000-0000-0000-0000-00000000a104', 990102)
on conflict (id) do update set workspace_id = excluded.workspace_id;
insert into public.workspace_members (user_id, workspace_id, role, box_scope) values
    ('00000000-0000-0000-0000-00000000a101', 990101, 'admin', 'all'),
    ('00000000-0000-0000-0000-00000000a102', 990101, 'member', 'all'),
    ('00000000-0000-0000-0000-00000000a103', 990101, 'member', 'assigned'),
    ('00000000-0000-0000-0000-00000000a104', 990102, 'admin', 'all');

insert into public.spaces (id, workspace_id, name, col_start, row_start, col_end, row_end) values
    ('00000000-0000-0000-0000-0000000d0001', 990101, 'Here', 0, 0, 3, 3),
    ('00000000-0000-0000-0000-0000000d0002', 990102, 'There', 0, 0, 3, 3);
insert into public.agents (id, workspace_id, space_id, name) values
    ('00000000-0000-0000-0000-0000000e0001', 990101, '00000000-0000-0000-0000-0000000d0001', 'ceo'),
    ('00000000-0000-0000-0000-0000000e0002', 990101, '00000000-0000-0000-0000-0000000d0001', 'cto'),
    ('00000000-0000-0000-0000-0000000e0003', 990101, '00000000-0000-0000-0000-0000000d0001', 'engineer'),
    ('00000000-0000-0000-0000-0000000e0004', 990102, '00000000-0000-0000-0000-0000000d0002', 'stranger');

-- Open: open to the workspace. Closed: restricted, nobody named. Shared: restricted, the `all`
-- member named with `use`. Assigned: restricted, the `assigned` member named with `manage`.
insert into public.projects (id, workspace_id, key, name, visibility) values
    ('00000000-0000-0000-0000-0000000f0001', 990101, 'OPEN', 'Open', 'workspace'),
    ('00000000-0000-0000-0000-0000000f0002', 990101, 'SHUT', 'Closed', 'restricted'),
    ('00000000-0000-0000-0000-0000000f0003', 990101, 'SHRD', 'Shared', 'restricted'),
    ('00000000-0000-0000-0000-0000000f0004', 990101, 'MINE', 'Assigned', 'restricted'),
    ('00000000-0000-0000-0000-0000000f0005', 990102, 'OPEN', 'Elsewhere', 'workspace');
insert into public.project_members (project_id, user_id, workspace_id, access) values
    ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-00000000a102', 990101, 'use'),
    ('00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-00000000a103', 990101, 'manage');

insert into public.issues (id, workspace_id, project_id, title) values
    ('00000000-0000-0000-0000-000000100001', 990101, '00000000-0000-0000-0000-0000000f0001', 'open-1'),
    ('00000000-0000-0000-0000-000000100002', 990101, '00000000-0000-0000-0000-0000000f0001', 'open-2'),
    ('00000000-0000-0000-0000-000000100003', 990101, '00000000-0000-0000-0000-0000000f0002', 'closed-1'),
    ('00000000-0000-0000-0000-000000100004', 990101, '00000000-0000-0000-0000-0000000f0004', 'assigned-1');
insert into public.issue_comments (workspace_id, issue_id, author_user_id, body) values
    (990101, '00000000-0000-0000-0000-000000100001', '00000000-0000-0000-0000-00000000a101', 'on open'),
    (990101, '00000000-0000-0000-0000-000000100003', '00000000-0000-0000-0000-00000000a101', 'on closed');
insert into public.activity_events (workspace_id, project_id, entity_type, entity_id, action) values
    (990101, '00000000-0000-0000-0000-0000000f0001', 'project', '00000000-0000-0000-0000-0000000f0001', 'project.created'),
    (990101, '00000000-0000-0000-0000-0000000f0002', 'project', '00000000-0000-0000-0000-0000000f0002', 'project.created'),
    (990101, null, 'team', '00000000-0000-0000-0000-0000000f0009', 'team.created');

insert into public.channels (id, workspace_id, name, kind) values
    ('00000000-0000-0000-0000-000000110001', 990101, 'general', 'public'),
    ('00000000-0000-0000-0000-000000110002', 990101, 'leadership', 'private'),
    ('00000000-0000-0000-0000-000000110003', 990101, '', 'dm');
insert into public.channel_members (channel_id, workspace_id, user_id) values
    ('00000000-0000-0000-0000-000000110002', 990101, '00000000-0000-0000-0000-00000000a102'),
    ('00000000-0000-0000-0000-000000110003', 990101, '00000000-0000-0000-0000-00000000a103');
insert into public.channel_members (channel_id, workspace_id, agent_id) values
    ('00000000-0000-0000-0000-000000110002', 990101, '00000000-0000-0000-0000-0000000e0001');
insert into public.channel_messages (channel_id, workspace_id, author_user_id, body) values
    ('00000000-0000-0000-0000-000000110001', 990101, '00000000-0000-0000-0000-00000000a101', 'hello all'),
    ('00000000-0000-0000-0000-000000110002', 990101, '00000000-0000-0000-0000-00000000a102', 'just us');

insert into public.assistant_chats (workspace_id, user_id, title, shared, project_id) values
    (990101, '00000000-0000-0000-0000-00000000a102', 'private chat', false, null),
    (990101, '00000000-0000-0000-0000-00000000a102', 'shared chat', true, null),
    (990101, '00000000-0000-0000-0000-00000000a101', 'shared about closed', true, '00000000-0000-0000-0000-0000000f0002');

-- Issue numbers, allocated per project in insertion order.
select is((select array_agg(number order by title) from public.issues where project_id = '00000000-0000-0000-0000-0000000f0001'), array[1, 2], 'issues of a project are numbered from 1');
select is((select number from public.issues where title = 'closed-1'), 1, 'another project numbers its issues on its own');
select is((select issue_counter from public.projects where id = '00000000-0000-0000-0000-0000000f0001'), 2, 'the project keeps the last number handed out');
insert into public.issues (workspace_id, project_id, title, number) values (990101, '00000000-0000-0000-0000-0000000f0001', 'open-3', 42);
select is((select number from public.issues where title = 'open-3'), 3, 'a number written by the caller is replaced by the next one');
delete from public.issues where title = 'open-3';
insert into public.issues (workspace_id, project_id, title) values (990101, '00000000-0000-0000-0000-0000000f0001', 'open-4');
select is((select number from public.issues where title = 'open-4'), 4, 'a number freed by a deleted issue is not handed out again');
select throws_ok($$ update public.issues set number = 9 where title = 'open-1' $$, '23514', null, 'an issue keeps its number');
select throws_ok(
    $$ update public.issues set project_id = '00000000-0000-0000-0000-0000000f0002' where title = 'open-1' $$,
    '23514', null, 'an issue keeps its project');
select throws_ok(
    $$ insert into public.issues (workspace_id, project_id, title) values (990101, '00000000-0000-0000-0000-0000000f0005', 'cross') $$,
    '23503', null, 'an issue cannot point at a project of another workspace');
select throws_ok(
    $$ update public.issues set assignee_agent_id = '00000000-0000-0000-0000-0000000e0004' where title = 'open-1' $$,
    '23503', null, 'an issue cannot be assigned to an agent of another workspace');
select throws_ok(
    $$ update public.issues set assignee_user_id = '00000000-0000-0000-0000-00000000a101', assignee_agent_id = '00000000-0000-0000-0000-0000000e0001' where title = 'open-1' $$,
    '23514', null, 'an issue has one assignee at most');
select throws_ok($$ update public.activity_events set action = 'project.updated' $$, '23514', null, 'the activity log is append-only');

-- Reporting line.
update public.agents set reports_to_agent_id = '00000000-0000-0000-0000-0000000e0001' where id = '00000000-0000-0000-0000-0000000e0002';
update public.agents set reports_to_agent_id = '00000000-0000-0000-0000-0000000e0002' where id = '00000000-0000-0000-0000-0000000e0003';
select is((select reports_to_agent_id from public.agents where id = '00000000-0000-0000-0000-0000000e0003'), '00000000-0000-0000-0000-0000000e0002'::uuid, 'an agent reports to a manager of its workspace');
select throws_ok(
    $$ update public.agents set reports_to_agent_id = id where id = '00000000-0000-0000-0000-0000000e0001' $$,
    '23514', 'agents_reports_to_self: an agent cannot report to itself', 'an agent cannot report to itself');
select throws_ok(
    $$ update public.agents set reports_to_agent_id = '00000000-0000-0000-0000-0000000e0003' where id = '00000000-0000-0000-0000-0000000e0001' $$,
    '23514', 'agents_reports_to_cycle: this reporting line would loop back to the agent', 'a reporting line cannot loop');
select throws_ok(
    $$ update public.agents set reports_to_agent_id = '00000000-0000-0000-0000-0000000e0004' where id = '00000000-0000-0000-0000-0000000e0001' $$,
    '23514', 'agents_reports_to_other_workspace: the manager belongs to another workspace', 'a manager comes from the same workspace');
delete from public.agents where id = '00000000-0000-0000-0000-0000000e0002';
select is((select reports_to_agent_id from public.agents where id = '00000000-0000-0000-0000-0000000e0003'), null, 'deleting a manager leaves their reports without one');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Admin: every project and its issues, public channels and those they joined, never a private one.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a101');
select set_eq($$ select key from public.projects where workspace_id = 990101 $$, array['OPEN', 'SHUT', 'SHRD', 'MINE'], 'admin sees every project');
select is((select count(*)::int from public.manageable_project_ids() m join public.projects p on p.id = m where p.workspace_id = 990101), 4, 'admin manages every project');
select is((select count(*)::int from public.issue_comments where workspace_id = 990101), 2, 'admin reads every comment');
select set_eq($$ select name from public.channels where workspace_id = 990101 $$, array['general'], 'admin sees public channels, not private ones nor direct messages');
select throws_ok(
    $$ insert into public.issues (workspace_id, project_id, title) values (990101, '00000000-0000-0000-0000-0000000f0001', 'from the browser') $$,
    '42501', null, 'even an admin writes no issue from the browser');

-- Member scoped to all: open projects and the one shared with them.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a102');
select set_eq($$ select key from public.projects where workspace_id = 990101 $$, array['OPEN', 'SHRD'], 'member (all) sees open projects and the one named to them');
select set_eq($$ select title from public.issues where workspace_id = 990101 $$, array['open-1', 'open-2', 'open-4'], 'member (all) sees the issues of those projects');
select set_eq($$ select body from public.issue_comments where workspace_id = 990101 $$, array['on open'], 'member (all) reads the comments of visible issues only');
select set_eq($$ select action from public.activity_events where workspace_id = 990101 $$, array['project.created', 'team.created'], 'member (all) reads activity of visible projects and outside any project');
select is((select count(*)::int from public.manageable_project_ids()), 0, 'member with use manages no project');
select set_eq($$ select name from public.channels where workspace_id = 990101 $$, array['general', 'leadership'], 'member (all) sees public channels and the private one they joined');
select set_eq($$ select body from public.channel_messages where workspace_id = 990101 $$, array['hello all', 'just us'], 'channel messages follow their channel');
select is((select count(*)::int from public.channel_members where channel_id = '00000000-0000-0000-0000-000000110002'), 2, 'a member reads who else is in their private channel, agents included');
select set_eq($$ select title from public.assistant_chats where workspace_id = 990101 $$, array['private chat', 'shared chat'], 'member reads their chats, not one shared about a project they cannot see');
select throws_ok($$ update public.issues set title = 'renamed' where title = 'open-1' $$, '42501', null, 'member cannot write an issue from the browser');

-- Member scoped to assigned: only what is named to them.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a103');
select set_eq($$ select key from public.projects where workspace_id = 990101 $$, array['MINE'], 'member (assigned) sees only the project named to them');
select set_eq($$ select p.key from public.manageable_project_ids() m join public.projects p on p.id = m $$, array['MINE'], 'member (assigned) manages the project named to them with manage');
select set_eq($$ select title from public.issues where workspace_id = 990101 $$, array['assigned-1'], 'member (assigned) sees only its issues');
select set_eq($$ select kind::text from public.channels where workspace_id = 990101 $$, array['dm'], 'member (assigned) sees no public channel until they join it, and their direct message');
select set_eq($$ select title from public.assistant_chats where workspace_id = 990101 $$, array['shared chat'], 'a shared chat is read by the workspace, a private one by its owner only');

-- Someone of another workspace: nothing of this one.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a104');
select is((select count(*)::int from public.projects where workspace_id = 990101), 0, 'an outsider sees no project of the workspace');
select is((select count(*)::int from public.channels where workspace_id = 990101) + (select count(*)::int from public.activity_events where workspace_id = 990101), 0, 'an outsider sees no channel nor activity of the workspace');

reset role;

select * from finish();
rollback;
