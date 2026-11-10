import { logger, queue, schedules, task } from "@trigger.dev/sdk/v3";
import { createServiceRoleClient } from "@/supabase/serviceRole";
import { selectCount, selectMany, selectMaybeSingle } from "@/supabase/supabase-helpers";

type PurgePayload = {
    createdAfter?: string;
    createdBefore?: string;
};

// Defaults to "anything older than 24h" so the task stays self-contained when triggered without an
// explicit range. `after` is optional: when absent, every anonymous account older than `before` is purged.
function resolveRange({ createdAfter, createdBefore }: PurgePayload): { after: Date | null; before: Date } {
    const before = createdBefore ? new Date(createdBefore) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const after = createdAfter ? new Date(createdAfter) : null;
    return { after, before };
}

// Deletes anonymous auth accounts created within the given range and their now-orphaned workspaces.
// Anonymous visitors are provisioned (workspace + users + workspace_members) on first sight in
// supabase/middleware.ts; deleting the auth user cascades public.users + workspace_members, but the
// workspaces row is left behind, so we clean it up when nothing else references it.
export async function purgeAnonymous(payload: PurgePayload) {
    const supabase = createServiceRoleClient();
    const { after, before } = resolveRange(payload);

    const candidateWorkspaceIds = new Set<number>();
    let scanned = 0;
    let deletedUsers = 0;
    let errors = 0;

    // Collected before anything is deleted: a deletion shifts every later page of listUsers, so
    // deleting while paging skips a page's worth of accounts each time.
    const userIds: string[] = [];
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(error.message);

        const users = data.users;
        if (users.length === 0) break;

        for (const user of users) {
            if (!user.is_anonymous) continue;
            const createdAt = new Date(user.created_at);
            if ((after && createdAt < after) || createdAt >= before) continue;
            userIds.push(user.id);
        }

        if (users.length < 1000) break;
    }

    for (const userId of userIds) {
        scanned++;

        const { data: memberships } = await selectMany(supabase, "workspace_members", ["workspace_id"] as const, { user_id: userId });
        for (const membership of memberships ?? []) {
            candidateWorkspaceIds.add(membership.workspace_id);
        }

        const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
        if (deleteError) {
            errors++;
            logger.error("failed to delete anonymous user", { userId, error: deleteError.message });
            continue;
        }
        deletedUsers++;
    }

    let deletedWorkspaces = 0;
    for (const workspaceId of candidateWorkspaceIds) {
        const { data: workspace } = await selectMaybeSingle(supabase, "workspaces", ["is_sandbox"] as const, { id: workspaceId });
        if (workspace?.is_sandbox) continue;

        const { data: memberCount } = await selectCount(supabase, "workspace_members", { workspace_id: workspaceId });
        const { data: spaceCount } = await selectCount(supabase, "spaces", { workspace_id: workspaceId });
        if ((memberCount ?? 0) > 0 || (spaceCount ?? 0) > 0) continue;

        const { error: workspaceError } = await supabase.from("workspaces").delete().eq("id", workspaceId);
        if (workspaceError) {
            errors++;
            logger.error("failed to delete orphaned workspace", { workspaceId, error: workspaceError.message });
            continue;
        }
        deletedWorkspaces++;
    }

    logger.info("purge anonymous users done", { after: after?.toISOString() ?? null, before: before.toISOString(), scanned, deletedUsers, deletedWorkspaces, errors });
    return { scanned, deletedUsers, deletedWorkspaces, errors };
}

// Shared by both tasks so a manual purge and the nightly one can never delete the same accounts
// concurrently.
const purgeQueue = queue({ name: "purge-anonymous-users", concurrencyLimit: 1 });

// Triggered from the admin panel, which is the only caller that needs a custom range.
export const purgeAnonymousUsers = task({
    id: "purge-anonymous-users",
    queue: purgeQueue,
    maxDuration: 1800,
    retry: { maxAttempts: 1 },
    run: async (payload: PurgePayload) => purgeAnonymous(payload),
});

// An empty payload resolves to "older than 24h", the same window the admin button uses.
export const purgeAnonymousUsersDaily = schedules.task({
    id: "purge-anonymous-users-daily",
    cron: { pattern: "0 3 * * *", timezone: "Europe/Paris" },
    queue: purgeQueue,
    maxDuration: 1800,
    retry: { maxAttempts: 1 },
    run: async () => purgeAnonymous({}),
});
