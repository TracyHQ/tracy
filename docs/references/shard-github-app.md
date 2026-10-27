---
description: Each shard of the beta has its own GitHub App on its own GitHub org — why, tracy-web's four GitHub variables, exactly which permissions the App needs according to the code (and how things break when one is missing), the steps to create, check, hand the values to the shard's installer, acceptance, revocation; the two gaps of the beta (the release repo, the design-inspirations repo).
sources:
  - apps/tracy-web/src/github/app.js
  - apps/tracy-web/src/github/route.js
  - apps/tracy-web/src/config.js
  - apps/tracy-web/src/lib/quickstart-releases.js
  - apps/tracy-web/src/lib/release-assets.js
  - apps/tracy-web/src/ops/general.js
  - apps/tracy-host/src/sync.js
  - packages/fleet/tracy-fleet-operation/scripts/tools/sync-brands.sh
---

# The shard's GitHub App

Shard beta: **each shard has its own GitHub App, on its own GitHub org** (`tracy-sites-<shard name>`:
`tracy-sites-s1`, …, and `tracy-sites-d1` for the trial shard on dev). Spec §6.1 and door contract §9 of the
shard beta live on branch `chore/explore-tch-2026-10-14` (not yet in `develop`); this document copies only what
is needed to build, and every statement about behaviour is checked against the code in the functions named.

**What this runbook does:** create the org + App, check permissions, and **hand the values** to whoever runs
the shard's installer (`install-shard.sh`, which comes with the shard line; not yet in `develop` when this
document was written). **Does not:** write env, generate secrets. The `GITHUB_*` keys are inputs to the installer;
it writes them **once** into `/etc/tracy/tracy-web.env`. Adding a line to that file by hand is the wrong procedure.

## Why a separate App and a separate org

- **There is no broker door on master.** `/fleet/git-token` looks up the host's channel in `config.hosts` (`HOSTS`,
  `readHosts`) and requires the site to be in that same tracy-web's DB (`siteRepoOwner`, then compares `site.host` and
  `site.label`). A shard's sites exist only in the shard's DB, so master cannot issue tokens for them.
- **A separate org, not just a separate App.** Creating a repo needs `administration: write` on the org
  (`CREATE_PERMISSIONS`; `createSiteRepo` asks the **org's** installation via `orgInstallationId`), and that permission
  is also the permission to delete repos (`deleteSiteRepo`). An installation with that permission on "All repositories" of
  `TracyHQ` can delete every TracyHQ repo. A shard runs customer code and the agent's shell; the App key on the
  shard must only reach that shard's own site repos. With a separate org, `deleteSiteRepo` also refuses by itself any repo
  outside `GITHUB_ORG`, and `deleteRepoFor` leaves a repo belonging to another org untouched (`'kept'`).

## tracy-web's four GitHub variables

`readGithub` (in `config.js`) requires **all four** variables; missing one returns `null`, meaning **GitHub is off**:

| Variable in `tracy-web.env` | From where | Who writes it |
|---|---|---|
| `GITHUB_APP_ID` | App ID, step 3 | installer, from the input of the same name |
| `GITHUB_APP_PRIVATE_KEY` | `.pem` file, step 3 | installer reads `GITHUB_APP_PRIVATE_KEY_FILE`, writes one line (newlines become `\n`; `readGithub` restores them) |
| `GITHUB_ORG` | org, step 1; must be `tracy-sites-<shard name>` | installer, from the input of the same name |
| `GITHUB_WEBHOOK_SECRET` | does **not** go through the runbook | installer generates it itself (`/etc/tracy/shard-secrets.env`) |

When GitHub is off: `createRepoFor` returns `NOT_CONFIGURED` (the new site finishes but the job result has
`repoError: NOT_CONFIGURED`, no repo), the `/github/*` doors and `/fleet/git-token` return 503
`GITHUB_NOT_CONFIGURED`. `ja-products` releases can still be read with the PAT (see step 5), because `releasesToken`
uses the PAT when `config.github` is `null`.

**The site repo's hook is not the App's webhook.** Right after `createSiteRepo`, `createRepoFor` calls
`ensureRepoWebhook` to attach to **each repo** a hook pointing at `${TRACY_ORIGIN}/github/push` (idempotent by
URL), `push` events only, signed with `GITHUB_WEBHOOK_SECRET`. The code neither creates nor relies on an App-level webhook, so step 2 leaves it off.

## The App needs exactly these permissions (read from the code)

| Permission (Repository permissions) | Level | Used by the code in |
|---|---|---|
| Administration | Read and write | creating site repos and deleting repos Tracy created (`CREATE_PERMISSIONS`) |
| Contents | Read and write | the token that pushes the site's webroot and reads diffs for the push police (`TOKEN_PERMISSIONS`) |
| Pull requests | Read and write | that same token (`TOKEN_PERMISSIONS`) |
| Metadata | Read-only | required by GitHub; also in `TOKEN_PERMISSIONS` |
| Webhooks | Read and write | attaching and fixing each repo's `/github/push` hook (`WEBHOOK_PERMISSIONS`, i.e. `repository_hooks`) |

**Organization permissions: none. Account permissions: none. Subscribe to events: none.**
The App uses no user-to-server token; the repo's hook picks `push` by itself.

The code always asks for a token **narrower** than the installation's permissions (each door its own permission set: create/delete repo, push code,
attach hook), and GitHub refuses (422) a token that asks for more than the installation has. Therefore:

- **A missing permission breaks things, and breaks them fairly silently** (table below).
- **An extra permission breaks nothing**, but the key lives on the shard, so keep exactly these five permissions, add none.

| Missing | Symptom |
|---|---|
| Administration | `createSiteRepo` cannot mint a token → `GITHUB_UNAVAILABLE`; the job result has `repoError: GITHUB_UNAVAILABLE` |
| Webhooks | the repo is created but the job result has `repoWebhookReason: app_lacks_repository_hooks` |
| Contents or Pull requests | `mintTokenFor` returns `null` when GitHub answers 422; provisioning still runs but **with no push token** (`gitTokenFields` returns `{}`), `/fleet/git-token` returns `APP_NOT_INSTALLED` even though the App is installed |

The last row is why step 6 checks permissions by machine before handing the key to the installer.

## Steps (for shard `s1`; `d1` on dev is identical, org `tracy-sites-d1`)

1. **Org.** Create GitHub org `tracy-sites-s1` (the Free plan is enough for private repos). The owner is designated by the SRE
   in charge; add at least two owners so access to the org is not lost.
2. **App.** In that org: Settings → Developer settings → GitHub Apps → New GitHub App. Name `Tracy sites s1`.
   Homepage URL: the shard's public origin (the shard's `TRACY_ORIGIN` value). **Webhook: uncheck Active**
   (see the "four variables" section). Permissions: exactly the table above, add none. "Where can this GitHub App be installed?":
   **Only on this account**.
3. **Key.** Open the App page → create a new private key (GitHub's current label: `Credentials` → `Key pairs` →
   `New key`; older version: `Private keys` → `Generate a private key`; the exact label in today's UI: UNVERIFIED).
   The browser downloads a `.pem` file (PKCS#1, first line `-----BEGIN RSA PRIVATE KEY-----`; GitHub keeps only
   the public half). Store the file in the team password manager, note the **App ID** at the top of the
   App page, then `chmod 600` the file on your machine.
4. **Install.** Install App → org `tracy-sites-s1` → **All repositories**. This org holds only s1's site repos, and
   a newly created repo must be in the installation right away; besides, `hostRepoMissing` only trusts a repo's 404 as
   "the repo is gone" when the org's installation is `all`.
5. **Release-reading token.** A fine-grained PAT, resource owner `JoomlArt-Products`, Repository access
   **only** `JoomlArt-Products/ja-products`, permission **Contents: Read-only**; issued by a JoomlArt-Products member.
   One PAT per shard (revoked separately); store it in the team password manager. The org may require
   an owner to approve the PAT before it can be used (the JoomlArt-Products org's policy: UNVERIFIED). This is
   `TRACY_RELEASES_GITHUB_TOKEN`: it reads the release list, downloads assets by id, and is handed to the host when building
   a site from a private template. Since the shard's App is not installed on `ja-products`, `releasesToken` switches to the PAT
   exactly when GitHub answers 404 to the installation query (see "Two gaps", 1).
6. **Check the installation** (on your machine, **before** handing the key to the installer; needs Node 18 or later). The
   App's installation list must be exactly one row: the shard's org, `all`, all five permissions. The command prints only the login,
   the repo selection type and the permissions; it prints neither the JWT nor the key.

   ```bash
   node --input-type=module -e '
   import { createSign } from "node:crypto"
   import { readFileSync } from "node:fs"
   const [appId, keyFile] = process.argv.slice(1)
   const b64 = (s) => Buffer.from(s).toString("base64url")
   const now = Math.floor(Date.now() / 1000)
   const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))
   const body = b64(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
   const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(readFileSync(keyFile)).toString("base64url")
   const res = await fetch("https://api.github.com/app/installations", {
     headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${head}.${body}.${sig}`, "User-Agent": "tracy-shard-check" }
   })
   const out = await res.json()
   if (!res.ok) { console.error(res.status, out.message); process.exit(1) }
   for (const i of out) console.log(i.account.login, i.repository_selection, JSON.stringify(i.permissions))
   ' "<App ID>" ./s1-github-app.pem
   ```

   Expected (key order may differ):
   `tracy-sites-s1 all {"administration":"write","contents":"write","metadata":"read","pull_requests":"write","repository_hooks":"write"}`.
   Missing permission → fix the App (Permissions & events) then **accept** the permission upgrade request on the org's
   installation page. A `TracyHQ` or `JoomlArt-Products` row → remove that installation. Reports `401` → wrong App ID or wrong key
   file.
7. **Hand the values to whoever runs the installer.** The values below are **inputs** to `install-shard.sh`
   (the `--inputs` file, mode 0600); the installer writes them into `tracy-web.env`. All four are required.

   | Installer input | Value |
   |---|---|
   | `GITHUB_APP_ID` | App ID, step 3 |
   | `GITHUB_APP_PRIVATE_KEY_FILE` | path of the `.pem` file **on the machine running the installer** (mode 0600) |
   | `GITHUB_ORG` | `tracy-sites-s1` (contract §9: exactly `tracy-sites-<shard name>`, never `TracyHQ`; the installer checks this) |
   | `TRACY_RELEASES_GITHUB_TOKEN` | PAT, step 5 |

   Get the key file onto the machine running the installer without printing it to the terminal: `scp` the file already `chmod 600` (or `umask 077`
   then paste with an editor), then check the mode and first line with `stat` and `head -1` (prints only the `BEGIN` line). After the install
   run, delete the key file and the `--inputs` file on that machine (`shred -u`); the original is in the password manager.
   `GITHUB_WEBHOOK_SECRET` is not in the table because the installer generates it itself; do not copy
   master's or another shard's `GITHUB_APP_*`/`GITHUB_ORG`/`GITHUB_WEBHOOK_SECRET` over.
8. **Acceptance on the shard** (after the `install-shard.sh` run):
   1. `/ops/settings/integrations` (the shard's `tracy_admin` seat): the "Per-site GitHub repositories" block and the
      "Quickstart releases (ja-products)" block both show **Ready**; if not, the screen names the missing variable (or "n of 4 keys").
   2. The tracy-web container's log: within a few minutes there is a line `[releases] N read from JoomlArt-Products/ja-products`
      (N > 0). At the same time **there is a normal warning line**, every time the process starts:
      `[releases] no webhook on JoomlArt-Products/ja-products: app_not_installed` (the shard's App is not installed
      on `ja-products` so it cannot attach the release hook; see "Two gaps", 1).
   3. Create a test site: the job result has `repo: tracy-sites-s1/<label>`, **no** `repoError` and
      `repoWebhookReason`. In the repo: Settings → Webhooks has a hook pointing at `<the shard's TRACY_ORIGIN>/github/push` (e.g.
      `https://<shard-origin>/github/push`), event `push`; the first delivery (`ping`, if GitHub sends it) returns 200 (UNVERIFIED on a real shard).
   4. Delete the test site: the delete answer has `repo: true` and the repo disappears from the org.

## Revocation and rotation

| Task | How |
|---|---|
| App key leaked or needs rotating | GitHub **does not allow deleting the only key**: create the new key first (step 3), then rerun `install-shard.sh --inputs … --force` with `GITHUB_APP_PRIVATE_KEY_FILE` pointing at the new file (`--force` rewrites the env files, regenerates no secret), and only then delete the old key. Leaked key: delete the old key right after the new key exists; from then until the installer finishes, the shard cannot create repos or push code (sites keep running). tracy-web reads env at startup (`readConfig`), so after the install run follow this order: (1) if the installer does not recreate the `tracy-web` container itself, recreate it; (2) then rerun step 8.3 (create a test site) to make sure it loaded the new key. The Integrations screen in 8.1 only tells whether the variables are set, not which key tracy-web is holding, so do not use it for acceptance of a key rotation. Do not edit `tracy-web.env` by hand. Tokens already issued live at most one hour |
| `GITHUB_WEBHOOK_SECRET` | `install-shard.sh --inputs … --force --rotate-webhook-secret`: this flag only goes with `--force`, regenerates **exactly one** key in `/etc/tracy/shard-secrets.env` then rewrites `tracy-web.env`. Do **not** delete the `GITHUB_WEBHOOK_SECRET=` line and then run `--force`: the installer sees a missing key line, stops and says so, and does not generate it itself. ⚠ The hooks of **old** repos keep the old secret until `createRepoFor` runs again for that site. The code only calls it when someone reads a `done` job of the site (`GET /api/sites/:key/jobs/:id`); there is no background sweep and no bulk re-attach tool, so for a site whose job nobody opens again the old hook stays. During that time `/github/push` returns 403 `BAD_SIGNATURE` and the push police does not see that repo's pushes. Rotating the secret on suspicion of a leak causes real damage here: weigh it before rotating |
| Release-reading PAT | Issue a new PAT (step 5), new `--inputs`, `--force`. Wrong or expired PAT: `refreshReleases` logs `[releases] GitHub answered …`, the quickstart list keeps the last version read |
| Retiring the shard entirely | Remove the installation from the org, delete the App, revoke the PAT. Site repos stay in the org until dealt with |

## Two gaps of the beta — need a decision

1. **The `ja-products` release repo.** The shard's App is not installed there; the shard reads with a read-only PAT (`releasesToken`,
   the fallback branch when GitHub answers 404 for the installation; when GitHub answers 5xx or the mint is refused it does **not** switch
   to the PAT). Consequences:
   - Every **write** to a release (`uploadReleaseAsset`, `deleteReleaseAsset`, the template buttons on
     `/ops`) is refused by GitHub because the PAT is read-only; the function returns `{ok: false, reason}` with GitHub's message. Do these
     tasks on master's `/ops`.
   - The release hook (`/github/release`) can only be attached by master (via `refreshReleases`), so the shard learns of new releases
     through a read every 10 minutes (and once at startup), not instantly.
   - **Differs from production in key lifetime.** Production hands the host an App token that lives one hour; the shard
     hands over **the PAT itself** (living until it expires): every time a site is built from a private template, `quickstartToken` puts
     it into the provision command sent to `tracy-host`. That is why the PAT must be read-only, single-repo, time-limited, and one per
     shard (step 5).
   - Production is unchanged: its App is already installed on `ja-products`, so it still mints tokens from the App.
2. **The `TracyHQ/design-inspirations` repo.** The shard's `tracy-host` runs `sync-brands.sh` (a 10-minute clock in
   `apps/tracy-host/src/sync.js`, first run 5 minutes after startup); the script asks for a token for this repo via
   `/fleet/git-token` (closed list `fleetSharedRepos`, by `HOST_ORG`, default `TracyHQ`). The shard's App
   is not installed on TracyHQ so every run gets `APP_NOT_INSTALLED`, the script exits non-zero (logged to
   `sync-brands.log` and the `[sync] sync-brands exited …` line of the tracy-host log); brands of sites on the shard
   do not reach the shared shelf. Two options:
   - **(a) Accept it in the beta** (proposed: grant no permission on TracyHQ to the key living on the shard). Note
     `TRACY_HOST_SYNC=0` is **not** a way to turn off just this: it turns off all three clocks, including pushing the site folder
     to the repo hourly and the daily cleanup of the copies' table snapshots.
   - **(b) Install the shard's App on TracyHQ** with "Only select repositories: design-inspirations". This requires switching the App
     to "Any account" (step 2 set "Only on this account"), and that installation also carries
     `administration: write` on this public repo.

Where secrets live and who may read them: [`ha-tang-bi-mat-deploy.md`](ha-tang-bi-mat-deploy.md). Releases from
GitHub are the source of truth for quickstarts: [ADR 0017](../adr/0017-github-release-is-quickstart-source-of-truth.md).
