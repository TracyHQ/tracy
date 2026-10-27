# Upgrading a running EmDash quickstart site

A site's `/app` is a named volume filled once from the image it was created with, so a newer build of
the template never reaches an existing site by itself. Two steps, both dry by default (`--apply` to
act, `--label <l>` for one site), both run on the host's docker next to the sites:

- `drop-old-guard.mjs` — gives `/app` back to `www-data` and takes the old MCP guard of Tracy
  Business 1.4.0–1.4.3 out of the site's own middleware (ADR 0022). Nothing else of the template
  moves. Run it first on a site whose `/app/src` is still root's.
- `redeploy-template.mjs` — puts the current template source (`REDEPLOYED`: `src/`, `public/`,
  `astro.config.mjs`, `tsconfig.json`, `tools/content-api/`, the Content API map and site model) into
  `/app` from the image tag the site names (or `--from <package dir>`), then `astro build` as
  `www-data` with the Content API switch and a restart. It refuses when `package.json` or
  `pnpm-lock.yaml` differ (needs a new image) and when the site edited a redeployed file since it was
  created (`--overwrite-edits` to replace them; a backup under `/app/.tracy-backup/<stamp>/` is taken
  either way). This is what gives an old site provenance stamps and the Content API route.

# Existing EmDash agent-token recovery

This directory holds the two halves of the agent-token repair, and they are separate on purpose:
`migrate-token-mount.mjs` installs the custody (the read-only single-file bind), and
`recover-agent-token.mjs` replaces the credential in the database. Neither does the other's job.

## Which half is missing

A `tracy_emdash` call that refuses `NO_TOKEN` means the container has no readable token. Read the
site with `inventory.mjs` first.

🔒 **The starting point is the HOST TOKEN, not the mount — and getting that backwards costs a run.**
`migrate-token-mount.mjs` verifies custody and authenticates the token *before* it writes anything:
a missing, non-regular, wrongly owned or wrongly moded host token returns `recovery-required`
(`custody-*`), and a token the site does not accept returns `recovery-required` (`auth-failed`).
Both refusals land before the compose patch, so "install the mount first, recover the credential
after" is not a sequence this tool will run for a site that is missing both. That is deliberate: a
read-only bind over a credential nobody can authenticate installs custody without proving it.

- **the host token is already valid, the container has no read-only mount** — the site predates
  #155, and the migration is the whole repair. Install the mount with
  `migrate-token-mount.mjs --selector <sha256hex> [--via-host]`, dry by default, `--apply` to write;
  it inserts exactly the `./tracy-agent.token:/run/tracy-agent.token:ro` item render-compose emits,
  proves the resolved config differs by that item and nothing else, recreates only the web
  container, and never touches the token's bytes, inode, owner or mode.
- **the token is missing or not accepted** — whether or not the mount exists, start at the staged
  recovery below and run it in this order: `stage` → write the root-owned `0600` token file **in
  place** (create it if absent; if it already exists, write through the existing inode, never `mv`
  over it) → `migrate-token-mount.mjs --apply` (installs the mount if it is absent, and proves the
  mounted reader authenticates either way) → `finalize`.

🔒 **THE MOUNT CAN BE STALE, AND THAT IS WHY THE ORDER ABOVE ENDS WITH `finalize`.** Docker resolves
a bind source to an inode once, when the container is created. A host token that was *replaced*
(`mv`, or delete-then-recreate) leaves the running container reading the OLD inode behind a mount
`docker inspect` still shows as the right source, the right destination and `ro`. Writing the new
credential in place is what avoids this; when it has already happened,
`migrate-token-mount.mjs` sees it — it digests the mounted file inside the container and compares
that with the host token's digest — and reports `mountedToken: stale-inode`, plans a
`--force-recreate` of the web container (`--apply` performs it) and re-proves the digest afterwards.
It never writes token bytes. Only after a run whose `mountedToken`/`mountedTokenAfter` is
`matches-host` **and** whose mounted auth passed is `finalize` safe: finalize revokes the previous
canonical token, so running it while the reader still holds that token is what takes the agent down.

🔒 **`mint-agent-token.sh` is NOT the repair for either half.** On a site whose compose declares the
read-only mount it no longer damages custody — it writes the one file in place and never recreates
the `data/` copy — but it still mints a NEW credential, and it creates no mount that is absent. Where
that mount is declared and the host token file is **gone**, it refuses with `TOKEN_CUSTODY_UNKNOWN`
(exit 8) and mints nothing, and `POST /_host/agent-token` answers the same code with 409: the running
container still reads the deleted inode, so a new file would be invisible to it while the mint
revoked the credential it is presenting. That state is the staged recovery below. So
it is not what heals a stale bind (only a recreate rebinds an inode), and it is not what heals a
site with no mount. It keeps the legacy behaviour it was written for — `mv` (a new inode) plus a
second copy under `data/`, both wrong the moment the mount is installed — **only** for a site the
host proves predates the mount: a compose file that is **exactly** the pre-#155 file
`render-compose.sh` wrote (no token bind), **and no host token file**. Everything else fails closed
with `TOKEN_CUSTODY_UNKNOWN` (exit 8; `POST /_host/agent-token` answers 409) and nothing is minted,
revoked or written: a compose file that is missing, unreadable, empty, malformed, or not exactly a
form the fleet writes, and — the case that used to be repaired — a compose that declares no mount
while `<siteDir>/tracy-agent.token` exists.

🔒 **Exact forms, not a YAML parser (Hano, 23/09/2026).** The door and the helper accept only three
spellings of `docker-compose.yml`, all derived from the fleet's own writers: `tracy_compose_emdash`
with the bind where it puts it, the pre-#155 output with no bind, and that pre-#155 output with the
single `- ./tracy-agent.token:/run/tracy-agent.token:ro` item `migrate-token-mount.mjs --apply`
inserts (blank lines and whole-line comments are ignored). A hand-edited compose — even a valid one,
a long-form bind, an absolute source, a reordered key — and a file written by an older generator are
refused on purpose: bring the file back to the generator's form (`render-compose.sh <label>` for a
site that already has its host token) before retrying. `test/render-compose.test.mjs` holds the
matchers to the generator's real output, so a change to `tracy_compose_emdash` that they do not know
turns a suite red instead of turning every new site into `TOKEN_CUSTODY_UNKNOWN`.
A protected site whose compose lost its mount entry while the web container kept the bind looks
exactly like that from the host, and the legacy repair there revokes the credential the container
reads. Neither the helper nor the door inspects the running container; that is this directory's job.

When `TOKEN_CUSTODY_UNKNOWN` comes back, do not delete the host token to get past it. Read the site
with `inventory.mjs`, then run `migrate-token-mount.mjs --selector <sha256hex> [--via-host]` dry: it
inspects the running container, digests the mounted file and reports whether the reader holds the
host token. A genuine pre-#155 site holding a valid host token is migrated by `--apply`; a token
that is missing or not accepted goes through the staged recovery below, which writes the credential
**in place**, with `migrate-token-mount.mjs` for the mount itself.

⚠ **A compose that lost its entry while the container kept the bind is NOT repaired by `--apply`.**
The file on disk now resolves to a different config than the one the running container was created
from, and `migrate-token-mount.mjs` refuses `config-drift` before it reads the token or writes
anything — dry or `--apply`. The safe road, in this order:

1. Do not recreate the container and do not touch the host token: the running bind is the one
   thing still holding a working credential.
2. Put the compose file back to the form the container was created from — `render-compose.sh
   <label>` for a site the generator wrote, or the generator's pre-#155 file plus the single item
   `--apply` inserts for a site that was migrated.
3. Run `migrate-token-mount.mjs --selector <sha256hex> [--via-host]` dry. Go on only when it answers
   `noop-already-migrated` with `configHash: match`, `mountedToken: matches-host` and
   `authAfter` authenticated; the door and the helper then answer again without minting.
4. If `config-drift` persists, or the mounted reader does not match, **stop**: do not `--apply`,
   do not recreate, and do not run `finalize` — finalize revokes the previous canonical token, which
   may be the very credential the container presents. Hand the site to a person with the dry
   run's report.

## Staged recovery

`recover-agent-token.mjs` is a narrow database helper for an already-running EmDash site. It uses
Node's built-in `node:sqlite`, `node:crypto`, and `node:fs` only. It does not create users, set
`emdash:setup_complete`, run setup/seed, change schema/content, mount files, recreate containers, or
declare deployment readiness.

Run the reviewed source through the selected web container as `www-data`; do not execute an
agent-writable helper or dependency as root. Create the private capture before starting the command:

```sh
docker exec -u www-data <label>-web-1 node -e \
  'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(":memory:").close()'

umask 077
stage_capture="$(mktemp /root/<label>.recovery.XXXXXX)"
trap 'rm -f "$stage_capture"' EXIT
docker exec -i -u www-data <label>-web-1 node --input-type=module - \
  stage /app/data/data.db < recover-agent-token.mjs > "$stage_capture"
```

The preflight explicitly loads `DatabaseSync` and opens a memory database. Fail closed if it fails.
The stage output is secret material and must remain in the root-only capture.

The stage stdout contains the PAT and is secret material. Capture it only in a root-owned `0600`
file; never put it in argv/env or logs. A successful line is `STAGED <stage-id> <ec_pat_…>`. The
helper refuses a missing, symlinked, non-regular, malformed, unsupported-schema, missing, disabled,
or non-admin fixed agent account. The default account is `tracy-agent@tracy.ai`; `--agent-email` is
an explicit operator override.

After the host has independently written the protected read-only token mount and authenticated the
new mounted reader/health path, finalize with the exact stage ID:

```sh
docker exec -i -u www-data <label>-web-1 node --input-type=module - \
  finalize /app/data/data.db <stage-id> < recover-agent-token.mjs
```

Before that point, `abort` removes only the exact temporary recovery row and preserves all prior
rows:

```sh
docker exec -i -u www-data <label>-web-1 node --input-type=module - \
  abort /app/data/data.db <stage-id> < recover-agent-token.mjs
```

Only call `finalize` after the host has installed the protected read-only mount and independently
authenticated that mounted reader against the live loopback MCP endpoint, requiring a successful
JSON-RPC `tools/list` response plus the site health check. A successful helper command alone does
not establish mount or deployment readiness.

Staging keeps all existing token rows and records a canonical-token snapshot in the temporary row's
marker name. Finalize refuses if the canonical agent-token state changed since staging, so a
concurrent recovery cannot silently revoke a newer canonical token. Finalize deletes only the
canonical `tracy-agent` rows for the same verified agent and renames the exact staged row in one
transaction. Abort also rechecks that the selected account is still the unique active admin; if an
account was disabled or demoted after staging, an operator must review the database state before
cleanup. It does not automatically delete stale stages.
