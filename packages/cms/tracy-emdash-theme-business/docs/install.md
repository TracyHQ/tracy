# Installing a new site

Read ../AGENTS.md and ../README.md. This guide defines order and safety; the exact
commands are in README.md §Install and run and §Sign in to the admin on a built site:

```bash
node tools/distribution.mjs verify .                     # when installing from a packed artifact
tools/clean-install.sh <new-empty-dir> <free-port>       # install, build, start, bootstrap
node tools/configure-smtp.mjs --site http://127.0.0.1:<port> --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025
node tools/admin-session.mjs --site http://127.0.0.1:<port> --email tracy-agent@tracy.ai --out admin-state.json
lsof -ti tcp:<port> -sTCP:LISTEN                          # the server's pid, to stop it
```

## Inputs

- A dedicated new/empty destination outside another project and a free port.
- The template source, its standalone lockfile and approved distributable assets.
- A compatible Node runtime; the remediation run used Node 24.11.1. Native SQLite
  dependencies must be installed for the runtime that will execute the server.
- The package's pinned package manager, not an arbitrary global pnpm version.
- The chosen site origin and separate data/uploads locations with correct ownership.

## Sequence

1. Resolve the packaging safety gate in checks-and-recovery.md before producing a
   customer installer artifact. Never package a working site's entire directory.
2. Inspect template.config.json. Keep Tracy Business identity and the shipped locale list;
   review site-specific mail settings without erasing Northgate content.
3. Use the clean-install workflow only on a fresh target, explicitly specifying
   destination and site port according to README.md. Do not bypass preflight.
4. Install from the lockfile, build SSR and start the owned process. A persistent
   site runs the built server, not a public development server.
5. Bootstrap schema/content/media/forms against that exact origin and data path.
   No automatic --force. Preserve receipts for resume and conflict detection.
6. Establish the owner's real admin authentication. Development bypass is not a
   customer login mechanism and must not work on the deployed build.
7. Follow the acceptance checklist; record the origin, runtime and actual results.

## Environment and ownership

Supply environment variables to the running process explicitly; do not assume
that creating .env alone makes every launch command load it. Use .env.example as
the list of supported settings, including EMDASH_SITE_URL, encryption key and
SITE_DATA_DIR. Never commit actual values or reuse another site's token.

Preserve the encryption key securely for recovery of encrypted configuration.
SMTP credentials, sender and notification recipients must belong to the intended
installation. Mailpit evidence proves local delivery only, not production delivery.

A localhost installation, a deployable package and a Tracy site-build integration
are separate deliverables. This folder alone does not register the template in
Tracy's catalog or prove fleet provisioning. Do not silently fall back to another
template when integrating it into the build workflow.

## Installing from a quickstart release

A release on `JoomlArt-Products/ja-products` (tag `tracy-business/emdash-0.x`, schema
`tracy-quickstart/v1`) carries the packed source as a zip and a state snapshot as a tarball
(`data/data.db` scrubbed of tokens, sign-in state and logs; `data/seed-receipts.json`;
`uploads/`), plus `manifest.json`, `SHA256SUMS` and `VERIFICATION.json` with the gate results.
`tools/release.mjs` assembles it from a packed artifact and the clean site the gate ran against;
it never publishes — the printed `gh release create --draft` line is for a person.

1. Check `SHA256SUMS`, unzip the source into a new directory, and (optionally) extract the
   state tarball into it. The snapshot keeps the agent account row (no credential) so EmDash
   still reports setup complete; restoring it means no seed run and the demo content is there
   before the first request.
2. Start the built server (`Dockerfile`, or install + build + `node dist/server/entry.mjs`)
   with `EMDASH_SITE_URL` set to the public origin and a fresh `EMDASH_ENCRYPTION_KEY`.
3. Run `tools/bootstrap-site.sh <origin> ./data`. With the snapshot restored it mints the
   agent token for this site and adopts the content (`untracked 0`, no writes); without it,
   it seeds. The token is never part of a release.

On a Tracy fleet host `provision/emdash/deploy-quickstart.sh <product> [--from <dir>]` does
these steps, builds the image on the host, binds the site to loopback and publishes one
hostname per template through the host's tunnel (`<label>.tracy.ai`, one level only —
Universal SSL covers `*.tracy.ai` and nothing deeper). A redeploy keeps `data/` and
`uploads/`; only the image changes.
