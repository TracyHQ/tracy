# @tracy/seeder — `tracy-seed`

The seeder: what `tracy-site-build`'s **seed** stage runs on a lane after the customer pressed
*Create with WordPress / Joomla* on a design inspiration and answered the Build tab. It turns the
approved preview into the site — the pages the customer saw, with their words, a blog and a sections
page written from what they said. The Joomla target recipe uses the T4 quickstart templates
`tracy` and `tracy_airbnb`; the older local-only adapter still targets `tpl_tracy`.
Not a dsh plugin: a command the image ships at `/opt/tracy/cms/seed-<platform>`.

```
seed-wordpress --preview docs/agents/design-preview.json --copy docs/agents/design-copy/<id>.json --pages all
seed-joomla    --preview … --copy … --pages posts                    # a rerun of just the blog
tracy-seed --platform wordpress … [--webroot .webroot] [--dry] [--no-model] [--fresh] [--data <dir>]
tracy-seed --platform wordpress … --target-site coba.tracy.ai --door http://127.0.0.1:51700
                                                              # seed ANOTHER site through its seat door
tracy-seed --platform joomla … --target-site coba.tracy.ai --door http://127.0.0.1:51700 --session <owner-session>
```

Exit 0 when the site is seeded; otherwise one line on stderr, which the Build card shows.

Build jobs pass `--session` on every seat-door call, so writes retain the build owner's identity.
Their preview, copy and model cache live under the individual job's artifact directory. A brief
revision supplies new copy and the seeder carries the previous plan forward — slots already answered
are kept, evidence the brief no longer supports is asked again, and words already on the site win;
`--fresh` is the explicit from-scratch rewrite and no build stage passes it on its own. A retry of the
seed stage reuses its saved inputs.

Each completed language writes its receipt to `build/languages/<locale>.json` beside the preview.
For a preview at `docs/agents/design-preview.json`, this is
`docs/agents/build/languages/<locale>.json` within that job's artifact directory. The Build stage
reads that receipt to retain the language apply ID on the job.

Each completed language writes its receipt to `build/languages/<locale>.json` beside the preview.
For a preview at `docs/agents/design-preview.json`, this is
`docs/agents/build/languages/<locale>.json` within that job's artifact directory. The Build stage
reads that receipt to retain the language apply ID on the job.

## Where it writes

Two writers, one plan (`src/site-ops.mjs`). Without `--target-site` it is `wp` on the working copy
beside it — the lane's own site, as it always was. With `--target-site` every write goes through
that site's **seat door** instead: `content.update` for pages, posts, meta and options, as the
person who pressed, with the seat book deciding what is allowed and recording the undo. That is how
*Create with* seeds a site the lane does not hold at all, and why a lane needs no credential for it.

Joomla uses the installed quickstart's `content.contract` door. The default build inspects and binds
its original presentation, maps customer inputs to existing scalar fields, and applies one checked
transaction. Modules, articles, menus, language assignments and template styles retain their identity
and configuration. Unprofiled designs/language structures are blocked by the capability catalog.
The legacy T4/PHP writers remain test fixtures but are not reachable from the Joomla CLI.

## What it reads

| Input | Where | What of it |
|---|---|---|
| the preview | `docs/agents/design-preview.json` | `chosen` (the design system), `site` (name, headline, sub, cta, nav — and from the Build tab: about, contact, tone, languages, notes), `pages` (home, pricing with plans and prices) |
| the copy | `docs/agents/design-copy/<id>.json` | the version the customer chose on each chip (`selected`); built-ins fall back to the preview's cut rule |
| the design system | `data/systems/<id>/` (the vendored library, shipped in `dist/data`) | `components.html` (the fixture), `tokens.css` + `DESIGN.md` (the engine builds the landing artifact from them, as the preview host does) |
| the section library | `data/sections/*.html` | the 16 fragments of `@tracy/cms-sections` (their shapes and order in `regions.json`, copied beside them) |
| a model key | `OPENROUTER_API_KEY` (draws) or `DEEPSEEK_API_KEY` (text), from the environment or the lane's `$DSH_HOME/.credentials.yaml` `refs:` | two turns: the blog, the words of the sections; none → no blog, sections keep the library's words |

## What the WordPress and legacy local Joomla adapters write

The plan is `src/host/seed-plan.mjs` of `@tracy/dsh-design-inspiration` — the preview's own fill
rules (`planFill`, `planBrandFill`), plus an `href` on every nav and button slot of the landing:

| Page | Body | WordPress | Joomla |
|---|---|---|---|
| Home | the engine's landing artifact, the site's name in place of the system's, nav → the menu, buttons → Pricing and Contact | page `home`, template `artifact`, meta `tracy_artifact=landing`, front page | article `home`, attribs `tpl_tracy:artifact`, the home menu item |
| Design | the system's fixture with the home page's words | template `fixture` | `tpl_tracy:fixture` |
| Pricing | the fixture with the plans and prices (when the site has a pricing page) | template `fixture` | `tpl_tracy:fixture` |
| Sections | the landing sections (`kind: landing` in `regions.json`) with the model's words | template `landing` | `tpl_tracy:landing` |
| Style guide, Contact | the library's two pages | template `page` | `tpl_tracy:page` |
| Blog | 5–7 posts from one model turn, a cover each from the image model, dated a day apart, in a Blog category | posts page + category | Blog category, blog menu item |
| Menu | Home · Design · Sections · Blog · Pricing · Style guide · Contact | one `wp_navigation` "Main", post-type links | `mainmenu` items, `mod_menu` in `nav` |

Every page and post is looked up by slug or alias first: a second run updates in place. What the
model wrote is kept in `docs/agents/seed/model.json` and `docs/agents/seed/covers/`, and a rerun
reuses it (`--fresh` asks again); what was written is recorded in `docs/agents/seed/apply.json`.

WordPress is written through `wp … --path=<webroot> --allow-root`, the way the theme stage does.
The legacy Joomla adapter without a target is written by `php seed-joomla.php <webroot>` with the plan on stdin: the script boots the
console application and writes with the Table API, so it needs no seat cookie and no HTTP.

## Measured (07/09/2026, the two local stands)

- Both CMS: 6 pages and the menu from one run; home carries the site's name and links; design and
  pricing carry the words; a second run updated the same rows.
- Model: `deepseek/deepseek-chat-v3.1` wrote 6 posts and all 13 sections in two turns; asked for
  posts and covers in ONE turn, `google/gemini-3.1-flash-image` wrote the posts and drew nothing,
  so each cover is a short turn of its own (6 of 6 drawn). Default image model `google/gemini-3.1-flash-lite-image`: $0.034 a cover, measured — half of `gemini-3.1-flash-image`; the cheapest OpenRouter offers through chat completions (FLUX and Seedream are not on it). `TRACY_SEED_IMAGE_MODEL` / `TRACY_SEED_TEXT_MODEL` override.

## Build and test

```
node scripts/build.mjs      # dist/seed.mjs (esbuild, everything inlined), dist/data, seed-joomla.php, the two wrappers
node --test test/*.test.mjs
```

`scripts/tools/stage-cms-seeder.sh` of the fleet package copies `dist/` into the lane image next to
the theme zips. The plan and the model turns are tested in `@tracy/dsh-design-inspiration`
(`test/seed-*.test.mjs`); this package tests the appliers against a fake lane.

## Quickstart content/display contract

Every Joomla CLI run requires `--target-site` and uses `src/apply-joomla-contract.mjs`.
A reviewed `--copy` mapping contains `contract`, inspected `revision`, scalar `changes`, evidence
references for factual slots, and `pending` for missing inputs. Otherwise the configured model maps
the brief against the Claude Cowork plugin's trusted slots and caches the result in `seed/contract-mapping.json`.
`CONTENT_REQUIRED` makes the build wait before any content write. Update the customer brief or the
reviewed mapping and rerun. Page-scoped requests are refused; a reviewed mapping can target individual
slots without touching others. The Claude Cowork plugin validates markup, links, image dimensions and the entire
protected presentation before and after the transaction.

Cowork 0.14.0 development prerelease is pinned by provision/quickstarts.json. The original archive
remains 1.1.0; the provisioner verifies and installs the Claude Cowork plugin, binds its private DB snapshot and
writes a host-owned policy marker before attaching an agent. Three canonical profile files under
`../tracy-joomla-quickstart/contracts/` ship unchanged in both the seeder and Claude Cowork plugin package.
