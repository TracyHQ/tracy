# Runtime — EmDash 1.1 on Astro 7, what must be measured again and what has been measured

## Pins (measured 04/10/2026, `vendor/emdash/emdash` = emdash@1.1.0; earlier: 1.0.1 measured 29/09, 0.37.0 measured 13/09)

`emdash 1.1.0` · `@emdash-cms/auth 1.1.0` (the content API needs it as a direct dep) · `astro 7.0.0` · `@astrojs/node 11.0.0` · `@astrojs/react 6.0.0` · `react 19.2.4` ·
`better-sqlite3 12.11.1` · `tailwindcss` + `@tailwindcss/vite 4.3.3` · `@emdash-cms/plugin-forms 0.2.9` ·
`@emdash-cms/plugin-audit-log 0.2.3` · `emdash-smtp 0.3.3` · `radix-ui 1.6.7` · `lucide-react 1.45.0` ·
`typescript 5.9.3` (`@astrojs/check 0.9.7` peer `^5`) · dev: `shadcn 4.21.0`, `acorn`, `playwright 1.63.0`, `vitest`.

Take the pins from upstream's `pnpm-lock.yaml` (`vendor/emdash/emdash`) to get versions tested together;
`npm view emdash versions` has a `1.0.0` **published before** 0.35 — it is not the next version. Don't use
`@emdash-cms/plugin-field-kit` (peer `@cloudflare/kumo ^1` mismatches 2.6.0): core has `repeater`.

## Upgrade 1.0.1 → 1.1.0 (measured 04/10/2026 on Business/Base/SaaS)

Change the `emdash` + `@emdash-cms/auth` pins (and the `admin`/`blocks`/`gutenberg-to-portable-text` `overrides`) to 1.1.0; the plugins
(`plugin-forms 0.2.9`, `plugin-audit-log 0.2.3`, `emdash-smtp 0.3.3`) stay. No template code change needed: `astro check` 0 errors,
build and the test suite all pass. Observed changes: two new migrations `090_redirect_enable_loop_guard`, `091_redirect_artifacts`
(`.emdash/migrations.json` changes fingerprint on build) and the lockfile gains the `@codemirror/*`/`@lezer/*` group (the HTML block editor).
Seed/restore not yet measured on 1.1.0 here (`tasks/todo-emdash-1-1.md` steps 7-8).

## Upgrade 0.38 → 1.0.1 (measured 29/09/2026 on Business/Base/SaaS)

- **Internal subpaths moved into `emdash/internal/…`** and are not public API. Don't import them: the content
  API reads through `locals.emdash.handleContentList/Get` (types in `emdash/locals`) and `hasPermission` from
  `@emdash-cms/auth`.
- **A reference field's target is a relation** (0.41, migration 087): declare `validation.targetCollection` (no
  more `options.collection`); the value lives in `entry.references`, not in `data`. Runtime:
  `getEmDashEntry(…, { references: { slug: true } })` → `entry.references[slug].entries[]` are full entries,
  in the right locale, `id` is the route id (`ru/<slug>`), the DB id is in `data.id`. REST: read `item.references[slug].children[]`,
  write `references: { slug: [id] }` — a bound key in `data` is refused (`VALIDATION_ERROR`). Old DBs with
  `options.collection` get the relation attached automatically by 087.
- **`POST /_emdash/api/setup` seeds within a per-request budget** (500 queries) and returns `seedComplete:false`; each pass
  rescans what was already created, so a large seed never finishes (2720 items: stops at ~717 after 33 passes). `bootstrap-site.sh`
  seeds with the `emdash seed` CLI (same `applySeed` engine, no budget); `mint-admin.cjs` closes the wizard.
- **Production setup requires `EMDASH_SITE_URL`** (`SITE_URL_REQUIRED`); `clean-install.sh` defaults it to
  `http://127.0.0.1:<port>`.
- **One-way migrations**: 079 (datetime UTC), 085, 086/087 — going back to 0.38 = restoring the whole DB.
- Release snapshot: SCRUB also covers `_emdash_transfer_*` (084) and `_emdash_redirect_write_lock` (081).

## Package shape

An independent pnpm project: `package.json` with exact pins, a `pnpm-workspace.yaml` marker (`packages: []` +
`allowBuilds` for better-sqlite3/esbuild/sharp/@parcel/watcher), its own `pnpm-lock.yaml`. Add
`- '!packages/cms/<name>'` to TCH's root `pnpm-workspace.yaml` with a comment. `.gitignore`: `node_modules
dist .astro data uploads .env* *.token backups evidence`.

`astro.config.mjs`: `output: "server"`, `node({ mode: "standalone" })`, `i18n: { defaultLocale, locales }`
(no `fallback`, no `routing`), `emdash({ database: sqlite({ url: "file:./data/data.db" }), storage:
local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }), toolbar: "client", plugins: [auditLog,
formsPlugin({ defaultSpamProtection: "honeypot" }), emdashSmtp()] })`, `fonts: [...]` from `src/fonts.json`
(Google provider → Astro self-hosts), `vite.plugins: [tailwindcss()]`, `devToolbar: false`.
`lowlight` + `highlight.js` added as deps so the admin's optimizeDeps can resolve under pnpm.

## Dev server and setup

- `pnpm exec astro dev --port <p> --host 127.0.0.1` is a **daemon**: `astro dev status|logs|stop`. Logs via
  `logs` are sometimes late; take evidence from HTML/HTTP, not from the log.
- On first boot EmDash applies the seed's **schema** itself (`Auto-seeded default collections`), but not the content.
  `POST /_emdash/api/setup {title, tagline, includeContent:true}` applies the content; `tools/mint-admin.cjs` creates
  the admin + token and closes the wizard (writes SQLite directly, same pattern as the fleet provisioner).
- The dev bypass `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` exists only in `astro dev` — used for
  the admin round-trip with Playwright. The "Publish changes" button opens a menu; you must click "Publish changes now".
- Measured twice: PUT returns `<title>Error</title>` 500 with no message for EVERY entry after a burst of HMR → restart
  the daemon. Don't blame the payload.

## Admin API (PAT `ec_pat_…`, header `Authorization: Bearer` + `X-EmDash-Request: 1`)

| Job | Route | Notes |
|---|---|---|
| Read entry | `GET /_emdash/api/content/<coll>/<slug\|id>?locale=xx` | returns `{item, _rev}`; `item.data` overlays the draft; `liveData` is the public version |
| Create | `POST /_emdash/api/content/<coll>` `{data, slug, locale, translationOf, taxonomies, status:"draft"}` | `status` accepts only `draft` |
| Edit | `PUT …/<id>?locale=xx` `{data, taxonomies, _rev}` | writes to the draft; fields missing from `data` are not deleted (merge) |
| Publish | `POST …/<id>/publish?locale=xx` `{}` | required after a PUT if the entry is already published |
| Translations | `GET …/<id>/translations` | `translation_group` |
| Media | `POST /media/upload-url` → `PUT <uploadUrl>` (header `content-type` **exactly once**) → `POST /media/<id>/confirm {size,width,height}` → `PUT /media/<id> {alt}`; find again: `GET /media?q=<name>` | the server drops `src`, adds `meta.storageKey`; file URL = `/_emdash/api/media/file/<storageKey>` |
| Schema | `GET/POST /schema/collections/<c>/fields`, `PUT …/fields/<f>`, `PUT /schema/collections/<c>` | used by `seed-apply schema` |
| Plugin route | `POST /_emdash/api/plugins/<pluginId>/<route>` | JSON only; the PAT needs the `admin` scope |
| Exclusive hook | `PUT /_emdash/api/admin/hooks/exclusive/email:deliver {pluginId}` | picks the mail provider |
| MCP | `POST /_emdash/api/mcp` JSON-RPC, returns SSE | 59 tools on 0.37 |

`emdash seed <file> --no-content --on-conflict update` **still updates content** (measured) — don't use it on
a site with an editor; `--on-conflict skip` only for creating new collections/taxonomies/menus.
