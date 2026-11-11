import { logger, queue, schedules, task } from "@trigger.dev/sdk/v3";
import { deleteAuthUser, listAnonymousUserIds } from "@/lib/auth/auth-users";
import { deleteRows, selectCount, selectMany, selectMaybeSingle, serviceScope } from "@/lib/db";

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
// lib/auth/proxy-session.ts; deleting the auth user cascades public.users + workspace_members, but the
// workspaces row is left behind, so we clean it up when nothing else references it.
export async function purgeAnonymous(payload: PurgePayload) {
    const scope = serviceScope();
    const { after, before } = resolveRange(payload);

    const candidateWorkspaceIds = new Set<number>();
    let scanned = 0;
    let deletedUsers = 0;
    let errors = 0;

    // Collected before anything is deleted, so the deletions cannot move what is left to read.
    const userIds = await listAnonymousUserIds({ after, before });

    for (const userId of userIds) {
        scanned++;

        const { data: memberships } = await selectMany(scope, "workspace_members", ["workspace_id"] as const, { user_id: userId });
        for (const membership of memberships ?? []) {
            candidateWorkspaceIds.add(membership.workspace_id);
        }

        try {
            await deleteAuthUser(userId);
        } catch (deleteError) {
            errors++;
            logger.error("failed to delete anonymous user", { userId, error: deleteError instanceof Error ? deleteError.message : String(deleteError) });
            continue;
        }
        deletedUsers++;
    }

    let deletedWorkspaces = 0;
    for (const workspaceId of candidateWorkspaceIds) {
        const { data: workspace } = await selectMaybeSingle(scope, "workspaces", ["is_sandbox"] as const, { id: workspaceId });
        if (workspace?.is_sandbox) continue;

        const { data: memberCount } = await selectCount(scope, "workspace_members", { workspace_id: workspaceId });
        const { data: spaceCount } = await selectCount(scope, "spaces", { workspace_id: workspaceId });
        if ((memberCount ?? 0) > 0 || (spaceCount ?? 0) > 0) continue;

        const { error: workspaceError } = await deleteRows(scope, "workspaces", { id: workspaceId });
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
