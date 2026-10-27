---
description: From now on the `dsh-passwords` fork = the untouched upstream core (pinned to one commit) + a Tracy policy layer in `src/tracy/` plugged into the core through a closed list of hooks; seats are fail-closed; an upstream upgrade replaces the core and reruns the layer's test suite, no line merging
sources:
  - vendor/tracy/dsh-passwords/src/tracy/
  - vendor/tracy/dsh-passwords/TRACY-FORK.md
  - vendor/tracy/dsh-passwords/upstream-snapshot.sha256
  - scripts/check-passwords-core-diff.ts
  - tasks/todo-dsh-passwords-2-7-7.md
  - tasks/evidence/dsh-passwords-2-7-7/
---

# 0027 — `dsh-passwords`: upstream as the base, Tracy as a policy layer

**Status:** (binding) · 05/10/2026 · Lee (PO) decided after two Codex council rounds
(`.claude/council-cache/council-1791179138.md`, `council-1791180516.md`), Claude wrote it. Execution
plan: [`tasks/todo-dsh-passwords-2-7-7.md`](../../tasks/todo-dsh-passwords-2-7-7.md).

## Why an ADR

It changes how this fork exists. From 30/08 until now `dsh-passwords` has been edited **in place**
(RULE #5 reversed, [ADR 0002](0002-removed-upstream-assumptions.md)): 45 Tracy commits, 83
invariants, ~2,500 lines added to `gateway.ts`. The cost of that approach was measured on 05/10:
upstream went from v2.6.6 to v2.7.7 (16 versions in 25 days, 2.7.5 split `gateway.ts` into five
modules), and `merge-tree` gives 12/16 files in conflict, 87 hunks. The next upgrade will pay the same
cost, and the one after that. This decision is hard to roll back (tree structure, gates, how tests are
written) and surprising without context ("why can't I edit `gateway.ts`?").

## Context — three facts verified at tag v2.7.7 (`d9a327c`)

1. **Upstream is fail-open towards plugins.** `MCP_GATEWAY_PLUGIN_COMPAT` existed only in 2.7.2–2.7.5
   and was removed in 2.7.6. An unknown HTTP path from a subuser is forwarded straight to dsh unchecked
   (`classifySubuserPath` → `next()` → `req.pipe`); mux streams outside the official namespace pass
   through untouched. The `MCP_GATEWAY_SSH_ENDPOINTS` registry only **narrows** permissions; it does
   not grant them and does not check by body.
2. **There is no extension point.** Every check lives inside the closure of `createGatewayServer`;
   `ProxyDeps` is internal DI. An outer layer that wants to guard needs hooks in the fork's core.
3. **Tracy holds 83 invariants** (seat/site 14 · session/workspace 18 · job owner 5 · sidebar routes
   11 · revocation 6 · Tracy sign-in/OTP 11 · i18n 3 · dsh compatibility 8 · other 7), 75 with tests;
   upstream has no notion of `/sidebar/*`, `prompter`, `dsh-session:`, `x-forwarded-prefix`, or seat
   doors.

## Decision

1. **The upstream core stays untouched, pinned to one commit.** `vendor/tracy/dsh-passwords/src/`
   outside `src/tracy/` and `src/locales/` must be **byte-identical** to the snapshot of the pinned
   commit (`upstream-snapshot.sha256`, generated from a clean clone), except the files that carry hooks.
2. **The Tracy part is a named layer: `src/tracy/`.** One file per policy, pure functions
   `(context, request) → allow | deny(reason) | rewrite`, tested by invariant id. Named, finite
   exceptions for adapters with I/O: `persistence.ts` (DB/migration), `revocation.ts` (connection
   registry), `write-fence.ts` (tickets over the request lifecycle), `tracy-door.ts` (seat/Tracy door
   router), `client/`, `i18n/`.
3. **The hook list is closed** (H0–H11 in the plan, copied into `TRACY-FORK.md` with file:line). In a
   file with hooks, it may differ from upstream only at the declared **anchors** (adapter import + one
   call). Adding a hook = editing `TRACY-FORK.md` and the plan in the same PR. The
   `check-passwords-core-diff` gate (in `check-all.ts`) goes red on any other diff; **do not use
   `git diff <upstream commit>`** because the squashed subtree does not keep that commit in TCH's
   history.
4. **Seats are fail-closed, set by Tracy.** A seat (subuser) passes only through doors that
   `src/tracy/routes.ts` knows; mux streams are granted by endpoint + operation + resource, denied by
   default, including new endpoints in the official namespace; every seat `/api/*` JSON passes the
   per-field guard (`SESSION_REF_KEYS`), not just `SESSION_SCOPED_RE`. The owner keeps upstream
   behaviour, except: on the fleet (`MCP_SEAT_SECRET` set) the self-destruct operations of 2.7.4 are
   blocked on every transport, and if a required secret is missing the gateway does not start.
5. **The order of checks is a tested invariant.** Permission check before any `write`/`pipe`/forward;
   response filtering after parse but before emitting the body; stream filtering before
   `enqueue`/`send`; revoke/grant change/ban/logout closes every open connection (pending HTTP, SSE, WS,
   mux). A deny case asserts **0 requests to the fake upstream and 0 bytes to the client**, not just a
   403 code.
6. **The next upstream upgrade** = replace the core snapshot, rerun the layer's test suite, check each
   hook is still in the right place, add any new doors upstream introduced to the route/stream table.
   No line merging. Version `<upstream>-tracy.N`.
7. **The dsh pair does not come along.** Upgrading passwords does not drag a dsh upgrade with it;
   `patch.ts` uses the version matching the running dsh (proven by a real run + idempotence), noting
   which fixes of the upstream patch are lost.

## Consequences

- Whoever edits the gateway edits only `src/tracy/`; a diff outside the hooks is a bug, not a
  convenience. Subagents are given the files they may edit by name.
- `TRACY-FORK.md` is the ledger: invariant ↔ file ↔ test ↔ hook. [ADR 0002](0002-removed-upstream-assumptions.md)
  still binds the *content* (the five assumptions removed); this ADR binds the *shape* of the fork.
- `check-language` keeps scanning `src/`; new code and comments in `src/tracy/` are in English.

## Options dropped

- **A — port the 45 commits into the new structure, spread through the core.** The same cost on every
  upgrade; measured at 87 hunks this time.
- **B — cherry-pick only the 2.7.7 security group onto 2.6.6.** Acceptance of the gateway twice, drift
  from upstream keeps growing; it remains only an emergency option when a hole is open.
- **Full C — the Tracy part as a plugin outside the fork.** Upstream has no extension point yet (fact
  2); doing that means rewriting the gateway.
