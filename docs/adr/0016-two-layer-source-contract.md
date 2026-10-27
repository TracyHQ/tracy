# ADR 0016 — Two-layer source contract: one neutral source description, one compiler per CMS

- **Date**: 2026-09-15
- **Status**: binding
- **Decided by**: Lee (session comparing the three site-building skill sets, 15/09/2026)
- **Related**: [ADR 0006](0006-plugins-as-pinned-subtrees.md) (skills enter the tree as subtrees
  pinned to a commit — this decision says what runs *inside* those trees) · [ADR 0010](0010-design-inspiration.md)
  (display vocabulary)
- **Enforced in**: `JoomlArt-Products/tracy-emdash-template` first, then `tracy-wordpress-theme` and
  `tracy-joomla-template`; the execution plan is in [`tasks/todo-hop-dong-nguon-chung.md`](../../tasks/todo-hop-dong-nguon-chung.md)

## Context

Tracy has **three** skill sets that build customer sites, one per target CMS: EmDash, Joomla T4, WordPress.
Measured 15/09/2026 on the latest version of all three:

| | EmDash 1.0.5 | Joomla T4 1.1.0 | WordPress `520e670` |
|---|---|---|---|
| Script-based source adapters | **0** | 2 (`from-html`, `from-url`) | **3** (`+ from-joomla`) |
| Input contract | none | spec-pack | spec-pack |
| Can read a running CMS as a source | no | no | **Joomla** |
| Can read WordPress as a source | no | no | **no** |

The Joomla/WordPress sets already have the right shape: one **thin adapter** per source format, all emitting
a spec-pack, and from Phase 3 on the pipeline may not reopen the original source. But that shape **cannot yet be
shared**, for two measured reasons:

1. **The two spec-packs are two schemas carrying the TARGET CMS's vocabulary.** Joomla's `page-map.json` requires
   `template.name` to match `^ja_`, has `acm[]` and `positions[]`, and must cover `com_content.featured`,
   `error`, `offline`. The WordPress version names its section outright *"`page-map.json` — WordPress
   vocabulary"*. A Joomla spec-pack cannot be handed to the WordPress skill, and vice versa.
2. **The heaviest part of the content sits OUTSIDE the contract.** `from-joomla` additionally writes `content.json`,
   `sections.json`, `menus.json`, `redirects.json`, and its documentation says plainly: *"they are adapter
   output, not spec-pack members, and the validator does not read them."* `seed.mjs` in
   Phase 7 reads those four files — that is, the execution part is reading one specific adapter's private output.

The EmDash set has no layer at all yet. Its step that turns the source into content is `build-seed.mjs`, and
SKILL.md files it under *"specific to each template, not in the kit"*: the only existing copy is
`packages/cms/tracy-emdash-theme-business/tools/build-seed.mjs`, **1,829 lines**, written for exactly one
template. A second EmDash template will produce a second copy.

The cumulative consequence: today **no set can read a WordPress site**, not even the WordPress set; and every
time a source format is added, the work has to be done three times.

## Decision

### 1. The contract splits into two layers

**Neutral layer — `site-model.json`.** Describes *what the source says*, not which CMS will build it: `source`
(`kind`/`parity`), `pages[]`, `sections[]`, `entries[]`, `menus[]`, `routes[]`, `redirects[]`,
`media[]`, `tokens`, `facts[]`. Every source adapter emits this layer.

**Target layer — keep what exists.** Each set's `page-map.json`, and a separate **compiler** that translates
`site-model.json` into its CMS's vocabulary. This layer is **not unified**, and that is a decision, not
unfinished work: ACM modules, block patterns and EmDash collections are three genuinely different storage
models.

### 2. The neutral layer bans the vocabulary of **all three** CMSs

The schema folder must not contain `acm`, `positions`, `com_content`, `wp_block`, `wp_navigation`,
`collection`, `entry.data`. Enforced by a `grep` in the test suite, not by human eyes.

🔒 This rule targets the most dangerous party, and this time that party is **EmDash** — because EmDash is the first set to define
the schema (§4), it is also the set most likely to pollute the schema.

### 3. EmDash goes first, and the expensive step goes last

Order: schema + compiler in the EmDash set (not touching the other two) → EmDash consumes the Joomla data
already in `tasks/tracy-base-wp7/spec/` → `from-joomla` additionally emits `site-model.json` (an extra output,
no change to `seed.mjs`) → WordPress's `seed.mjs` drops the four side files → Joomla emits the same schema
→ `from-wordpress` written once for all three.

Why not start from the WordPress set even though it is the most mature: changing the input that `seed.mjs` (~2,900 lines) reads
touches the path that runs correctly for two accepted builds, and **breaking there breaks silently** — the seed
still runs, the site still comes up, a dropped section only shows up in `http-parity`. Doing EmDash first means the schema
bears two real consumers *before* anyone touches the expensive spot; doing it the other way round means every gap in the
schema has to be fixed twice in exactly the most dangerous place.

### 4. The schema's home is **temporary**, and the condition for moving it is written down first

At first only the EmDash set uses it, so the schema lives in that repo and **spawns no copy**. When
a second consumer appears, a choice must be made — split out a fourth repo (`tracy-site-contract`, subtree into all three per
ADR 0006) or keep EmDash as the home and have the other two vendor it. That decision is left for then, but
**the trigger condition** is settled now: when a second consumer appears, stop and choose; do not copy the file
to a second repo and figure it out later. A schema in two places is two versions of the truth, and the second drifts
silently.

## Consequences

- **Adapters written once, used by three skills.** This is what we get. `from-wordpress` — which no set
  has today — becomes one job instead of three.
- **The 1,829-line `build-seed.mjs` stops being single-use code**, split into data (`site-model.json`) and
  build rules (the compiler in the kit). A second EmDash template does not have to rewrite it.
- **The leak across the WordPress set's two-phase boundary is plugged** — the execution part reads the contract guarded by a
  validator, not one adapter's private output.
- **The cost**: each adapter has to emit one extra file while the two layers live side by side, and every set
  has to take one change of input. That cost is paid once, at a place we choose.

## Options considered and rejected

**One single contract for all three, merging the target layer too.** Rejected. It forces `page-map.json` to express
`acm[]` and `wp_block` and collections alike, i.e. one schema carrying the union of three vocabularies — each set reads
one third and ignores the rest. The validate gate could then rule on nothing meaningful.

**Copy `joomla-inventory.mjs` into the EmDash set.** Rejected. It avoids a clash between two repos, but spawns
a second Joomla reader — exactly what RULE #5 of `CLAUDE.md` and ADR 0006 forbid, and the second copy will
drift without anyone noticing.

**Leave it as is, each skill handles its own sources.** Rejected. That is the current state, and the current state has already shown
the cost: three sets, none able to read WordPress; one EmDash template, 1,829 lines of single-use code.
