# 0003 — One sign-in door, and one rule for the return path

- Status: accepted (binding)
- Date: 2026-09-01
- Decided by: Lee
- Related: [`0001`](0001-seat-door-and-enforcement-boundary.md) (seat door) ·
  [`0002`](0002-removed-upstream-assumptions.md) (upstream assumptions) · a DIFFERENT series,
  `tracy-infra`'s: `0040` (Google sign-in), `0058` (one sign-in surface), `0067` §7 (request to join
  a site)
- Enforced in: `workers/shared/urls.js` · `workers/cowork/src/index.js` ·
  `workers/cowork-web/src/worker.js` · `workers/fleet-bar/src/` · `packages/web/tracy-frontend/src/`
- Note 05/10/2026: `packages/web/tracy-frontend` has been deleted from the repo (as was `workers/`
  before it); the paths above are history, the ADR body is not edited.

## Context

Tracy has **four sign-in doors**, none of which knows about the others: the team page of **each**
site (`/<label>/team`), `/signin` for Tracy Desk, `/__tracy/*` on **each** copy, and since 31/08 the
lane door (`/gateway/tracy`). Counted on 01/09: **~25 places that build a sign-in address string by
hand** — `/<label>/team` nine times as a string plus three times as a regex (two of them on **the
same line**), `/signin/<provider>` nine times, `/__tracy/*` fourteen times.

And **four different rules** decide "where you are taken after signing in", three of them in the
same file:

| function | accepts |
|---|---|
| `safeReturnUrl` | regex, only `https://<label>.tracy.ai` |
| `safeFrom` | `new URL(raw, base)` — accepts relative paths too |
| hand-written in `serve()` | `new URL(raw)` without a base — **throws** on a relative path |
| `safeBackPath` | same-site path, additionally blocks `/__tracy` |

They disagree: `safeReturnUrl` **rejects** `https://tracy.ai/x` while the inline version
**accepts** it; the inline version **rejects** `/foo/team` while `safeFrom` **accepts** it. Which
rule applies depends on which door the person walked through — and no one could know, because they
had never been written side by side.

**The price already paid, measured:**

- Clicking "Continue with Google" on the lane **goes nowhere**: the lane sends `r=<its address>`,
  and `safeReturnUrl` silently drops that field because the lane runs on loopback.
- The **GitHub button on `/<label>/team` has never worked**: missing route, missing parameter, and
  `SEAT_PATHS` only matches `google` — three copies of the same path vocabulary, one out of step.
- Someone who opens `/settings/account` and then has their session expire **loses the deep link**:
  `AppLayout` kicks them to `/` **before** `signInUrl` reads `location.href`.
- A **permanently stuck dead end**: `/api/sites` returns 401 with no `defaultSite`, so `signInUrl`
  returns an empty string, the `if (door)` branch `return`s early, `sitesState` is stuck at
  `loading` — three skeletons forever, no button, no way out.
- A **dead end with no button**: "Sign in is not available on this surface yet."
- Someone **with an owner seat** calling `/gateway/...` is pushed down to the **guest lane**,
  because the seat-check block was written for `DSH_PATHS` while the entry door is
  `DSH_PATHS || GATEWAY_PATHS`.
- The seat ledger's **"request a seat"** door (`POST /me/sites/:key/join-request`) has existed for a
  long time and **no client has ever called it** — because it opens with `authenticateSeat`, i.e. it
  **demands a seat in order to request a seat**.

## Decision

**One door: `https://cowork.tracy.ai/login?next=<address>`.**

1. **`next` is the only name** for the concept "where to return". Before this there were five names
   (`from`, `r`, `ret`, `back`, `next`) for the same thing.
2. **`workers/shared/urls.js` is the only definition** — `safeNext`, `loginUrl`, `teamPath`,
   `oauthPath`, `labelOfTeamPath`. The four old functions point at it or disappear. Its test is **a
   table**: one row per hostile shape, one expectation per row.
3. **`/login` belongs to no site.** That is what makes it different from the team page, and why it
   can serve people who have no seat yet: it uses **magic link** (`create_user: true`), not OTP
   (`create_user: false`, which demands an existing seat).
4. **The cookie carries identity, not permission.** `session.js` has said so from the start. The
   sign-in door grants identity to whoever can prove it; permission is answered by the seat ledger at
   each door. A `next` pointing at a site requires a seat on that site — that is where the **real**
   seat check happens, and it stays.
5. **No seat means you can request one.** `/login` leads to a `no-seat` screen with a "Request to
   join" button, wired to the seat door that already exists; and that door switches to
   `verifiedPayload` so that people without a seat **can** request one.

### Named exception: desktop and the loopback lane

**A browser cannot push the user back into a desktop application, and should not try.** Addresses
`http://127.0.0.1:…` are rejected by `safeNext` **on purpose**: that value is the target of a 302
**after** identity has been proven.

But **the app can pull the result back**. The seat ledger already has `GET /auth/link/:nonce` for
exactly this case — Tracy Desk mints a nonce, opens the browser, then polls until the ledger says
"approved" and exchanges it with `clientSecret`. The loopback lane has used exactly this mechanism
since 31/08.

So the right sentence to show in the browser is not *"please go back to the app"* but **"Done —
Tracy Desk continues by itself"**.

## Consequences

- **`from` is still read, on purpose.** Emails already sent and bookmarks in circulation carry it;
  dropping it right away breaks paths that are in use. `serve()` reads `next ?? from`. Drop it
  entirely once no old link remains — that is a dated cleanup round, not something forgotten.
- **`r` in `/signin` does NOT change.** It is the protocol with Tracy Desk, and Desk is code in
  another repo: change one end and the other breaks.
- **The team page is no longer a sign-in door**, so its whole OTP path became dead code and has
  been deleted. Three tests asserting the opposite went with it, replaced by tests for the one door.
- **`/login` must match `SEAT_PATHS` in `cowork-web`.** Without it, it falls into the SPA, and the
  SPA has a catch-all `*` leading to `/` — i.e. a **redirect loop**, which does not show up as an
  error but as a page that flickers forever. For the same reason, the SPA navigates to the door with
  `window.location`, **not** with `<Navigate>`.
- **An existing gate caught this change**: adding a cross-import means `workers/shared` must be
  declared in the `watches` of the Worker that imports it, otherwise deploys will not pick up changes
  there.

## Options considered and rejected

**Let each surface keep its own door, and only unify the `safeNext` rule.** Cheaper, and wrong: the
number of doors itself is what produced ~25 hand-typed strings. With one shared rule but four doors
still there, the next added provider still means editing four places, and one will still be missed.

**Loosen `safeNext` to accept loopback, so the lane can be returned to.** Rejected. That opens an
open redirect at the most dangerous spot — after identity has been proven — in exchange for a
convenience the poll mechanism already solved.
