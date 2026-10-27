---
description: 'Staging acceptance before a PR into main — a list of system features to check by hand, use cases S00–S19 anyone can follow, and the E2E suite running for real on cowork-staging.tracy.site (node tests/e2e-dev/run.mjs --env staging): which journeys are automatic, which cases are still manual.'
sources:
  - tests/e2e-dev/run.mjs
  - tests/e2e-dev/lib/env.mjs
  - tests/e2e-dev/lib/select-env.mjs
  - tests/e2e-dev/lib/sites.mjs
  - tests/e2e-dev/lib/run-site.mjs
  - docs/references/may-staging.md
  - docs/references/e2e-dev.md
---

# Staging acceptance — `cowork-staging.tracy.site`

Staging is where the team retests a whole release before it goes into `main` ([`may-staging.md`](may-staging.md)). This
document has three parts: **A** a feature list for walking a round yourself, **B** use cases to hand to anyone, **C** the part
already scripted and running for real. The scripts are [`tests/e2e-dev/`](../../tests/e2e-dev) (the same suite as develop,
[`e2e-dev.md`](e2e-dev.md)), with staging chosen by `--env staging`.

**Results only hold for exactly the images measured.** Each report opens with the deploy manifest (web/host/dsh image tags). If staging
redeploys mid-run, that run is not used to approve a release; run again.

## Running

```bash
node tests/e2e-dev/run.mjs --env staging --only J13,J0          # read-only: health + session (~30 s)
node tests/e2e-dev/run.mjs --env staging --tier smoke           # no model calls (~10 minutes)
node tests/e2e-dev/run.mjs --env staging                        # core: every journey, WordPress
node tests/e2e-dev/run.mjs --env staging --cms all              # core on all three CMSs
node tests/e2e-dev/run.mjs --env staging --only J4a --keep      # one journey, keeping the site to open and look at
```

Needs: the VPN (passwordless SSH to the staging host (`<staging-host>`) from the running machine) and Playwright's Chromium (loaded from
`apps/tracy-host`). Output in `~/TCH-local/e2e-staging/<runId>/` (`report.md`, `report.json`, `evidence/`), separate
from develop's runs (`~/TCH-local/e2e-dev/`), so the suite's catch-up cleanup never touches the other environment.

| Tier | Journeys | Model |
|---|---|---|
| `smoke` | J13, J0, J1, J2a, J3, J9, J12 | no |
| `core` (default) | every existing journey except J2c | J4a/J4b/J4c/J5: at most 6 prompts and 24 minutes of chat per run (`CHAT_BUDGET`) |

## Where staging differs from develop (the suite accounts for it)

- **The `stg-` prefix.** The form and `POST /api/sites` accept the typed name (`e2e0107abcdsw`), and the server builds the address
  `stg-e2e0107abcdsw.tracy.site`. The script sends the typed name, while the manifest, containers, URLs and cleanup use the prefixed name.
  If the server returns a `siteKey` different from the name the suite computed → the suite records the real site in the manifest for cleanup and stops
  (`createSite`, `lib/sites.mjs`).
- **Fixed accounts.** Each role has one account reused across runs: `e2e-staging-<role>@example.test`
  (tracy-web has no account-deletion door, so per-run accounts would pile up). Sites, seats, invitations and comments still belong to
  the run and are still cleaned up. J8 resets notification preferences after measuring. **Run only one staging run at a
  time** (two runs sharing accounts would see each other's Inbox).
- **DNS.** `stg-*` CNAMEs are issued by a 20-second timer on the staging machine ([`may-staging.md`](may-staging.md)); a `done` job
  does not guarantee the address resolves yet.
- **Deliberately off on staging, recorded as `NOT APPLICABLE`, never painted green:** GitHub sign-in (`GITHUB_OAUTH_*` empty, the button hides
  itself), the beta/whitelist gate (`BETA_GATE=off`), every Telegram notification (including CS support handoff). Google sign-in runs with staging's own
  OAuth client; only emails in Test users can sign in.

## A. Features — walking a round by hand

Taken from the code at `origin/staging` `3aa1df102` (routes in `apps/tracy-web/src`, plugins in the bundle
`packages/bundle/tracy-native`), not yet all walked by hand on staging. A tab present in the code may still be hidden by a switch in
`/ops/ui`: if something is missing, record "in the code but off on staging"; do not guess.

Roles on a site: `owner`, `admin`, `developer`, `editor`, no `viewer` (`apps/tracy-web/src/seats/roles.js`).
The **Automatic** column: the journey checking it, or why it is still manual.

| Feature | Where | Who | Passes when | Automatic |
|---|---|---|---|---|
| Email-code sign-in, sign-out | `/login`, `/verify`, `/auth/me`, `/auth/signout` | customer | request a code, enter it, reload still the right person; signing out drops the session | J0, J1, J12; the code-entry step: **manual** (no test mailbox) |
| Google sign-in | `/signin/google` | emails in Test users | first and later times both land in the right account | **manual** |
| My Sites | `GET /api/sites`, plugin `tracy-my-sites` | customer | only sees sites they have a seat on; opening a site enters the right workspace, the role chip is right | J9 |
| Add site WordPress / Joomla / EmDash | Add site (`/new/`), `POST /api/sites` | customer → owner | address `stg-<name>`, job finishes, home page and admin answer | J2a (wizard), J2b (API) |
| Site questions, quickstart, Design inspiration | wizard, `GET /api/templates`, `/api/sites/questions` | customer | picks a template of the right platform; answers reach the site, not just the form | J2a, J9; visual quality: **manual** |
| Importing a WordPress/Joomla site (Claude Cowork) | Add site › Import | owner of the source site | the copy runs, the source site is unchanged | **manual** (the suite has no source site yet, J2c) |
| Build from design / Brand | the `tracy-site-build-*`, `tracy-brand-engine` plugins | seats with write rights | the real page wears the chosen design | **manual** |
| The site's start screen | the site workspace | every seat | four cards, Comments, Site changes, Team with faces and a count | J3 |
| Chat with the agent editing files | the chat box in the workspace | developer and up | the change appears on the site; Site changes has a row, Diff the right file; Undo reverts | J4a |
| Chat editing database content | the chat box | editor and up | DB and page change; `apply.revert` returns to the original | J4b |
| Backup and restore | the Backups tab | owner | create a point, edit, restore → files and DB back to the point | J4c |
| Comments, mentions, read state | pins on the page, the Comments panel | seats on the site | both people see the thread; unread count right | J5 |
| Team: invite, accept, change role, revoke | Team, `/api/team/invite` | owner/admin | the invitee has a seat; revoking makes an open tab lose access at once | J6 (accepting via My Sites; the link in the email: **manual**) |
| Inbox, notifications | Inbox, badge | everyone | B does something related to A → A sees an unread row; after reading the count drops | J7 |
| Settings: language, notification preferences | Settings | everyone | the eight languages en/vi/de/it/fr/nl/zh/es change both Tracy's and dsh's screens; turning a group off stops it | J8 (vi + one group); all eight languages: **manual** |
| Session safety and the site boundary | — | people without a seat | cannot view/write another person's site; forged cookies/headers dropped; CSRF blocked | J10, J11 |
| Draft / Go live | `/state`, `/go-live` | owner/admin | after Go live's job the site is public; can go back to draft | **manual** (no journey yet); custom domains do not go through this door |
| Site mail | `/api/sites/:key/mail` | owner/admin | sees mode/domain; a test send within the test scope | **manual** |
| API keys | Settings › API keys, `/api/me/keys` | seats | the secret shows exactly once; the list holds only metadata; can be revoked | **manual** (no journey yet) |
| The public API `/v1` | `https://api-staging.tracy.site/v1/*` | Bearer key | `/v1/me`, read, write with ETag; a revoked key → 401 | **manual** (no journey yet) |
| Docs and API reference | `https://docs-staging.tracy.site/` (since 11/10/2026; `api-staging.tracy.site/docs/` → 302 there) | everyone | links and examples point to staging, never calling production | **manual** |
| AI Assistant | the help button | customer | answers about the product, leads to the right screen, does not edit the site; reveals no one else's site | **manual** (the model is not deterministic) |
| The bar and preview on customer sites | `stg-*` sites | visitors / seats | the bar recognises the right person, Tracy cookies are not exposed to the CMS | partly in J2b, J10 |
| `/ops` (User Data Analytics, Agents, Fleet, Builds, Quickstarts, UI, Model, Mail…) | `/ops` | the operations team | every screen has staging's real data; read-only people cannot write | **manual**; write actions only on test records, then reverted |
| Billing / payments | — | — | not in the system (`CONTEXT.md`) | not applicable |

## B. Use cases — anyone can follow them

For each case record: who did it, the image tag (top of `report.md` or `/ops`), the time, the result `PASS / FAIL / BLOCKED / NOT RUN /
NOT APPLICABLE`, a screenshot on FAIL. A `PASS` on WordPress does not stand in for Joomla or EmDash. Use a separate Chrome profile
for staging: staging and develop cookies both live on `.tracy.site`. The order is the order to walk before opening a PR into
`main`: smoke first, depth after.

| ID | Who, wanting what | Do | Must see | Script |
|---|---|---|---|---|
| S00 | The tester confirms the right place | Open `cowork-staging.tracy.site`, `/ops`; record the image tag | It is staging, health green | J13 |
| S01 | A new customer signs in | `/login` → code → My Sites → reload → sign out → reopen the site link | The right person; signing out drops the session | J0, J1, J12 + manual (email code) |
| S02 | An agency creates sites on three platforms | Add site → choose a template → answer Site questions → create; open home page and admin. Repeat W/J/E | Address `stg-*`, the right template, the site alive | J2a, J2b (`--cms all`) |
| S03 | A site owner picks a design | Design inspiration → preview → Build from design / Brand | The real page wears the chosen design | manual |
| S04 | A site owner edits files through chat | Send a small request with a marker word → look at the page, Site changes, Diff → Undo | The text appears and then goes; Diff shows the right file | J4a |
| S05 | An editor edits content | Chat changes a tagline/title → read the page again → revert | DB and page change, then return to the original | J4b |
| S06 | A site owner creates a restore point | Backup → edit files and DB → Restore | Both back to the point | J4c |
| S07 | Two people talk through comments | A pins a comment, mentions B → B opens Inbox, replies, marks read | The right thread, the right recipient, the unread count right | J5, J7 |
| S08 | An agency hands out rights | A invites B as editor → B accepts → B tries an owner door → A changes the role, revokes while B's tab is open | Rights always follow the current seat | J6, J11 |
| S09 | A site owner tunes notifications | Turn off a notification group → the other person does something related → look at Inbox | The turned-off group has no row | J8 |
| S10 | A user changes language | Settings › Language → each language → reload; try a narrow screen | No blank screens, no leftover English on Tracy or dsh | J8 (vi) + manual (the other seven languages) |
| S11 | A site owner publishes | Go live → wait for the job → open the public site → back to draft | The state and the real site agree | manual |
| S12 | A developer uses the API | Create a key → `/v1/me`, read, write with ETag → revert → revoke → call again | The right scope; a revoked key is refused | manual |
| S13 | A stranger tries to get past the fence | Open A's site with B's session; forge cookies/headers; call write doors | Sees nothing, cannot write | J10, J11 |
| S14 | A site owner brings an old site in | Import WordPress/Joomla with an admin account or by installing the Claude Cowork plugin | The copy runs, the source site is unchanged | manual (J2c has no source site yet) |
| S15 | A customer needs help | Ask the AI Assistant about their own site and someone else's | Leads to the right screen, edits nothing, reveals nothing; CS handoff = NOT APPLICABLE on staging | manual |
| S16 | Operations reads the system | Walk the whole `/ops` rail | No 404, no empty screens, the data is staging's | manual |
| S17 | Operations changes something and reverts it | One `/ops/ui` switch → look at `GET /api/ui` and the customer page → put the old value back | No change left after the case | manual |
| S18 | The reviewer looks at docs and the things that are off | Docs/API ref; GitHub sign-in, beta gate, Telegram | Docs are usable; the things that are off are recorded NOT APPLICABLE | manual |
| S19 | Ending the run | Delete every site created by hand; wait for the DNS timer; read `report.md` | No site/container/CNAME of the run left | the script cleans up and reconciles itself; sites created by hand: manual |

## C. What the script does and does not do

- **Runs for real**: a real Chromium, real sign-in sessions (cookies minted inside the `tracy-web` container with its own
  secret, never leaving the container; they can only be minted for `e2e-…@example.test` emails), real sites on the staging fleet, real
  chat turns with the agent. The script checks results on the site (HTTP, content, Site changes rows) rather than trusting the agent's words.
- **Cleans up**: every site is written into `manifest.json` before creation, deleted through `DELETE /api/sites/:key`, then reconciled against
  `docker ps -a` and the `site` table. Anything left over reports `NOT CLEANED` and exits 1. A run killed midway is cleaned up by the next run.
- **Does not do**: reading email codes, Google sign-in, Import, Go live, API keys/`/v1`, Docs, Assistant, `/ops`. These cases
  are in the "manual" column of part B; journeys for Go live, API keys + `/v1`, Docs, Assistant and read-only `/ops` are the next
  step.
- **Does not run on CI** (yet): it runs from a machine inside the VPN. Moving it onto a runner needs checking whether the runner has SSH to the staging host.
