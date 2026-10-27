# 0002 — Five assumptions of `dsh-passwords` that were removed, and why

- Status: accepted (binding)
- Date: 2026-08-31
- Decided by: Lee
- Related: [`0001`](0001-seat-door-and-enforcement-boundary.md) (seat door) · a DIFFERENT series,
  `tracy-infra`'s: `0003` §4 (guest lane — *"being unable to open it is not enough, it must be
  INVISIBLE"*)
- Enforced in: `vendor/tracy/dsh-passwords/src/gateway.ts` · `permissions.ts` · `seat.ts`
- Released: `dsh-passwords@2.6.6-tracy.7 → .9`, bundle `0.3.7` / `0.4.6` / `0.6.4`

## Context

`dsh-passwords` was written for **rc.2** and for a model entirely different from Tracy's: *one
landlord, a few tied-down subusers*. Tracy uses it for *many equal customers working together on one
site*, on **alpha.1** — the version in which dsh moved almost all communication onto a WebSocket mux
(`/api/remote.mux`) and changed the wire shape of every RPC.

On 31/08, Lee sent **nine error screenshots in a row** for one and the same story: customers could
not use the panel. Those nine screenshots turned out to be **five different assumptions** of
upstream, each one surfacing only after the previous one was removed. Recorded here because the next
time dsh moves to a new version, this is the list to check.

## Decision

Tracy removes the following five assumptions from `dsh-passwords`. Each item comes with its
**measured symptom** — because all five fail *silently or at the wrong address*, and none of them
reveals its own cause.

### 1. "A subuser needs no stream other than the two approved ones"

The original only let a subuser open `workspace/follow` and `session/control`. But the alpha.1
client opens **`$events` first**, and treats *"cannot open `$events`"* as a **lost connection** —
then retries until it gives up.

*Symptom:* the panel sits at **"Connecting."** forever, the console repeats
`connection lost, retry #N`. Admin gets in normally, so every test with an admin account is green.
The cost is not "a few missing events" — it is **the whole interface dead for every customer and
every seat**.

*Removed:* `$events` is on the allow list; the `ready` frame is forwarded after replacing
`host.home` with the granted folder; `emit`/`waterfall` are still blocked (fail-closed).

`session/follow` must also open — otherwise, after sending a message the conversation cannot be
viewed. It is the **only** stream that **carries parameters**, and its permission is checked against
`request.address.sessionId` in the grant ledger; the `subagent` form is checked against the **parent
session**, because the grant is recorded against the parent session.

### 2. "`args` is a fake field, ignore it"

In rc.2, `payload.args` was a wrapper dsh did not read, so guarding on it was fail-open. In
**alpha.1 it is the other way round**: `args` is the real wire of every typert RPC.

*Symptom:* `extractPathFromBody` / `extractWorkspaceId` return `null` → the gateway fails closed →
**403 "folder is not in the allowed directories"** for every folder creation and every workspace
selection. What the user sees: *"I pick a folder and it kicks me back to the start"*.

*Removed:* walk through `args` in a **second pass**, after every field outside `args` has taken
priority. rc.2's toxic shape (fake args next to real fields) still loses — the old rule keeps the
part that still binds.

### 3. "A folder has one owner"

The original refused any operation on a workspace someone else had registered. Right for a server
with one landlord; **wrong for Tracy**, where many seats read the same site's `/work/<label>`.

*Symptom:* for a workspace created by an earlier customer, the next customer gets
**403 "无权创建或删除工作区"**. Another approach had been tried before — giving each seat its own
symlink box — and it **did not work**: dsh resolves symlinks when writing the ledger, so the ledger
holds the real path while the whitelist holds the box path, and the workspace vanishes from the
sight of the very person who just created it.

*Removed:* the boundary is `allowed_folders`, **and only that**. Inside their box many seats share;
outside the box the owner rule still guards.

### 4. "The in-RAM cache and the DB ledger say the same thing"

`userSessionAccess` is the cache, `db.listUserSessionGrants` is the ledger. The cache only updates
when the revision matches; the ledger is written unconditionally the moment `session/create` returns.
The original required **both**, so two branches of the same stream gave different answers:
`baseline` asks the ledger so it sees the session, `upsert` asks the cache so it does not.

*Symptom:* a just-created session drops out of the workspace's `sessionIds`, the client files it
under **"Ungrouped"**, then the next frame removes it entirely — *"I can't create a session in any
folder, and after a while it disappears by itself"*.

*Removed:* the **ledger** decides read access. A cache that is out of step must not hide real data.

There is still a real race underneath: dsh emits `upsert` **before** the gateway has read the
response to record the grant. The answer is **not** to let unknown ids through — two customers
creating in the same workspace would see each other. The answer is to **ask the ledger again after a
400 ms beat**: if there is a grant the frame goes on, if not it is filtered just as before. `upsert`
is idempotent by `workspaceId`, so a late send does not change client state.

### 5. "A read-only customer needs to create nothing, and may run no preset"

Two separate switches (`allow_workspace_create`, `allowed_agent_presets: []`) were stacked on top of
the folder boundary, and each one fought a different policy.

*Symptom:* (a) a customer standing **inside their own box** still got 403 on clicking "New folder";
(b) after picking a workspace, the panel **forces the "Guest" persona that the lane itself ships**
into `session/create`, the gateway returns 403 because the preset list is empty, the client cancels
the selection — the very same *"kicked back to the start"*.

*Removed:* inside the box you can create, outside the box never — the whitelist is the only
boundary. The lane decides the preset catalogue it ships; a grant does not veto that catalogue.

## Consequences

- **What does NOT change:** isolation between customers is intact. Re-measured after removing all
  five: list `/etc` → 403; create a folder in `/root` → 403; register a workspace outside the box
  (`/root`, `/work`, `/etc`, `/desk-home`) → 403 on all four; `session/follow` on someone else's
  session → closed `1008`.
- **Ten gateway-level tests** nail down each path (`gateway-directory-picker`,
  `gateway-remote-mux-events`), because the lesson of this round is: **testing a permission function
  does not catch a function no one calls** — `directoryPickerPathFor` had been correct since
  `tracy.6` but the gateway had never imported it.
- **Measure with the real client, not a hand-written probe.** Three times in this round the probe was
  green while the browser was red, because the probe sent `cwd` while the client sent `workspaceId`;
  it only showed once we hooked straight into `fetch` in the page. Rule: a patch to a user-facing
  surface counts as done only when measured on **the exact path the user takes**.
- **Known debt:** three inherited red tests in `dsh-passwords` (Issue #15, Issue #20, and the 2.6.4
  baseline version test) are still red — unrelated to this round, see
  [`tasks/todo-quy-uoc-tch.md`](../../tasks/todo-quy-uoc-tch.md) §Handoff.

## Options considered and rejected

**Switch to another community gateway plugin.** Rejected. What Tracy needs is not "a gateway" but
**managing seats for many customers on one site**; every community dsh plugin is written for the
one-landlord model, so switching means buying this exact fight again from scratch, plus the parts no
one has patched for alpha.1. Four of the five assumptions above **are not this package's fault** —
they are consequences of dsh jumping rc.2 → alpha.1; another package would snag in the very same
places, only without this map.

**The right boundary is:** `dsh-passwords` is the **enforcement layer**, the permission model is
Tracy's (`seat.ts`). When dsh moves to a new version, re-check exactly the five items above before
checking anything else.
