---
name: confirm-destructive-actions
description: A risky operation (deletion, purge, revocation, restart, payment, overwriting user input) is confirmed through a dialog (ConfirmDialog, or a dedicated AlertDialog when the copy depends on state), never by a bare click. Use whenever you add a destructive button or write a confirmation dialog.
---

# confirm-destructive-actions: confirm through a dialog

## The rule

> A risky operation is confirmed through **one dialog, and only one**.

Risky = irreversible or wide blast radius: delete, purge, revoke, remove a member, restart/scale an engine, pay, overwrite text the user typed.

## What to use

**`ConfirmDialog`** (`apps/ui/components/dialogs/ConfirmDialog.tsx`) is the default. Title + description + Cancel/Confirm, nothing to wire up.

```tsx
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'

<ConfirmDialog
    title="Delete this row?"
    description="The row is removed from the table for good. This cannot be undone."
    onConfirm={() => onDelete(id)}
>
    <Button variant="destructive" size="sm">Delete</Button>
</ConfirmDialog>
```

Useful props: `confirmLabel` (default `Delete`), `cancelLabel`, `confirmVariant` (default `destructive`; pass `default` for a non-destructive action such as a reset), `pending`.

**Controlled mode is required** when the trigger lives in a layer that closes on interact-outside (`Popover`, `DropdownMenu`): mount the dialog **outside** the layer.

```tsx
const [confirming, setConfirming] = useState(false)

<DropdownMenuItem onSelect={() => setConfirming(true)}>Delete</DropdownMenuItem>
{/* outside the DropdownMenu */}
<ConfirmDialog open={confirming} onOpenChange={setConfirming} title="…" onConfirm={remove} />
```

**A hand-written `AlertDialog`** only when the copy or the content depend on state: a description that lists what is about to change, a "type the name to confirm" field (`DeleteSpaceDialog`, `DeleteAgentDialog`), several dialogs sharing the same admin state (`PoolAdmin`).

**Icon-only button** (trash can with no label): always a dialog. See `PanelDeleteButton` (`apps/ui/components/ui/panel-editor.tsx`), which already wraps it.

**No dialog** when the screen *is* the confirmation: a dedicated page that explains the action and offers a way out next to the button (`cloud/apps/landing/app/community/experts/unsubscribe/ExpertOptOut.tsx`). Do not stack a dialog on top of it.

## Anti-patterns

```tsx
// ❌ deleted on the first click, without confirmation
<Button variant="destructive" onClick={destroy}>Delete</Button>

// ❌ window.confirm()
if (confirm('Sure?')) destroy()
```

## Details that matter

1. **Keep the dialog open during the action**: `event.preventDefault()` in the `onClick` of the `AlertDialogAction`, then close it yourself once the action has returned. Without this the dialog closes immediately and the body's `pointer-events` can stay stuck on unmount (see `RevokeApiKeyDialog`, `WorkspaceDetailDialog`).
2. **The description says what happens**, not "Are you sure?". Name the target, what is destroyed, what is moved, and whether it is irreversible (`DeleteConnectionButton` states what falls back to the Box's default model).
3. **Copy**: English everywhere, **except the `/admin` back-office**, which is in French. No em dash.
4. **The confirm label repeats the verb**: Delete / Purge / Revoke / Remove / Supprimer / Forcer. Never "OK".
5. `AlertDialogContent size="sm"` footers are a 2-column grid on `max-w-xs`: a long label gets truncated there.

## Verification

```bash
# destructive buttons that fire directly, to inspect one by one
rg -n 'variant="destructive"' apps/ui --glob '!**/admin/buttons/**' -A3 | rg -n "onClick"
```

`cd apps/ui && pnpm ts-check` must stay at 0. Prettier is not uniform across `apps/ui`: format the touched lines by hand, never `--write` on a whole file.
