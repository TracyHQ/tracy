# Content API and provenance stamps — every template has them (27/09/2026)

> Opened at P2 (the content-api map and site model) and P8 (`content-api-gate.mjs`, `release.mjs`). Moved here from
> `SKILL.md`, which keeps one line and the gate names. The reader's own spec is `scripts/tools/content-api/README.md`.

Tracy reads an EmDash site through the **Content API** (`tools/content-api/`: the `/content.json` route injected by `contentApi`
at build time) and knows which element on a page prints which field thanks to the **provenance stamps** that the
template itself prints — EmDash has no Claude Cowork plugin like WordPress/Joomla. The two go together: a stamp names an
id (`emdash:<collection>:<id>:<slug> field:<key>`), and only the reader can resolve that id. Until 27/09 only Tracy
Business had both; Brian decided to put them in the kit so every generated template has them.

| Thing | Kit-owned? | Where |
|---|---|---|
| `src/lib/stamps.ts` (`stampFor`, `stampsFor`, `islandMarks`, `stampBlocks`, `BLOCK_SRC`, `keepPickPrivate`), `src/components/site/{PageOwner,ProseBlock,ProseListItem,ProseQuote}.astro` | **yes** — `scripts/src/`, compared byte for byte (`check-kit-sync.mjs`) | copied by `new-template.sh` |
| `src/middleware.ts` calls `keepPickPrivate` | skeleton (`assets/src-starter/`), the template edits it further | only placed when absent |
| `seed/content-api-map.json` | skeleton (`assets/seed-starter/`), the template fills it | one row per collection of the site model |
| `seed/site-model.json` | template (contract, [`site-model.md`](site-model.md)); a template built before the contract: `from-emdash-seed.mjs` + a test keeps it in step with the seed | |
| `astro.config.mjs` attaches `contentApi` behind `process.env.TRACY_CONTENT_API_SCALARS === '1'` | template | |
| Dockerfile: `ARG TRACY_CONTENT_API_SCALARS=1` + `ENV` in **both** stages + label `io.tracy.content-api.scalars` | `Dockerfile.template` | the fleet build passes no build arg, so the default **is** what the customer gets; `ENV` so a rebuild inside the container still sees the flag |
| Each view: `stampFor(Astro.request, '<collection>', entry)` → `{...$page('title')}`, `<PageOwner stamp={$page} />` at the top of `<main>`, islands receive `...islandMarks({...})`, Portable Text through `stampBlocks` + the three `Prose*` renderers | template (views are the design's own) | |

**Stamp rules** (the top of `stamps.ts` is the contract; changing it changes the picker, the resolver and both plugins): only requests
with `X-Tracy-Preview: pick` (set by Tracy's site proxy after checking the ticket) get stamps and receive
`private, no-store` + `Vary`; ordinary requests get HTML **identical byte for byte** — measured with two builds.
Only stamp an element whose **visible** text comes from exactly that field (do not stamp a hidden language name on the
language switcher); menus have no Content API record, so they are not stamped. In a component with `<style>`, only
spread stamps onto elements **that have a `class`** (Astro merges scoped classes into a frozen object and throws on
ordinary requests). `content-api-gate.mjs` is the machine gate; `release.mjs` rejects a package without it.
