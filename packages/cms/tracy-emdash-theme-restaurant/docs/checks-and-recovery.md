# Acceptance, packaging and recovery

## Acceptance commands (package root)

In the package as shipped only `pnpm test` (it needs Playwright's Chromium: `pnpm exec playwright install chromium` in the site folder; the cases that need the repository skip and say why) and the tools that need a running site (`audit.mjs`, `admin-session.mjs`, `admin-roundtrip.mjs`, `forms-check.mjs`, `recovery-check.mjs`) can run. The `qa-contract`, `visual-qa`, `fast-gate`, `qa` and `qa-receipt` commands below need `qa.contract.json` and `source/snapshot`, which are in the repository checkout only.

```bash
node tools/qa-contract.mjs …                       # contract validation (qa.contract.json, built by ingest/build-contract.mjs)
RENDER_CHROME_PATH=<chrome> node tools/visual-qa.mjs --contract qa.contract.json --site <origin> --source-site <origin of the source mirror> --out evidence/<run> --scope fast-gate|full --config template.config.json
node tools/fast-gate.mjs verdict evidence/<run> --contract qa.contract.json
node tools/qa.mjs --contract qa.contract.json --source source/snapshot --site <origin> --out <new dir> --browser --visual --visual-fast-gate evidence/<fast-gate run> --reviews evidence/reviews --config template.config.json
node tools/gates.mjs <qa run>                      # one line per gate
node tools/qa-receipt.mjs <forms|editability|recovery|security|build|…> --report <qa run>/report.json --out evidence/reviews …
node tools/generate-docs.mjs --check               # docs complete and fresh
```

Machine runs write their evidence under `evidence/<run>` and the signed receipts under `evidence/reviews`; both are local and not part of the package. The source mirror `source/snapshot` is not part of the package either; `source/REBUILD.md` says how to rebuild it from the pinned release.

## Commands a recipient can run on a built site

`<origin>` is where your site listens, e.g. `http://127.0.0.1:4361`; run them from the installed site folder.
`audit.mjs`, `admin-session.mjs`, `admin-roundtrip.mjs` and `forms-check.mjs` drive a browser through Playwright, which
`pnpm install` puts in the installed site's `node_modules` only (the package folder has none): install its Chromium once
there with `pnpm exec playwright install chromium`, or point `RENDER_CHROME_PATH` at a Chrome of your own. Playwright keeps
its browsers in `.cache/ms-playwright` in your home folder (about 660 MB), not in the site folder: remove them with
`pnpm exec playwright uninstall --all`, or delete that folder, when the checks are done.

```bash
node tools/audit.mjs <origin> <new out dir> --config template.config.json     # routes, SEO, 404s, assets -> <out>/audit.json
node tools/admin-session.mjs --site <origin> --email tracy-agent@tracy.ai --out admin-state.json
node tools/admin-roundtrip.mjs --site <origin> --storage-state admin-state.json \
  --entry /_emdash/admin/content/posts/<entry id> --field field-title --public <the post's public path> --out roundtrip.json
```

`roundtrip.json` starts with the verdict: `status` (`pass` when every step passed) and `failed` (the names of the steps
that did not); `steps` holds each step with its detail, and the exit code is 0 for a pass, 1 otherwise.

Pick for `admin-roundtrip.mjs` a field the public page prints: a post's title is printed on its page, while a Pages
entry's title is not printed by every page view, so the round trip can find no change on the public page although the edit
was published. The Chefs page is the post `chefs` (category `pages`) at `/pages/chefs`; no page links it, as in the source, so the audit's crawl does not reach it (open it by its address). Pictures drawn with
`loading="lazy"` (the dish pictures of the Menu pages among them) load only once they are shown and scrolled to: a generic
image check that does not scroll the page first counts the hidden or unscrolled ones as undecoded, although nothing is
broken.

In the package, the cases of `tests/release-site-pages.test.mjs` that run `tools/release.mjs` need a Tracy repository
checkout (`TRACY_CHECKOUT`): they run only in the repository: in the package they are skipped and say why.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-restaurant-<stamp>.tgz` (online SQLite backup, uploads,
receipts, token). `tools/restore.sh <archive> [data] [uploads]` — with the site stopped — validates the whole archive, then
moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip on a running
site (restart, backup, change, restore). Exclude `data/`, `uploads/`, tokens, backups and `*.before-restore-*` from any
source export (`tools/distribution.mjs` refuses them).

## Encryption key

Plugin secrets (SMTP passwords) are encrypted with `EMDASH_ENCRYPTION_KEY`. A restore needs the same key: keep it with the
backup in a separate private place. Without it the site works but the plugin secrets must be entered again.

## Known blockers and limits

Mail delivery was proven only to a sandbox mailbox. The 22-language questionnaire is Claude-translated. The dark theme has
no source to compare with. `source/REBUILD.md` was not executed end to end. Pages not ported: the visitor-account pages (login, registration, profile, reminder, reset), Typography, the Offline and Error demo pages, the four colour demos and group headings; they answer 404.

Read ../AGENTS.md. Regenerate inventory after source changes with
`node tools/generate-docs.mjs`. When validation is authorized, run
`node tools/generate-docs.mjs --check`; it checks completeness/freshness, not prose
accuracy or runtime behavior. Regenerate artifact.json after documentation updates.

Acceptance includes clean install, editor-safe import, real admin publication,
localized routing/SEO, visual comparison, interaction, forms and owned-site recovery.
Record skips honestly. Export source through an explicit allowlist; exclude customer
databases/uploads, secrets, tokens, backups and all *.before-restore-* directories.
Ship AGENTS.md/docs for agents, outside public routes. Independent handoff must use
these instructions rather than undocumented context from the author.
