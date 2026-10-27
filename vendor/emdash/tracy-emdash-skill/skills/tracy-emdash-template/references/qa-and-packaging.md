# P7 — Acceptance · P8 — Package and handover

## Contract first, matrix after

Read [release-regressions.md](release-regressions.md) and [qa-contract.md](qa-contract.md) before
running the matrix or packaging. The matrix **is** the `pages × variants × states` of `qa.contract.json`;
`tools/qa.mjs --browser` runs it and writes `report.json`. A missing cell is `incomplete case coverage`,
not a "representative set". `shoot.mjs` is still used for a quick look midway (P3); it cannot replace
`qa.mjs` in P7.

Viewports and themes are the contract's `variants[]` (Business: 390 · 768 · 1440, dSF 1, light + dark); every
locale; **every route** — the full matrix is the P7 standard, never shrunk on your own to a "representative set". The representative
set has its own name and its own gate: **Fast Gate** ([qa-lenses.md](qa-lenses.md) §8) runs **before** full
so that shared defects are fixed once; it does not replace the matrix. `node tools/shoot.mjs <url> <out> --paths "$ROUTES"
--viewports 1440,390 --themes light,dark` then `--viewports 1280,768 --themes light,dark`. `shots.json`
records status, scrollWidth, overflow, island hydration, console errors, hydration warnings. A matrix cell left out
is recorded as **pending** with the reason in STATUS/REPORT — never "pass" for what was not captured. Compare by eye with
`evidence/source/` (source render at the same size): a large drift must have a tolerance/exception recorded **before** concluding.

## Gates and evidence

| Gate | Command / evidence | Pass |
|---|---|---|
| Contract | `tools/qa-contract.mjs qa.contract.json --source <source>` | 0 errors, `pending` empty, source hashes match |
| Routing / SEO | `qa.mjs --browser` calls `tools/audit.mjs --config template.config.json` → `audit/audit.json`: crawls the whole queue from the root of every locale; indexable → canonical per policy (D27), full hreflang + x-default, alternates 200 with the right lang; noindex → `noindex`; `/404` → 404; assets **favicon included** 200 | gate `routing` passes; the audit must fail on `tests/audit.test.mjs` before it is trusted |
| Browser matrix | the `browser` gate of `qa.mjs`: status, `identity`, lang, observed theme, overflow, islands, **image decode + MIME + same origin**, content matches the source, measured styles, fonts in `allowed`, panel/Escape/focus | all cases, a shot per case, 0 findings |
| Visual review | **a clean Fast Gate first** (`fast-gate.mjs verdict` passes on the current contract + build), then the `visual` gate of `qa.mjs --visual --source-site … --visual-fast-gate <run>` (runs `tools/visual-qa.mjs --scope full`) per [qa-lenses.md](qa-lenses.md): four tiers light-desktop → light-responsive → dark-desktop → dark-responsive, a tier only when the previous one is clean; each axis shot (per `visual.shots`) + interaction (hover does not jump, mega travel with a real mouse, Escape/focus) + computed px (rules, `design.coverage`, two-sided `design.parity` with `--source-site`, or declared numbers with frames) + scanners (white/darktext/contrast/border/seam/off-system); measuring method: [visual-review-method.md](visual-review-method.md) | `scope: full`, every tier `pass`, 0 findings, `unclassified 0`; the `visual-review` receipt passes on five things the machine checks (`--visual-runs`), **nobody signs** |
| Layout | gate `browser` + `shots.json` | no overflow outside a deliberate `overflow-x-auto` region |
| Frontend stack | `astro build` green; all islands hydrate (gate `browser`), 0 hydration warnings; admin HTML has no `global.css` | receipt `build` |
| Interaction | the contract's `interactions` (mega, drawer) run in the `browser` gate; `tools/interact.mjs` for the template's own parts (language menu, theme toggle, TOC, chip) | N/N, keyboard + pointer + dismiss |
| Content (`editability`) | `tools/admin-session.mjs` (sign in to the build by email link via Mailpit) then `tools/admin-roundtrip.mjs`: edit → Save → Publish changes now → the public page changes → revert; drafts do not leak to public | receipt `editability` + the tool's report |
| Forms | the template's own script (Business: `tools/forms-check.mjs`): an invalid submit is blocked natively (0 POST), a valid submit is 1 POST even on double click, the form's confirmation shows, the submission is in admin → Submissions, the mail is in Mailpit (`configure-smtp.mjs` first) | receipt `forms` |
| Security boundary | no public mutation route besides `/plugins/emdash-forms/submit`; receipts/manifest hold no token | |
| Persistence + Restore (`recovery`) | `tools/recovery-check.mjs` run from the site folder: a published edit survives a restart; `backup.sh` → overwrite → stop → `restore.sh` → the editor's text is back | receipt `recovery` |
| Runtime | `pnpm exec astro check`, `pnpm build`, server log without unexplained errors | |
| Clean install (from seed) | `tools/clean-install.sh <dir> <port>` from source + lockfile + seed; the preflight refuses dangerous targets (`tests/clean-install.test.mjs`) | bootstrap exit 0, status `untracked 0`; root page + one static page + one detail page in every locale 200, images, form |
| Restore (from an editor backup) | `tools/backup.sh` on a site with editor edits → `tools/restore.sh` into a clean, stopped site | the editor's text is back; `tests/restore.test.mjs` for a broken archive |

A mail sandbox pass ≠ production deliverability. A consent checkbox ≠ legal certification. Record them as two separate items.

## REPORT.md

`qa.mjs` produces `REPORT.md` + `report.json` every run: gate → pass / fail / pending / blocked /
not-applicable. Review gates (`build` … `independent`) pass only through a **receipt** in `--reviews`,
which hashes the evidence and pins `contractHash` · `artifactHash` · `origin` — evidence of an old run or of another
package expires on its own. A source gap is a limitation only when the recipient accepts it and it is written in the receipt; functional/data/access-control
defects block M1.

## Package (P8)

Per [package-docs.md](package-docs.md), the package must have `AGENTS.md`, eight finished guide documents
and `docs/generated/inventory.{json,md}`. Run the generator after source changes;
the docs gate is `node tools/generate-docs.mjs --check` (read-only). This gate does not replace
a review of the guide content or an audit of the real routes. Generate `artifact.json` after the doc set.

The package is **closed by the machine**: `tools/distribution.mjs pack qa.contract.json <new-folder>` copies exactly
`distribution.include` (refuses `data/`, `uploads/`, `.env`, `*.token`, `node_modules`, backups;
demands all of `distribution.required`) and writes `distribution.json` hashing each file. Two files are required because of the **fleet**,
not because of QA: `Dockerfile` at the root and `tools/docker-entrypoint.sh` — tracy-host unzips into `app.new/`
and runs `docker build` right there; without them the release closes green, pushes green, then dies on the customer's host (tracy-saas,
16/09/2026). `release.mjs` refuses a package missing them before upload. The clean install runs **from that package
folder** (`cd <package> && tools/clean-install.sh <target> <port>`), not from the checkout; the
`clean-install` receipt quotes the `artifactHash` of `distribution.json`. `qa.mjs --artifact <package>` verifies again
before the roll-up.

The package is self-contained: source, `pnpm-lock.yaml`, `seed/{seed.json,media-map.json,field-map.json,media/}`,
`tools/`, `src/components/ui/PROVENANCE.md`, `PROVENANCE.md` (design source, OFL fonts, images),
`README.md` (runbook: install, run, bootstrap, backup/restore, env), `.env.example`, `artifact.json`:

```json
{ "templateId": "tracy-business", "label": "Tracy Business", "version": "0.1.0",
  "package": { "name": "@tracy/emdash-theme-business", "version": "0.1.0" }, "demoContent": "Northgate Industrial",
  "cms": { "name": "emdash", "version": "1.1.0" }, "runtime": { "node": ">=22.16", "astro": "7.0.0" },
  "locales": { "default": "en", "all": ["en","ru"] }, "capabilities": ["forms","smtp","audit-log","search","i18n","seo","media"],
  "env": ["EMDASH_ENCRYPTION_KEY","EMDASH_SITE_URL","SITE_DATA_DIR","HOST","PORT"],
  "entrypoints": { "install": "pnpm install --frozen-lockfile", "build": "pnpm build", "start": "node dist/server/entry.mjs", "bootstrap": "tools/bootstrap-site.sh <origin> <data-dir>", "seed": "node tools/seed-apply.mjs <…>" },
  "seed": { "config": "template.config.json", "file": "seed/seed.json" }, "checksums": { "template.config.json": "sha256:…", "seed/seed.json": "sha256:…" } }
```

`templateId`/`label` come from `template.config.json` (the product), `package.name` is the repo convention, `demoContent`
is the customer name in the demo content — three different things, don't derive one from another (D31).

This is a local contract; the M2 adapter reads it per `packages/site/tracy-site-build-core`, without changing the job
schema. Do not ship the skill into the image/dsh in M1.

## Independent handover (G8)

A new agent receives only **this skill + the closed package (`distribution.mjs pack`) + the docs in the package** — no
`tasks/`, no git, no evidence of any run (same scope as `package-docs.md`: a maintainer may
receive only the installed application). The design source folder is added only when they need to compare visual parity. They
verify the package, build their own site (another port), sign in to the admin on the build, edit a field through the UI, run the
audit, then write a report: what they ran, what came out, and **where the docs fell short** — the third part is the main value of the
gate. The run owner signs the `independent` receipt from that report (evidence = the report itself). Without an independent
agent the gate is recorded as **pending**, never faked. The 13/09 run on Tracy Business:
`tasks/emdash-skill-completion/independent-2026-09-13.md` — 9 gaps, fixed in the package.
