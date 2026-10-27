# 0001 — Seat door: the seat ledger says who gets what, the lane only enforces

- Status: accepted (binding)
- Date: 2026-08-30
- Decided by: Lee
- **Numbering:** TCH ADRs are numbered on their own from 0001 (Lee settled this 30/08, see
  `tasks/todo-quy-uoc-tch.md`). The first version of this file was numbered 0008, continuing the
  `tracy-infra` series — wrong, because the next time that side writes its own 0008 there are two
  files with the same number and different content.
- Related (a DIFFERENT series, `tracy-infra`'s): `0002` (membership tiers) · `0003` (guest lane,
  dsh-passwords is the load-bearing dependency) · `0006` (dsh / Worker boundary) · the seat ledger's
  `0038` (four roles, four toolsets)
- Enforced in: `vendor/tracy/dsh-passwords/src/seat.ts` · `tasks/todo-cua-ghe.md`

## Context

The seat ledger (Supabase, behind `seats.tracy.ai`) already knows who a person is and what they may
touch: `seat` → `seat_workspace(role)` → `site`, plus a role matrix → four toolsets (`content` ·
`code` · `site` · `lifecycle`) that the Owner can override per site through `site_role_policy`.

`dsh-passwords` — the proxy guarding the lane — has its **own user ledger**: a `users` table in
SQLite, bcrypt passwords, 12-hour JWTs. Until now the two ledgers were joined by a six-step chain in
`cowork-web/src/worker.js`: fetch the login page, scrape the CSRF, sign in with the **master
credential**, create a subuser, read the user list back to look up the id, grant the folder, then
sign in again.

Three pain points, measured rather than felt:

1. **Revoking a seat does not kick out the person sitting in it.** A session dies when
   `credential_version` changes, and no path of the seat ledger touches that column. A revoked seat
   keeps working for up to 12 hours.
2. **A master credential lives in the Worker**, and it opens everything on the lane.
3. **Role rules live in the Worker's JavaScript**, six fields written by hand on every grant,
   checked by no one.

## Decision

1. **One door: `POST /gateway/seat/session`.** Signed with HMAC (`MCP_SEAT_SECRET`) over the method,
   path, body, timestamp and a single-use nonce. Not loopback like the existing `/gateway/internal/*`
   — the caller is a Worker on Cloudflare, arriving through a tunnel, with no address that can be
   pinned.

2. **Turning on the seat door turns off the password door.** `/gateway/login` and `/gateway/setup`
   return 404 when `MCP_SEAT_SECRET` is present. Two doors into one lane is one door too many, and
   that extra door is one the seat ledger **can neither grant nor revoke**.

3. **🔒 The role matrix stays in the SEAT LEDGER. The lane keeps no copy.** The first draft of the
   plan had a `seat_profile` table in the lane's SQLite; it was dropped while still being written,
   because `site_role_policy` already exists and lets the Owner edit the matrix per site. Two tables
   answering the same question will drift — and the losing side will be the one the customer just
   edited. So the Worker resolves it (`toolsetsFor`) and sends the **result** down; `permissionsFor`
   in the lane has only two jobs left: map toolsets onto dsh's permission axes, and supply defaults
   for a call that says nothing.

4. **Mapping toolsets → dsh permissions, and where it stops.**

   | Toolset | What it becomes in dsh | Who enforces it |
   |---|---|---|
   | `content` | granted folder + `workspace-write` sandbox | lane |
   | `code` | `allowed_websocket_paths` (terminal) + `allow_git_download` | lane |
   | `site` | `allow_workspace_create` + `allow_upload` | lane |
   | `lifecycle` | **nothing** | fleet, through the Worker |

   `lifecycle` (build a site, teardown, go-live) has no counterpart in dsh. Granting it down to the
   lane would *look like* opening more permissions while actually opening nothing — a lie on the
   screen. It stays where it can be enforced: scripts on the fleet, called through the seat ledger.

5. **Identity is joined by email, one seat per email.** The account name in the lane is
   `s<sha256(email)[0..23]>`, because `assertUsername` only accepts `[A-Za-z0-9_-]{3,32}` — an email
   address is not a valid account name here and never will be, short of loosening a rule that guards
   every other write path. Intended consequence: Google and GitHub returning the **same** address
   land on the **same** account; returning **different** addresses means **two** people, and the
   second one has no seat yet.

6. **Seat accounts have no password anyone can use.** The hash is the bcrypt of 32 random bytes no
   one keeps. Nothing to leak, nothing to rotate, other than `MCP_SEAT_SECRET` itself.

7. **Revoking a seat is two actions, and both are needed.** Wipe the permission row (`__deny__` +
   `banned`) and bump `credential_version` — only the second column actually kills the session,
   because it is signed into every JWT. The seat door also clears the in-process 30-second session
   cache; without that step a just-revoked seat keeps running for another half minute while the
   audit already records it as done.

8. **`MCP_SEAT_SECRET` is separate for each lane.** Unlike the package's two existing secrets (both
   derived from `SETUP_KEY`): this secret leaves the machine, for a Worker. A leaked guest-lane key
   must not open a member lane.

## Consequences

- **The Worker stops holding a master credential.** `GUEST_MASTER_USER` / `GUEST_MASTER_PASS` are
  removed from Cloudflare in Phase 3 of `tasks/todo-cua-ghe.md`.
- **Guest and member go through the same door.** `guest` and `bot` are two roles in the same list
  as the seat ledger's four roles, not a separate branch — two doors are two places to get the
  fail-closed default wrong.
- **Without `MCP_SEAT_SECRET` the package runs exactly like the upstream version.** That is what
  keeps the desktop shell (`Tracy Cowork.app`, one person one machine) unchanged in this round.
- **Vendor debt.** Every line added to `vendor/tracy/dsh-passwords` is a line that must be rebased
  when upstream ships a new version. That is why all of it sits in `src/seat.ts`, `gateway.ts` only
  carries the route wiring, and `auth.ts` adds exactly one method.

## What this ADR does NOT conclude

- **Not yet run on a real lane.** Every measurement so far is a local test (27 tests in
  `test/seat*.test.ts`). Production is cut over only in Phase 6, and only then will we know how this
  door behaves behind a Cloudflare tunnel.
- **Supabase identity linking not yet measured.** If the project has it on, two providers with the
  same email merge automatically and decision 5 loses half its weight. No one has opened the
  dashboard to check.
- **The isolation layer is not touched.** Making a subuser see only the granted workspace is still
  done by the vendored version's mux filter (§PoC gate ADR 0003 §4 in
  `tasks/todo-tch-greenfield.md`). The seat door only changes **how a session is born**, not what
  guards it afterwards.
