---
name: staging-check
description: Accept a staging deployment before the release PR into main — Claude runs the real E2E suite (`tests/e2e-dev/run.mjs --env staging`) and watches the server, a human tester does what needs human eyes in a shared browser window, and the results go into a dated checklist. Use when asked to "test staging", "accept staging", "check staging before merging main", or /staging-check.
---

# Accepting staging before a PR into `main`

Full reference (feature list, use cases, commands): [`docs/references/e2e-staging.md`](../../../docs/references/e2e-staging.md).
This skill is **the fastest way to run one round**: script and human in parallel, about 45–60 minutes.

## Rules

- Touch staging only. Its ssh target is a machine setting (`E2E_SSH_STAGING`, read by `scripts/lib/machine-hosts.mjs`), reached
  on a private address. Production is **read** only, and only when the tester agrees.
- **One staging E2E round at a time**: the test accounts are fixed (`e2e-staging-<role>@example.test`), so two rounds at once see
  each other's inbox.
- Results hold only for the image that was measured: write the image tag (J13) at the top of the checklist; staging redeployed
  midway → run again.
- Speak to the tester in **concrete tasks** (where to go, what to press, what they must see), never in case codes (S04, J7…).
- A new bug: report it at once with evidence, and ask before digging deeper. Delete nothing but the round's own sites and resources.

## Step 0 — prepare (Claude, ~1 minute)

```bash
git fetch origin && git log -1 --format='%h %s' origin/staging        # what staging runs
node tests/e2e-dev/run.mjs --env staging --only J13,J0                  # health + session, read-only (~30 s)
```

Open a new dated checklist, copy the table from the last round, and write the J13 image you measured. Open the **known-bugs list**
at the end of the last round: those are not reported again as new, only marked "still there / gone".

## Step 1 — run in parallel

**Claude, in the background** (skip if the suite is red because of the machine rather than the product):

```bash
node tests/e2e-dev/run.mjs --env staging                      # core on WordPress: every journey, ≤6 model prompts
node tests/e2e-dev/run.mjs --env staging --only J2b --cms j,e # create Joomla + EmDash sites through the API
```

Read the run's `report.json`; `leftover` must be empty. A FAIL caused only by a known console error is a functional PASS — say so.

**Claude, at the same time:** follow the server logs, filtering known noise:

```bash
ssh "$E2E_SSH_STAGING" 'sudo docker logs -f --since 1s tracy-tracy-web-1 2>&1 & sudo docker logs -f --since 1s tracy-tracy-host-1 2>&1 & wait' \
  | grep -E --line-buffered -i 'error|exception|fail| (4|5)[0-9]{2} ' \
  | grep -v --line-buffered -E 'token=|Error: aborted|TypeError: terminated|other side closed|undici|own copy' \
  | awk '{ print substr($0,1,300); fflush() }'
```

Open one Playwright window on the staging sign-in page for the tester to sign in with their real e-mail; while they work, read the
console and network requests and check the server side (the real page with `curl`, containers with `docker ps -a`, the `site` table).

**The tester, by hand** — one task at a time, in this order:

1. Sign in with the code mailed to a real address; reload and stay signed in.
2. Add site → **Create a new site** → WordPress → name it → Create site, with DevTools › Console open while waiting. The site comes
   up; its home page and start screen (Edit, Comments, Site changes, Team) open.
3. In the site's chat: *"Change the site tagline to: Staging test <date>"* → the page changes → press **Undo** → back to the old one.
4. In the chat: *"Change the colour of the … button to blue"* → Site changes shows "Changed 1 file" → open the Diff: exactly one
   CSS file → the preview shows the new button.
5. Design inspiration: filter by WordPress/Joomla/EmDash, search, open a template's pages, start from a template.
6. Settings › Language: switch a few languages, reload, look at both Tracy's and dsh's screens.
7. `/ops`: open each section, look only.
8. The API docs (`/docs/`): links and examples point at the staging API.
9. A private window on the sign-in page: no GitHub button (staging turns it off on purpose).
10. Delete the site from step 2; tell Claude, who checks that its container, DNS record and GitHub repo are gone.

What staging deliberately lacks is written NOT APPLICABLE, never green.

## Step 2 — close

- Fill each checklist row: who did it, PASS/FAIL/BLOCKED/NOT APPLICABLE, one line of evidence.
- For each new bug: ask whether production may be read to compare; if production has it too, it is "existing", not a blocker.
- Conclude for the tester in three groups: **works**, **already broken on production**, **must be fixed before the merge**.
