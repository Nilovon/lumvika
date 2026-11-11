import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runContext } from "@/test/trigger-sdk";

const db = await vi.hoisted(async () => (await import("@/test/db-fake")).fakeDb());
vi.mock("@/lib/db", async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }));
vi.mock("@trigger.dev/sdk/v3", async () => (await import("@/test/trigger-sdk")).triggerSdkMock());

type AuthUser = { id: string; isAnonymous: boolean; createdAt: Date };

const auth = vi.hoisted(() => ({ users: [] as { id: string; isAnonymous: boolean; createdAt: Date }[], failingIds: [] as string[], listFails: false, deleted: [] as string[] }));
vi.mock("@/lib/auth/auth-users", () => ({
    listAnonymousUserIds: async ({ after, before }: { after: Date | null; before: Date }) => {
        if (auth.listFails) throw new Error("database down");
        return auth.users.filter(user => user.isAnonymous && user.createdAt < before && (!after || user.createdAt >= after)).map(user => user.id);
    },
    deleteAuthUser: async (id: string) => {
        if (auth.failingIds.includes(id)) throw new Error("still referenced");
        auth.deleted.push(id);
    },
}));

const { purgeAnonymousUsers, purgeAnonymousUsersDaily } = await import("./purge-anonymous-users");

const NOW = new Date("2026-09-20T12:00:00.000Z");
const HOUR = 60 * 60_000;

function anonymous(id: string, createdAt: Date, isAnonymous = true): AuthUser {
    return { id, isAnonymous, createdAt };
}

type Tables = { memberships?: Record<string, number[]>; sandbox?: number[]; memberCounts?: Record<number, number>; spaceCounts?: Record<number, number>; workspaceDeleteError?: boolean };

function database(users: AuthUser[], tables: Tables = {}, failingIds: string[] = []) {
    auth.users = users;
    auth.failingIds = failingIds;
    db.answer(call => {
        const filters = (call.helper === "selectCount" || call.helper === "deleteRows" ? call.args[0] : call.args[1]) as Record<string, unknown>;
        if (call.table === "workspace_members" && call.helper === "selectCount") return { data: tables.memberCounts?.[filters.workspace_id as number] ?? 0 };
        if (call.table === "workspace_members") return { data: (tables.memberships?.[filters.user_id as string] ?? []).map(workspace_id => ({ workspace_id })) };
        if (call.table === "spaces") return { data: tables.spaceCounts?.[filters.workspace_id as number] ?? 0 };
        if (call.table === "workspaces" && call.helper === "deleteRows") return tables.workspaceDeleteError ? { error: { message: "fk violation" } } : undefined;
        if (call.table === "workspaces") return { data: { is_sandbox: tables.sandbox?.includes(filters.id as number) ?? false } };
        return undefined;
    });
}

const workspaceDeletions = () => db.callsTo("deleteRows", "workspaces").map(call => call.args[0]);

type Run = (payload: unknown, params: unknown) => Promise<{ scanned: number; deletedUsers: number; deletedWorkspaces: number; errors: number }>;
const purge = (payload: unknown = {}) => ((purgeAnonymousUsers as unknown as { run: Run }).run)(payload, runContext());

describe("purgeAnonymousUsers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.reset();
        auth.deleted = [];
        auth.listFails = false;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("defaults to anonymous accounts older than 24 hours", async () => {
        database([anonymous("old", new Date(NOW.getTime() - 25 * HOUR)), anonymous("recent", new Date(NOW.getTime() - 23 * HOUR)), anonymous("real", new Date(NOW.getTime() - 48 * HOUR), false)]);

        await expect(purge()).resolves.toMatchObject({ scanned: 1, deletedUsers: 1 });
        expect(auth.deleted).toEqual(["old"]);
    });

    it("treats createdAfter as inclusive and createdBefore as exclusive", async () => {
        database([
            anonymous("before-after", new Date("2026-09-10T23:59:59.999Z")),
            anonymous("at-after", new Date("2026-09-11T00:00:00.000Z")),
            anonymous("inside", new Date("2026-09-11T12:00:00.000Z")),
            anonymous("at-before", new Date("2026-09-12T00:00:00.000Z")),
        ]);

        await purge({ createdAfter: "2026-09-11T00:00:00.000Z", createdBefore: "2026-09-12T00:00:00.000Z" });

        expect(auth.deleted).toEqual(["at-after", "inside"]);
    });

    it("counts a failed deletion and carries on", async () => {
        const old = new Date(NOW.getTime() - 48 * HOUR);
        database([anonymous("stuck", old), anonymous("fine", old)], {}, ["stuck"]);

        await expect(purge()).resolves.toMatchObject({ scanned: 2, deletedUsers: 1, errors: 1 });
    });

    it("fails the run when the user list cannot be read", async () => {
        database([]);
        auth.listFails = true;

        await expect(purge()).rejects.toThrow("database down");
    });

    describe("orphaned workspaces", () => {
        const old = new Date(NOW.getTime() - 48 * HOUR);

        it("deletes a workspace left with no member and no Box", async () => {
            database([anonymous("a", old)], { memberships: { a: [7] } });

            await expect(purge()).resolves.toMatchObject({ deletedWorkspaces: 1 });
            expect(workspaceDeletions()).toEqual([{ id: 7 }]);
        });

        it("keeps a workspace that still has a member", async () => {
            database([anonymous("a", old)], { memberships: { a: [7] }, memberCounts: { 7: 1 } });

            await expect(purge()).resolves.toMatchObject({ deletedWorkspaces: 0 });
            expect(workspaceDeletions()).toEqual([]);
        });

        it("keeps a workspace that still has a Box", async () => {
            database([anonymous("a", old)], { memberships: { a: [7] }, spaceCounts: { 7: 2 } });

            await expect(purge()).resolves.toMatchObject({ deletedWorkspaces: 0 });
            expect(workspaceDeletions()).toEqual([]);
        });

        it("never deletes a sandbox", async () => {
            database([anonymous("a", old)], { memberships: { a: [7] }, sandbox: [7] });

            await expect(purge()).resolves.toMatchObject({ deletedWorkspaces: 0 });
            expect(workspaceDeletions()).toEqual([]);
        });

        it("counts a failed workspace deletion", async () => {
            database([anonymous("a", old)], { memberships: { a: [7] }, workspaceDeleteError: true });

            await expect(purge()).resolves.toMatchObject({ deletedWorkspaces: 0, errors: 1 });
        });
    });

    it("runs nightly over the default window", async () => {
        database([anonymous("old", new Date(NOW.getTime() - 25 * HOUR))]);

        await expect(((purgeAnonymousUsersDaily as unknown as { run: Run }).run)({}, runContext())).resolves.toMatchObject({ deletedUsers: 1 });
    });
});
