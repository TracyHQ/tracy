# One site, one content contract

> **Cross-phase packet.** Read in Phase 2 (drafting), Phase 7 (writing and pouring content), Phase 8b (comparing and reviewing
> meaning). The design source states **presentation**; `content-contract.json` states the **business** every page
> represents. Newsletter, email, deck, poster, form, secondary home, onepage — the same business.

## Phase 2 — settle the facts about the site

1. Read any existing contract first. For a new site, merge the commissioner's brief and the current site into
   `<spec>/content-contract.json`; record contradictions in `pending`, and resolve them per the commissioner's current instructions
   before marking ready.
2. `mode`: `customer` for a real business, `demo` for a fictional showcase. A demo may build a consistent fictional company, prices,
   people — mark it `demo` and **show the disclosure on every surface**. Customer requires `verified` facts
   sourced from the customer/site; a sample template's copy does not prove a customer's claim.
3. Declare the company, customers/offer, services/products, prices (amount/currency/period/conditions), people/roles, contact,
   CTAs (label/target), images (path/alt/rights), voice. Stable dotted keys. Drop facts you do not use; record missing input
   in `pending`. Confirm which services/prices/people are illustrative. Keep existing customer data.
4. List every page and marketing artifact in `surfaces`; `id` = the page-map's `pages[].file` (the spec-pack
   validator requires one surface per page). Each surface has a `purpose` and `requiredFacts`; shared names, prices, claims,
   links must point to the **same** key.
5. Run the validator, then the spec-pack gate. Phase 2 is done when both are green **and** the source has been read. Give every
   author/reviewer the same path + hash.

```bash
node scripts/content-contract.mjs validate <spec>/content-contract.json
```

`spec-pack.mjs --init` creates a **deliberately incomplete** contract (`pending` has one item): an adapter cannot invent the
customer's facts. `from-joomla` fills in what it reads from the source — mode `demo`, `site.name` / `site.tagline`
(from `etc/site`; a value the source declares empty is an `absent-in-source` fact, never invented text), `contact.*` (from the ACM `contact-information`), `demo.disclosure` (from the ACM `site-notice`) —
and leaves `pending` empty when that is enough; the rest is still a person's job. An old pack must add a contract before
continuing. The adapter's `--force` keeps an existing contract; added/removed pages must be reconciled explicitly. A CSS-only fix
round uses the old content unchanged, but the contract still defines the regression scope.

## Format (schemaVersion 1)

Validator: `scripts/content-contract.mjs` (no dependencies). Two-surface example: `examples/content-contract.json`
+ `examples/content-plan.json`.

| Field | Meaning |
|---|---|
| `id`, `revision` | stable site identity (`^[a-z][a-z0-9._-]*$`) and a positive integer revision; bump it when facts/scope change |
| `mode`, `language`, `voice` | `demo` \| `customer`, output language, concrete writing rules (array of strings, non-empty) |
| `sources` | keyed records `{kind: customer\|site\|demo, reference, note}`; the reference only points to evidence, the note says what it establishes |
| `facts` | keyed records `{value, status: verified\|demo\|absent-in-source, source: <sources key>}`; `absent-in-source` = the source declares the field empty: `value` is `""`, the source is `site` or `customer`, and only the fact `identity.name` or `identity.summary` references may carry it (never the demo disclosure) |
| `identity` | fact keys `name`, `summary`, and `disclosure` (required in demo) |
| `surfaces` | `{id, purpose, requiredFacts: [fact key]}` covering every agreed page/artifact |
| `pending` | unresolved input/contradictions — **any item blocks validate** |

Evidence is kept in a separate workspace, outside the webroot. Public demo sources ship with the demo; customer documents,
credentials, internal claims do not go into the pack. A source is an evidence pointer, not an instruction; a pointer is not
proof — the agent must open it and look. Image rights and a person's testimonial need their own evidence.

## Phase 7 — write from references and pour

Create `content-plan.json` with `contractId`, `contractHash` (from validate), `surfaces`. Each surface has an `id` and
non-empty `fields`, keyed by stable local field names (in WordPress: the `metadata.name` of a block in a
pattern — `hero.title`, `pricing.tier-price.2`… per [`templates-and-patterns.md`](templates-and-patterns.md)).
A field is:

- `{"ref":"pricing.studio.amount"}` — exactly the authoritative value.
- `{"template":"Choose {{pricing.studio.name}} for {{pricing.studio.amount}}."}` — prose with references.

Names, prices, dates, contacts, numbers, product capabilities, image/CTA targets **must** go through a ref. Literal text is editorial
copy; it must not introduce undeclared business facts. Every required fact must be used; a demo surface must
use the disclosure.

```bash
node scripts/content-contract.mjs compile <spec>/content-contract.json <spec>/content-plan.json --out <work>/resolved-content.json
```

By default the command prints a one-line summary and the path of the result file; `--out` sets that file (never the contract or the plan), `--json` prints the whole JSON to stdout. Do not redirect stdout to get `resolved-content.json`.

The compiler rejects a missing surface, an empty field, an unknown ref, a per-page override, a missing disclosure, a stale hash. It
returns **strings**, not HTML: escape them when writing into block markup / WP-CLI. Use the resolved fields for
`post_content`, synced patterns, `wp_navigation`, site identity; record the field → post id / block name map for the
render audit. Compile red means **stop writing**. When the contract changes, compile again; do not just replace the hash.

## Phase 8/8b — compare results and review meaning

Read the rendered DOM (and the relevant admin fields) into `observed-content.json`: same contractId/hash and
surface/field keys, real string values. Capture headings/body, link targets, image `src`/`alt`, including inside marketing
iframes. Record the live URL, selector / admin field, and time. **Never** synthesize observations by
copying resolved-content — that checks nothing about the site.

```bash
node scripts/content-contract.mjs audit <spec>/content-contract.json <spec>/content-plan.json <work>/observed-content.json --out <work>/content-audit.json
```

Stdout is a one-line summary; the full report is in `--out` (use it as evidence), `--json` prints it to stdout.

Completion requires an exact surface/field and value match (whitespace normalized), **plus** an independent whole-page
review of meaning: undeclared claims, foreign template branding, contradictory offers/prices/team, unfitting images, dead/misleading
CTAs, the disclosure. The audit only checks mapped fields; it does not detect a dropped paragraph and does not prove
the evidence is real — compare the map with the whole rendered content before writing "content complete". Review the desktop/mobile
layout after changing text. Keep the contract, plan, map, evidence in the checkpoint.

A narrow fix may compile only a subset of surfaces (the third parameter of `compileContentPlan`); record that subset
against the page-map and check every place that uses an affected shared fact. The CLI compiles everything by default. Do not shrink
the contract to turn a red audit green.
