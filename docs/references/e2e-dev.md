---
description: The E2E suite on the develop environment (cowork.tracy.site) — one command from the Mac Studio walks the full user journey on the deployed version, cleans up everything it creates, and runs regression cases with --profile dev; how to run it, read the report, the rules on the dev machine and what it cannot check.
sources:
  - tests/e2e-dev/run.mjs
  - tests/e2e-dev/lib/env.mjs
  - tests/e2e-dev/lib/dev.mjs
  - tests/e2e-dev/lib/manifest.mjs
  - tests/e2e-dev/lib/sites.mjs
  - tests/e2e-dev/lib/report.mjs
  - tests/e2e-dev/bin/summary.mjs
  - tests/e2e-dev/bin/publish.mjs
  - tests/regression/run.mjs
---

# E2E on develop — `tests/e2e-dev/`

The same suite runs on staging with `--env staging`: [`e2e-staging.md`](e2e-staging.md). Plan, decisions and measurements: [`tasks/todo-e2e-dev-tracy-site.md`](../../tasks/todo-e2e-dev-tracy-site.md). The dev machine:
[`may-dev.md`](may-dev.md).

## Running

```bash
node tests/e2e-dev/run.mjs                                   # WordPress, every journey (~10 minutes)
node tests/e2e-dev/run.mjs --cms j,e --only J2b,J3,J12       # Joomla + EmDash smoke (~8 minutes)
node tests/e2e-dev/run.mjs --only J4a --keep                 # one journey, keeping the site to open and look at
node tests/e2e-dev/bin/summary.mjs                           # merge the runs → ~/TCH-local/e2e-dev/summary.md
node tests/e2e-dev/bin/publish.mjs                           # push the secret-filtered report to the qa/e2e-dev-runs branch
node tests/regression/run.mjs --profile dev --stand https://cowork.tracy.site --id REG-001   # a regression case on dev
node tests/regression/run.mjs --profile dev --dry-run        # which cases can run on dev, and why the others cannot
```

Needs: passwordless SSH to the dev host (`<dev-host>`) from the running machine, Playwright's Chromium (loaded from
`apps/tracy-host` through `createRequire`, without changing the root lockfile). Output: `~/TCH-local/e2e-dev/<runId>/report.md` + `report.json`
+ `evidence/`. The report opens with the **deploy manifest** (web/host/dsh images, sidebar fork version, template count) the run measured — the
results only hold for that manifest; `run.mjs` re-reads the images at the end of the run and writes "deploy changed during this run" if dev changed midway.

## Journeys

| J | Checks | Default CMS |
|---|---|---|
| J13 | `check-server.sh`, the deploy manifest | — |
| J0 | cookie mint → `/auth/me` with the right email, cookie attributes | — |
| J1 | `/login` returns `{ok:true}`; reading the code = BLOCKED (no test mailbox) | — |
| J2a / J2b | Add site through the wizard / through the API → ready → owner 200, a stranger sees no Tracy data → delete → reconcile | W / W (J, E smoke) |
| J3 | the start screen: four cards, Comments greyed + dot, Site changes, Team faces + count, role chip | W (J, E smoke) |
| J4a/b/c | chat edits a FILE → Changes → Diff → Undo; chat edits DB content → `apply.revert`; Backup → edit → Restore | W |
| J5 / J6 / J7 | Comments between two people + `seenN`; Team invite/accept/change role/revoke (an open session loses access at once); Inbox between two people | W |
| J8 / J9 | language + notification preferences take effect; My Sites + Design inspiration | — |
| J10 | forged identity cookies/headers are dropped, `frame-ancestors`, `POST /state` draft/managed | W |
| J11 | an editor gets 403 at owner doors, another person's site 403, CSRF `CSRF_ORIGIN`; cross-site file tools = BLOCKED (no door outside the model) | W |
| J12 | reload keeps the session, sign-out, deleting a site → 404 + no container | W (J, E smoke) |

J2c (Import) is outside v1 coverage.

## Rules on the dev machine (the suite holds them itself; whoever edits the suite must keep them)

- Only create/delete the run's own resources: sites `e2e<runId>…`, emails `e2e-<runId>-*@example.test`; every resource is written into
  `manifest.json` BEFORE the request; cleanup in `finally` through `DELETE /api/sites/:key`, then reconcile `docker ps -a` + the `site` rows. A run
  killed midway is cleaned up by the next run. Accounts cannot be deleted (no door) — recorded as `kept-no-door`.
- `devExec` has only predefined operations (ps, logs, inspect, reading files, psql inside `begin read only`, minting cookies); no deploy,
  restart, compose, editing `/etc/tracy`, or SQL writes.
- Real chat (dev's DeepSeek): a ceiling of 6 prompts and 24 minutes per run, retries included (`chat-budget.json`). It only checks the mechanism.
- Browser errors: errors of Tracy plugins/doors turn it red; customer-site errors during a site-checking step turn that journey red; analytics,
  `ERR_CACHE_MISS`, and known errors in `lib/known-errors.mjs` go into notes.
- Results are pushed to `qa/e2e-dev-runs` only after `redact` + a secret grep (cookies, `tracy_sess=`, `Bearer `, 6-digit codes, `/invite/`).

## Known reds (04/10/2026)

#888: `robots.txt` cached by Cloudflare for 4 hours after unpublish (J10 FAIL until fixed); `ja-impact` j6 has a jQuery error (J2b uses
`ja-essence`); Joomla provision races with MariaDB (once in 5); deleting a site still being built leaves a `job` row `running`;
`/dsh-subscriptions/status` 404. EmDash takes ~9 minutes to build right after a deploy (the image is rebuilt) — running the suite right after a deploy,
EmDash may retry.
