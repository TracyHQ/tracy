---
description: Seats on a site and on a workspace now have only three Google-style roles — Viewer (view only, comment, ask the agent), Editor (edit the whole site, including publish), Owner (adds people management, domains, deleting the site); the role → toolset matrix customisable per site/workspace is dropped
sources:
  - apps/tracy-web/src/seats/roles.js
  - apps/tracy-web/src/lib/role-policy.js
  - apps/tracy-web/src/db/migrations/002-book.sql
  - vendor/tracy/dsh-passwords/src/tracy/seat-context.ts
  - packages/core/tracy-core/src/team/
  - tasks/plan-quyen-thanh-vien.md
---

# 0028 — Three roles: Viewer, Editor, Owner

**Status:** (binding) · 08/10/2026 · Akemi (PO) decided, Claude wrote it. Execution plan:
[`tasks/plan-quyen-thanh-vien.md`](../../tasks/plan-quyen-thanh-vien.md).

**Council not consulted** ([`ask-the-council.md`](../references/ask-the-council.md) §4): the machine that wrote
this ADR (Akemi's Mac mini) does not have `claude-council` and the Codex CLI installed. There is no
second view besides Claude.

## Context

Until 08/10 the seat ledger had four roles `owner · admin · developer · editor`, resolved into four
toolsets (`content · code · site · lifecycle`) through a matrix that a site or workspace could override
(`site_role_policy`, `workspace_role_policy`). Three things measured in the code on 08/10:

1. **No door writes the matrix.** The table exists, the reading code exists (`lib/role-policy.js`), but
   the HTTP door was deliberately dropped in the move from the Worker (`workspaces/route.js:51`); only
   tests call `writeRolePolicy`. The screen for editing the matrix exists only in Storybook.
2. **No role is view-only.** Every live seat can write through a few doors (asking the agent to edit,
   creating a backup, commenting). "Read-only" exists only for dsh's `guest`/`bot`.
3. Customers had to understand three levels of editing (content / code / configuration) before they
   could invite someone.

The old role rules cited in the code are ADRs 0036 and 0038 of the `tracy-docs` series; they are not in
this repo.

## Decision

1. **Three roles, named like Google Docs**: `viewer` · `editor` · `owner`. Applies to site seats and
   workspace seats. The internal staff group (`tracy_admin`, `/ops`) **keeps** `owner/admin/developer`.
2. **Each role has a fixed set of permissions; no more customisable matrix.** Toolsets remain the
   internal mechanism for talking to dsh ([ADR 0001](0001-seat-door-and-enforcement-boundary.md) unchanged),
   but the mapping is constant:

   | Role | Toolset | Agent |
   |---|---|---|
   | `viewer` | none | read-only |
   | `editor` | `content` · `code` · `site` | can edit |
   | `owner` | all four | can edit |

3. **Viewer**: views the site, Preview, Changes, Activity, the member list; **comments**; **chats with
   the agent in read-only mode** (asked to edit, the agent refuses and points to how to request
   permission). No access to the CMS admin pages (CMS level `viewer`, front-end pages only).
4. **Editor**: every site edit, **including publish**, restoring a backup, undo. Can invite people with
   the Viewer or Editor role. Cannot change roles, remove people, or approve join requests.
5. **Owner**: adds people management (change roles, remove, approve join requests, promote to Owner),
   custom domains, deleting the site. **Multiple Owners** are allowed; the rule "the last Owner cannot be
   removed" stays. Owners cannot be invited directly, only promoted from the Team table.
6. **A Viewer requests edit permission** through exactly the "request to join the site" pipeline: every
   Owner gets Inbox + email, Approve makes them an Editor, Decline reports back.
7. **Role names are translated with the interface language** (Người xem / Người chỉnh sửa / Chủ sở
   hữu…). This is a deliberate exception to the keep-in-English rule in
   [`i18n.md`](../references/i18n.md) §5: these are everyday words the customer must understand at once.
8. **Data migration**: `admin` → `editor`, `developer` → `editor`, `editor` stays, `owner` stays. Old
   invitation links carrying the `admin`/`developer` role still open and grant the `editor` role.

## Consequences

- No longer binding in TCH: the role and matrix part of ADR 0036/0038 (`tracy-docs`), along with the
  4-role `DEFAULT_ROLE_POLICY`. The `site_role_policy` / `workspace_role_policy` tables are no longer
  read.
- The old `editor` (only `content`) **gains** `code` and `site`. A deliberate change, not a data
  migration accident.
- `actingAdmin` (owner or admin) no longer means anything: all people management belongs to the Owner.
- The read-only layer in `dsh-passwords` overlaps draft PR #951 (same direction: a seat without `code`
  is read-only). Akemi chose to do them independently and combine at merge time.
