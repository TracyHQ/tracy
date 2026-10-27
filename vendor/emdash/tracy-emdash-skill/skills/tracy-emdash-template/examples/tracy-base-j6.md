# Tracy Base (Joomla 6) → source contract — 15/09/2026, ADR 0016 §2a

The first proof that `site-model.json` can carry a real Joomla site, not only data that a
person wrote by hand or a canvas exported.

**Source**: `tasks/tracy-base-wp7/spec/` in TCH — the `from-joomla.mjs` spec-pack that the WordPress kit
emitted when porting Tracy Base to WordPress (13–14/09/2026). 40 pages, 82 articles, 46 ACM instances.

**Road**: `from-wp-spec.mjs` (bridge, [packet](../references/inputs/from-wp-spec.md)) →
`site-model.json` → `compile-seed.mjs` → `seed.json`.

**Result**:

| Measured | Count |
|---|---|
| Types generated | 20 (2 fixed: `pages`, `posts` — 18 inferred from ACM types: hero, story-chapter, features-intro, statistics, pricing, testimonials, clients, cta-capsule, team, accordion, carousel, tabs, timeline, menu-feature, social-links, contact-information, marketing-samples, site-notice) |
| Records | 129 |
| Menus | 3, including 6 `heading` items (group labels with no target) |
| Media registered | 28 |
| Traces of other CMSes in the generated seed | 0 (`wp:paragraph`, `wp-content`, `wp-block`, `wp-image`) |
| `validate.mjs` (contract) | 0 errors |
| EmDash's own `validateSeed` | `valid: true`, 0 errors, 0 warnings |

**Two errors the EmDash gate caught, and the fix**:

1. `url is required for custom menu items` — six items are Joomla `heading`s (group labels), not
   links. The adapter writes `path: ''` + `kind: 'heading'`; the compiler translates it to `url: '#'` on the way to EmDash.
2. `redirects[0]: source is required` — the contract uses `from`/`to` (the vocabulary shared by the three CMSes), EmDash
   reads `source`/`destination`. The compiler renames them, not the adapter.

## Real site — built and measured, same day

Built a clean EmDash site from the template tree, replaced `seed/` with the seed compiled above, then ran
`tools/bootstrap-site.sh`. No template code changed, no seed edited by hand.

| Measurement | Result |
|---|---|
| `bootstrap-site.sh` | ran to completion, **0 conflicts**, never needed `--force` |
| `seed-apply status` | `total 129 · missing 0 · changed 0 · conflicts 0 · drafts 0` |
| Entry count via REST, per collection | **129/129 match the seed**, all 20 collections |
| Admin edit (`PUT` → `publish` → revert) on `hero/product-hero` | `PUT` creates a **draft** on a `published` entry (invariant #3 holds); publish brings the new text out; revert returns exactly the original text |
| Content read back | verbatim from the Joomla source — `Keeping project decisions findable`, `Choose the level of support that fits.`, … |

⚠ **The frontend returns HTTP 500, and that is what must happen.** The site was built on the *Tracy
Business* template tree, and Business has Astro views for its own 14 collections (`home`, `projects`, `services`…);
the Tracy Base seed carries **20 entirely different collections** (`pages`, `posts`, `hero`, `story_chapter`…). No
view knows how to render them, so `/` dies at `home`. In other words: **the content has moved to EmDash in
full; what is missing is a template for the Tracy Base design** — that is P3–P5 of this skill, not
the contract's job.

**Not done yet**: an Astro template for Tracy Base (and therefore `qa.mjs --browser` too); design tokens
(the spec-pack's `design-contract.json` has no place in `site-model.json` v1 yet); images not uploaded
(`media.uploaded 0` — 28 files declared in `media-map.json`, the real image source is not in the spec-pack).
