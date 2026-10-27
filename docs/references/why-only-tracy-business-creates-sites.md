---
description: Why the site-creation flow only goes all the way with Tracy Business — the site-creation door lets only 2 template cards through out of 88 releases, 77/79 JA quickstarts are rejected by mayName(), and the remaining card (ja-kinetic) is sealed with a profile captured from a different install shape.
sources:
  - apps/tracy-web/src/quickstarts.json
  - apps/tracy-web/src/lib/contracts.js
  - apps/tracy-web/src/lib/quickstart-releases.js
  - apps/tracy-web/src/lib/tracy-setting.mjs
  - apps/tracy-web/src/lib/build-base.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/design-templates.json
  - apps/tracy-web/Dockerfile
  - packages/design/tracy-design-inspiration/src/host/gallery.mjs
  - packages/design/tracy-design-inspiration/src/host/templates.mjs
  - packages/design/tracy-design-inspiration/src/client/templates.mjs
  - packages/site/tracy-add-site/src/client/start-template.mjs
  - packages/site/tracy-site-build-core/src/host/stages-shared.mjs
  - packages/site/tracy-site-build-joomla/src/host/stages.mjs
  - packages/cms/tracy-joomla-quickstart/contracts
  - packages/cms/tracy-wordpress-quickstart/contracts
  - packages/cms/tracy-seeder/src/plan-joomla-contract.mjs
  - packages/cms/tracy-seeder/src/apply-wordpress-contract.mjs
  - packages/cms/tracy-emdash-theme-business/template.config.json
  - packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/platform/joomla.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/platform/emdash.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/quickstart.py
  - scripts/check-templates.ts
  - docs/adr/0017-github-release-is-quickstart-source-of-truth.md
  - docs/adr/0020-emdash-content-only-fence.md
  - tasks/todo-design-inspiration-card-ops.md
---

> **Measured over the network, not files in the repo** (so they are not in `sources` — the
> `doc-frontmatter` gate only accepts paths in the tree):
> - `https://api.github.com/repos/JoomlArt-Products/ja-products/releases`
> - `https://cowork.tracy.site/api/templates`
> - `https://cowork.tracy.site/api/design-systems`

# Why only Tracy Business can create a site

Measured 25/09/2026 on branch `develop` (`756e3fbb4`), on the 88 real releases of
`JoomlArt-Products/ja-products`, and on the dev deployment `cowork.tracy.site` itself.

## 1. The short answer

**No template "dies in the middle of a provision run". The site-creation door lets exactly two templates through, and
one of the two is currently unusable.** Measured directly `GET https://cowork.tracy.site/api/templates`
(`readAt: 2026-09-25T05:10:04.485Z`): the list returns **2 cards** — `tracy-business` (three CMSes:
joomla · wordpress · emdash) and `ja-kinetic` (joomla only). At the same time
`GET /api/design-systems` returns `{"shown":false}`, so the 154 design systems are **not offered** on
Design inspiration on dev.

What blocks every other template is **data, not code**: a release only becomes a card when it carries
the file `tracy_design_inspiration.json` (or the old `card` block), and can only be named at `POST /api/sites`
when `mayName()` agrees. Of the 88 releases, **only 4 releases carry a card**; of the 79
`quickstart/ja-*` releases, all 79 have a valid `tracy_setting.json` and `choosable: true` (so `/ops/cms`
lists them as usable) but **77 are rejected by `POST /api/sites`** with `UNSUPPORTED_QUICKSTART`
because they have neither a contract profile nor a card.

The second template — `ja-kinetic` — does pass every door but **its two halves don't match**: the release declares
the `installer` install shape (Joomla installs itself from a zip), while the contract profile that seals it
(`ja-kinetic/j6/1.0.0`) was captured from the `webroot + database` shape (a site **restored**). The
repo itself records why those two cannot be combined: `presentation-lock.json` locks every field of every
entity including `created_time`, which the CLI installer generates at install time on the customer machine. And its demo on
dev is currently **502**.

Conclusion on the two hypotheses: **H2 is right about the mechanism, H1 is right about the content.** The code does not hard-code
"tracy-business" at the site-creation door — but **two places do hard-code it** (`START_TEMPLATE`,
EmDash's `platform_post_up`), and every remaining gate demands files that **only Tracy Business has
in full on all three CMSes**.

## 2. Evidence

### 2.1 Catalogue in the repo: 10 entries, not 6

`apps/tracy-web/src/quickstarts.json` today has **10 keys** (byte-identical with
`packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json` — `diff`ed):

| Line | Key | Top-level fields |
|---|---|---|
| 2 | `tracy-apple/j6` | `platform · version · webroot · database · cowork` |
| 31 | `tracy-business/j6` | + **`contract`** (70) · **`demoTrim`** (69) · **`template`** (65) · `note` (64) |
| 72 | `tracy-base/j6` | `format · jpa · artifact · cowork` |
| 97 | `tracy-business/emdash` | `format · release · source · state · **template** · **questions**` |
| 573 | `tracy-base/emdash` | as above, **no** `template` in the card sense |
| 877 | `tracy-saas/emdash` | `format · release · source · state · template` |
| 904 | `tracy-base/wp7` | `webroot · database` (no `cowork`, see `note` line 921) |
| 923 | `tracy-business/wp7` | + **`contract`** (965) · **`demoTrim`** (966) |
| 969 | `quickstart/ja-voyara/j6` | + `contract` (998) |
| 1000 | `quickstart/ja-kinetic/j6` | + `contract` (1030) |

⚠ **But this file is NO longer the catalogue.** ADR 0017 (`docs/adr/0017-*.md`, §Decision 1) settled
deleting it; in practice it survives for exactly one job: **the pin source for the Claude Cowork plugin**
(`apps/tracy-web/src/lib/contracts.js:34` `PINS_FILE`, `:146` `coworkPinFor`), and it is copied into the
image at `apps/tracy-web/Dockerfile:24`. The hand-copied `contract` field in it **is no longer read** —
`contracts.js` indexes from each profile's `manifest.json` (`contracts.js:76-119`).

### 2.2 Gallery: the charge "157 cards declared buildable" HAS BEEN FIXED

`packages/design/tracy-design-inspiration/src/host/gallery.mjs:308` is now `platforms: []` for
**every** design system row, with a long comment at `:284-307` recording exactly the old bug: *"It stamped
`['joomla','wordpress']` onto every row including `brand:` ones"*. Fixed in commit `321d95c39`
(24/09/2026, *"one flow — the gallery is a step inside Add site"*).

Real template cards come from elsewhere: tracy-web's `GET /api/templates`
(`packages/design/tracy-design-inspiration/src/host/templates.mjs:9-23` and
`src/client/templates.mjs#templateRows`), built by
`apps/tracy-web/src/lib/quickstart-releases.js:516-543` (`templateCards`).

### 2.3 Three gates in a row, and where each template falls

**Gate 1 — `choosable`** (`quickstart-releases.js:82`, repeated at `:329`):
`kind === 'quickstart' && github !== 'draft' && Boolean(setting)`.

**Gate 2 — has a card or not** (`quickstart-releases.js:437-439` `cardOf`, `:449-451`
`shownCardOf`, `:482-484` `isTemplateId`, `:461-467` `templateRelease`). Card = the file
`tracy_design_inspiration.json` on the release, **or** the `card` block in `tracy_setting.json` of a
release cut before 16/09.

**Gate 3 — `mayName`** (`apps/tracy-web/src/lib/contracts.js:196-200`):

```js
export function mayName(release, contract) {
  if (!release?.choosable) return false
  if (contract !== null) return true
  return Boolean(release.setting?.card)
}
```

called at `apps/tracy-web/src/sites/route.js:730-738`; failing it is `UNSUPPORTED_QUICKSTART` 400.

**The real measurement.** I ran exactly those functions (`validateSetting`, `readContracts`, `contractFor`,
`mayName`, `coworkPinFor` — imported directly from the source tree) on the 88 releases downloaded from
`gh api repos/JoomlArt-Products/ja-products/releases`, with the real asset list and GitHub `digest`:

| Tag | GitHub | platform / version | choosable | card | contract | `mayName` |
|---|---|---|---|---|---|---|
| `tracy-business/j6` | published | joomla 1.2.0 | ✅ | ✅ (`card` block, 14 layouts) | `tracy-business/j6/1.2.0` | ✅ |
| `tracy-business/wp7` | published | wordpress 1.1.0 | ✅ | ✅ (file, 6 layouts) | `tracy-business/wp7/1.1.0` | ✅ |
| `tracy-business/emdash-0.x` | published | emdash 1.4.3 | ✅ | ✅ (file, 1 layout) | — | ❌ |
| `tracy-apple/j6` | published | joomla 1.3.0 | ✅ | ❌ | `tracy-apple/j6/1.3.0` | ✅ |
| `tracy-base/j6` | published | joomla 1.0.0 | ✅ | ❌ | `tracy-base/j6/1.0.0` | ✅ |
| `tracy-base/wp7` | **draft** | wordpress 1.0.0 | ❌ | ❌ | `tracy-base/wp7/1.0.0` | ❌ |
| `tracy-base/emdash-0.x` | published | emdash 0.2.0 | ✅ | ❌ | — | ❌ |
| `tracy-saas/emdash-0.x` | published | emdash 1.0.0 | ✅ | `card` block **missing `template`**, and has `tracy_design_inspiration_hidden.json` | — | ✅ |
| `tracy-airbnb/j6` | published | — | ❌ | ❌ | — | ❌ (no `tracy_setting.json`; by design — a design pack) |
| `quickstart/ja-kinetic/j6` | prerelease | joomla 1.0.0 | ✅ | ✅ (file, 6 layouts) | `ja-kinetic/j6/1.0.0` | ✅ |
| `quickstart/ja-voyara/j6` | prerelease | joomla 1.0.2 | ✅ | ❌ | `ja-voyara/j6/1.0.2` | ✅ |
| **77 remaining `quickstart/ja-*`** | prerelease | joomla | ✅ (all 79) | ❌ | ❌ | **❌** |

Important notes on the table above:

- **`tracy-business/emdash-0.x` `mayName` = false** because its card is in a **file**, while `mayName`
  only reads `release.setting?.card`. It survives **only through the card path**: `route.js:731` skips the gate
  when `body.quickstart === namedTemplate`. Naming the quickstart directly (without `design`) gets it
  rejected.
- **`tracy-saas/emdash-0.x` is the reverse**: `mayName` = true (has a `card` block) but `cardOf()?.template`
  is `undefined` → `isTemplateId` false → **not a template**, and `tracy_design_inspiration_hidden.json`
  pushes it out of the list. It can only be reached through *Default EmDash build base* on `/ops`.
- **The 77 JA releases** pass gate 1 (so `/ops/cms/quickstarts` lists them as usable) and fail gates 2 + 3.
  This is the whole reason "other templates cannot create a site": **they were never offered**.

### 2.4 The live surface on dev (measured directly, 25/09)

```
GET https://cowork.tracy.site/api/templates       → 200, readAt 2026-09-25T05:10:04.485Z, 2 templates
GET https://cowork.tracy.site/api/design-systems  → {"shown":false}
```

- `tracy-business`: 3 platforms, demos `business-wordpress.tracy.site` (**200**),
  `business-emdash.tracy.site` (**200**), `business-joomla.tracy.site` (**301 → /en/ 200**).
- `ja-kinetic`: 1 platform, demo `https://ja-kinetic-joomla.tracy.site/` → **502**
  (`/index.php` is also 502).
- The card images of both are 200 (`/api/templates/<id>/shots/...`).

So on the gallery today the customer sees **two cards**, one of which **cannot be previewed**.

### 2.5 `ja-kinetic`: two halves not of the same install shape

- The release declares: `install: { installer: { file: ja-kinetic-j6-quickstart-1.0.0.zip } }` —
  the third shape that `installShapesFor('joomla')` allows
  (`apps/tracy-web/src/lib/tracy-setting.mjs:43-48`), the site is **built** on the host with
  `php installation/joomla.php install` (`platform/joomla.sh:332-460`).
- The contract profile `packages/cms/tracy-joomla-quickstart/contracts/ja-kinetic/j6/1.0.0/manifest.json`
  declares `quickstart.parts = { webroot, database }` with URLs pointing to a **LAN address of the capturing machine** (`http://<lan-ip>:5178/`), i.e. the profile was captured from a **restored** site.
- The repo itself records why combining those two is wrong — `tasks/todo-design-inspiration-card-ops.md:270-274`:
  *"`presentation-lock.json` locks every field of every entity, including `created_time`. Those values
  are only right when the site is restored; the CLI installer generates them at install time on the customer machine, so a site
  built with `installer` cannot be sealed."* I confirmed that ja-kinetic's `presentation-lock.json`
  has `created_time`/`created_user_id` for every entity.
- The release **carries no Claude Cowork plugin**, and `coworkPinFor('quickstart/ja-kinetic/j6','1.0.0')` returns
  **null** — the pin in `quickstarts.json:1017-1029` lacks `githubAssetId`, while `contracts.js:157-165`
  demands `Number.isInteger(pin.githubAssetId)`. So the Claude Cowork plugin has to come from
  `joomla_install_cowork_release` (`platform/joomla.sh:311-327`) with floor `coworkMinVersion = 0.16.1`.
  `platform/joomla.sh:536-538` stops provisioning if the floor is not passed — `route.js:1399` does pass it.

### 2.6 Failed runs that were measured and recorded in the code (not speculation)

`packages/fleet/tracy-fleet-operation/scripts/provision/platform/joomla.sh` records four runs:

| Site | Source | Where it failed |
|---|---|---|
| `site-hptb1b` | `quickstart/ja-voyara/j6` unsealed | `:488-494` — `EngineFactory::buildContract` falls back to `DEFAULT_CONTRACT = tracy-apple/j6/1.1.0`, `inspect` rejects with `Presentation asset changed: templates/tracy/acm/accordion/config.xml` |
| `site-8eo60a` | `quickstart/ja-voyara/j6` | `:514-516` — the Cowork door returns 404 (the release carries no Claude Cowork plugin) |
| `site-oo0sea` | card `ja-resort` | `:514-516` — stage `check` dies in 290 ms, `COMPONENT_NOT_REGISTERED` |
| `site-lp4yub` | sealed card, no Claude Cowork plugin floor | `:526-538` — the site stands up healthy then the job dies at `Quickstart contract binding failed` (installed 0.12.0, `content.contract` only exists from 0.14.0) |

And `joomla.sh:303`: *"almost every one: measured 19/09, **86 of 88 releases** answered
`cowork: false`"* — matching my measurement today (only `tracy-apple/j6`, `tracy-business/j6`,
`quickstart/ja-voyara/j6` declare `install.cowork`).

⚠ The `ja-resort` card that `joomla.sh:516` mentions **no longer exists** on today's release list —
of the 79 JA releases only `ja-kinetic` still carries `tracy_design_inspiration.json`. So that failed run was
handled by **withdrawing the card**, not by making it buildable.

### 2.7 Two places where the code hard-codes "tracy-business"

1. `packages/site/tracy-add-site/src/client/start-template.mjs:18`
   `export const START_TEMPLATE = 'tracy-business'` — the default template of the Add site wizard. And
   `startTemplateFrom()` (`:26-33`) does **not** silently switch to the default when the card the customer chose is not
   in the catalogue: it returns `null`, the wizard sends **no** `design`, the server falls back to the platform's default
   base. So a card disappearing from `/api/templates` turns into "the built site is not what the
   customer clicked", silently.
2. `packages/fleet/tracy-fleet-operation/scripts/provision/platform/emdash.sh:308`
   `if [ "$template_id" = tracy-business ]; then` — the `platform_post_up` branch runs
   `tools/bootstrap-site.sh` (content, media, forms, its own PAT). The key is the image label
   `io.tracy.template.id`, so in theory another EmDash template carrying the right label would go down the same branch;
   but the string is a literal, and every other EmDash template takes the "legacy setup path"
   (`emdash.sh:383-440`) — only `POST /_emdash/api/setup` then mint a token.

### 2.8 Default base per platform — WordPress has only one choice left

`apps/tracy-web/src/lib/build-base.js:94-123`: Joomla takes it from `design-templates.json#bases`
(**exactly one** base: `tracy-base/j6`, `defaultBase: tracy-base/j6`); WordPress and EmDash take **every
choosable release of that platform**. Because `tracy-base/wp7` is still a **draft** on GitHub, the
WordPress list today = `['tracy-business/wp7']` → **on WordPress, Tracy Business is the only thing that
can be installed**, even when the customer clicks no card.

## 3. What Tracy Business has that other templates don't

### 3.1 On the release (ja-products)

| What the release must carry | `tracy-business/j6` | `tracy-business/wp7` | `tracy-business/emdash` | `ja-kinetic` | `ja-voyara` | `tracy-apple/j6` | 77 remaining JA |
|---|---|---|---|---|---|---|---|
| Valid `tracy_setting.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (79/79) |
| `tracy_design_inspiration.json` or `card` block | ✅ block | ✅ file | ✅ file | ✅ file | ❌ | ❌ | ❌ |
| `install.cowork` pinned | ✅ 0.17.4 | ❌ | n/a | ❌ | ✅ 0.16.2 | ✅ 0.17.4 | ❌ |
| `tracy_site_question.json` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ (0/79) |
| Asset count | **35** | **21** | **20** | 5 | 8 | 20 | 1–3 |
| Several versions side by side (can roll back) | 3 webroots + 3 dumps + **15 Claude Cowork plugin zips** | 3 webroots + 3 dumps + 8 plugin zips | 6 source + 6 state | 1 | 2 | 3 webroots + 3 dumps | 1 |
| `SHA256SUMS` / `VERIFICATION.json` | ✅ | ✅ | ✅ | ❌ | ✅ / ❌ | ✅ | mostly ❌ |
| Install shape | `webroot+database` | `webroot+database` | `source+state` | **`installer`** | `webroot+database` | `webroot+database` | **`installer` (78/78)** |

### 3.2 In the repo (contract profile)

`find packages/cms/tracy-*-quickstart/contracts -name manifest.json` → **17 profiles**. Files in each profile:

| Profile | content-map | presentation-lock | demo-trim-map | multilingual-map | editions | inventory | questions |
|---|---|---|---|---|---|---|---|
| **`tracy-business/j6/1.2.0`** | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| `tracy-business/j6/1.1.0` | ✅ | ✅ | — | ✅ | ✅ | — | ✅ |
| **`tracy-business/wp7/1.2.0`** | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| `tracy-business/wp7/1.1.0` | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| `tracy-apple/j6/1.3.0` | ✅ | ✅ | — | ✅ | — | — | — |
| `tracy-airbnb/j6/1.2.0` | ✅ | ✅ | — | ✅ | — | — | — |
| `ja-kinetic/j6/1.0.0` | ✅ | ✅ | ✅ | — | — | — | — |
| `ja-voyara/j6/1.0.2` | ✅ | ✅ | — | — | — | — | — |
| `tracy-base/j6/1.0.0` | ✅ | ✅ | — | — | — | — | — |
| `tracy-base/wp7/1.0.0` | ✅ | ✅ | — | — | — | — | — |
| **EmDash (all three)** | **no contract tree at all** | | | | | | |

And content size (`content-map.json`):

| Profile | pages | entities | slots |
|---|---|---|---|
| `tracy-business/j6/1.2.0` | 78 | 368 | **1 797** |
| `ja-kinetic/j6/1.0.0` | 44 | 368 | **4 662** (250 blog posts take 3 634) |
| `ja-voyara/j6/1.0.2` | 72 | 397 | 1 833 |
| `tracy-apple/j6/1.3.0` | 46 | 198 | 1 126 |
| `tracy-business/wp7/1.2.0` | — (WP has no `pages`) | 11 | 292 |

`editions.json` and `demo-trim-map.json` are **optional** in the seeder
(`packages/cms/tracy-seeder/src/apply-wordpress-contract.mjs:36-37`), so missing them does not turn anything red — it only
leaves the customer site with the vendor's text/demo unchanged.

### 3.3 EmDash specifically

| | `tracy-business/emdash` | `tracy-base/emdash` | `tracy-saas/emdash` |
|---|---|---|---|
| Template package in the repo | `packages/cms/tracy-emdash-theme-business` | `packages/cms/tracy-emdash-theme-base` | **none** |
| `seed/site-model.json` copied into the tracy-web image | ✅ (`Dockerfile:48`) | ❌ (`Dockerfile:50` says plainly "ships no site model") | ❌ |
| Own branch in `platform_post_up` | ✅ (`emdash.sh:308-381`) | ❌ | ❌ |
| Card images in `provision/templates/<id>/` | ✅ 28 files | ❌ | ✅ 24 files |
| Locales | 40 | 1 (`en`) | 1 (`en`) |

## 4. H1 vs H2

**The evidence supports BOTH, but not in the way the question framed it — and H2 is what is blocking.**

### H2 — code in TracyHQ/tch only works for Tracy Business: **TRUE, high confidence**

The site-creation door has no `if template === 'tracy-business'`. But it has **three gates that demand data**, and
Tracy Business is the only template that has all that data on all three CMSes:

1. `mayName()` (`contracts.js:196`) — demands a contract profile **in this repo**, or a card. A profile is
   something Tracy captures itself, not something the publisher declares. The 77 JA releases have none → they die at the door.
2. `templateCards()` / `isTemplateId()` — demand a card file on the release. 84/88 releases have none.
3. `baseChoices()` — WordPress has only `tracy-business/wp7` left because `tracy-base/wp7` is a draft.

Plus two places that **truly hard-code it**: `START_TEMPLATE = 'tracy-business'`
(`start-template.mjs:18`) and `[ "$template_id" = tracy-business ]` (`emdash.sh:308`).

Confidence: **high** for the part "only 2 cards, 77 rejected by `mayName`" — I ran the repo's own functions on
real release data, and dev's `GET /api/templates` confirms the same numbers.

### H1 — the Tracy Business quickstart package is better: **TRUE, but a consequence, not the cause**

The Tracy Business package really is fuller (table §3.1): 35 vs 5 assets, three versions to roll back to, 15 Claude Cowork plugin zips,
`SHA256SUMS`, `VERIFICATION.json`, its own questionnaire (EmDash), 40 locales. But **no release
is rejected because the package lacks a file**: `validateSetting` scores **79/79** JA releases as valid, including checking
`sha256` against the real `digest` GitHub reports. So a "bad package" is not where the flow breaks.

Where H1 really matters is the **install shape**: 78/79 JA releases are in the `installer` shape, and that shape
**cannot be sealed** (§2.5). This is a fact about the package, but its consequence shows up in
Tracy's code.

### Not yet measured

- Have not run a real `POST /api/sites` with `design=ja-kinetic` on dev, so there is no job
  journal proving which stage it dies at **today**. The four failed runs in §2.6 are records from 17–19/09 in the code.
- Have not read dev's `quickstart_releases` table (needs DB access) — I read its output through
  `/api/templates` instead.

## 5. What must be added to make more templates complete

This list comes directly from the gates in §2.3 and the failed runs in §2.6. A new template must have
**all 9**, not "most of them".

**On the `ja-products` release:**

1. **`tracy_setting.json`** with the right `schemaVersion: tracy-setting/v1`, `platform`, `label`, `version`,
   `cms`, and `install` in **exactly one shape** (`webroot+database` · `bundle` · `installer` for Joomla;
   `source+state` for EmDash). Every `file` must be in the asset list and `sha256` must match the `digest`
   GitHub reports (`tracy-setting.mjs:135-150`). No `url` allowed.
2. **`tracy_design_inspiration.json`** valid per `validateDesignInspiration`
   (`tracy-setting.mjs:194-278`): `template` (slug), `provider` ∈ `Tracy|JoomlArt`, `category` **in
   tracy-web's category list** (guarded by `check-templates.ts` §2), `blurb`, `image`,
   `layouts[≥1]` each with `key/label/path/shots.desktop`. **No** `demo` allowed.
   ⚠ `validateDesignInspiration` only demands that `category` be a non-empty string; the closed list lives in
   `apps/tracy-web/src/lib/design-inspiration.js:28` (`DESIGN_CATEGORIES`, guarded at `:115-116` for the
   operations screen). A category outside the list still passes the validator but the card **does not appear under any
   filter** — exactly what `scripts/check-templates.ts` §2 warns about.
   ⚠ The `path` of every Joomla subpage should include `address: /index.php/<path>` — otherwise the preview
   frame captures Joomla's 404 page (`quickstart-releases.js:546-573`).
3. **The install shape must be a sealable shape.** If the template needs a contract (every Joomla/WordPress card
   should), the release must be in the `webroot+database` shape, **not** `installer` — because
   `presentation-lock.json` locks `created_time`/`created_user_id` that the CLI installer generates fresh
   (`tasks/todo-design-inspiration-card-ops.md:270-274`).
4. **`install.cowork`** pinned (Joomla/WordPress), or accept that provisioning installs the newest version
   above the floor itself. If provisioning installs it, the floor **must** exist (point 6).
5. *(optional)* **`tracy_site_question.json`** in the same `tracy-questions/v1` format; without it the site is
   asked the CMS's default set.

**In the `TracyHQ/tch` repo:**

6. **A contract profile** at `packages/cms/tracy-{joomla,wordpress}-quickstart/contracts/<id>/<cms>/<version>/`
   with **at minimum** `manifest.json` + `content-map.json` + `presentation-lock.json`. `manifest.json`
   must declare `quickstart.release` + `quickstart.version` **matching EXACTLY the release version being declared**
   (no match → `contractFor` returns null → `mayName` false; this is exactly how Voyara was once blocked),
   `id` matching the path, and `coworkContractVersion` (Joomla) or `coworkMinVersion` (WordPress) ≥ 0.14.0.
   Gate: `scripts/check-contracts.ts`.
7. **`content-map.json` must have `pages`** — without it `pageEntities()` returns `null` → *plan it all*
   (`packages/cms/tracy-seeder/src/plan-joomla-contract.mjs:37-58`), and for a demo with a blog that
   is a hundred model calls for text no one reads.
8. **Card images** in `packages/fleet/tracy-fleet-operation/scripts/provision/templates/<template.id>/`
   following the image store's naming rules, **then the operator imports them into each deployment** with
   `scripts/template-shots-import.mjs` → table `template_shots`. A rejected name does **not** turn the
   import run red (`scripts/check-templates.ts` §1), so it must be checked by hand.
9. **A live demo of the right version.** `templateCards` only attaches a demo when
   `lib/demo-sites.js` sees a running demo for that tag; `ja-kinetic-joomla.tracy.site` being 502
   is evidence that the card still draws while the preview is empty.

**If it is EmDash:** a template package in `packages/cms/`, and
`artifact.json` + `seed/personalize.json` (+ `seed/site-model.json`) copied into the tracy-web image
(`apps/tracy-web/Dockerfile:44-51`). There is no contract tree for EmDash yet; since 26/09 there is no fence — ADR 0022 supersedes ADR 0020.

**Three places in the code to fix if the flow should no longer lean towards Tracy Business:**

- `mayName` (`contracts.js:199`) reads `release.setting?.card`, not the card file → every template
  cut after 16/09 is `mayName: false` and survives only through the card path. Should switch to `cardOf(release)`.
- `coworkPinFor` (`contracts.js:157-165`) demands `githubAssetId` → the ja-kinetic/ja-voyara pins are
  dropped silently.
- `START_TEMPLATE` (`start-template.mjs:18`) is a literal; and `startTemplateFrom` returns `null` when the card
  the customer chose is no longer in the catalogue, leading to a built site that differs from what the customer clicked without anyone reporting it.

## 6. Not yet measurable

| Unknown | How to measure it |
|---|---|
| Which stage a `POST /api/sites` run with `design=ja-kinetic` dies at today (or whether it still finishes) | Click create site from the ja-kinetic card on `cowork.tracy.site`, then read the job log; or run `provision.sh --quickstart quickstart/ja-kinetic/j6` on the local stand |
| Whether dev's `quickstart_releases` table has exactly 88 rows and what each row's `tracy`/`reason` says | Open `/ops/cms/quickstarts` (needs an internal email — not yet verified that Akemi's email is on the list), or query the dev DB |
| Whether `/ops/cms/quickstarts` lists the 77 JA releases as "ready" as inferred from `choosable` | same as above |
| Why `ja-kinetic-joomla.tracy.site` is 502 (container dead, or never finished building) | `/ops` → Demos, or `docker ps` on dev's fleet host |
| When and why the `ja-resort` card was withdrawn | `gh api` asset history of release `quickstart/ja-resort/j6`; or ask Lee |
| How many fields the `presentation-lock` of a site built with `installer` deviates from the profile | Build a ja-kinetic site then run the Claude Cowork plugin's `inspect`, count `Presentation asset changed` |
| Whether production (`cowork.tracy.ai`) has the same list of 2 cards or a different one | `curl https://cowork.tracy.ai/api/templates` — not called, to avoid touching the customer environment |
| Whether the running dev version is exactly `756e3fbb4` (whether the `install.cowork` validator has landed) | `gh run list --branch develop`, compare the image tag with `/ops` |
