# Quickstart content contracts

A contract binds one published quickstart to its editable content slots and its design baseline.
The canonical files live here; the exact same files ship with the seeder and Joomla Cowork.
Never accept a contract supplied by an agent in a write request.

- `manifest.json`: package identity, archive checksums, contract schema and required Claude Cowork plugin.
- `<version>.design.json`, beside the profile directory (`tracy-apple/j6/1.3.0.design.json`): the design system the quickstart wears — `{"design": {"id": "<catalog id>", "source": "catalog"}}` or `{"design": null}` when it wears none the catalogue can name. Outside the directory on purpose: the directory is a sealed package (the pinned Claude Cowork plugin carries `manifest.json` byte for byte, and every `.json` of a served profile is pinned in `design-templates.json`), while this fact is Tracy's alone and ships in no package. tracy-web joins it into the template card, the build writes it into the site folder, and `check-contracts` requires the file and checks the id against `vendor/tracy/od-design-system/catalog.json` (29/09/2026).
- `content-map.json`: stable entity identities and allowed scalar content slots.
- `presentation-lock.json`: the design baseline — database fields, module assignments and executable asset hashes.

The Claude Cowork plugin resolves identities against the installed site and stores the binding and initial snapshot
in its private database table. IDs are installation data, not public files. A missing or ambiguous
identity, an unsupported field or an incompatible package fails closed. A presentation that already
differs from the baseline does not: since ADR 0022 (pinned Claude Cowork plugin 0.24.4) every apply
answers it as a `PRESENTATION_DRIFT` warning and goes through. What is still refused is a difference
an apply's OWN write would make — the whole apply is rolled back and nothing changes.

A contract is a content recommendation, not a lock (ADR 0022, replacing ADR 0020): it records the
quickstart's design so a change can be compared against it. To keep that design, reuse its modules,
articles, menus, layouts, ACM variations, classes, CSS, scripts and fonts, and write new text at
0.75×–1.25× the length of the text it replaces — outside that range is a warning, never a refusal.
Nothing on a quickstart site is locked except writing the database directly. Claude Cowork plugins released
before ADR 0022 still refuse structural writes on a bound site (`content_only`) until a Claude Cowork plugin
following it is pinned. Missing factual content remains a validation issue; it must never turn into
fabricated testimonials, customers, prices or statistics.

## Content and display are one contract

Joomla Module Manager exposes the conditions under which content is visible. Preserve module status
(including publishing schedules), module type AND ACM type/variation, position, ordering, show-title,
language, client, access level and menu assignment mode (all, none, include, exclude) with its exact
menu set. A label such as Home - Hero does not establish which page uses the module.

Also preserve module chrome/tag, header tag/class, module class, Bootstrap size, caching, template
style/layout, menu hierarchy/status/access, and effective access-level/ACL definitions. A different
access ID with the same label is not proof of the same audience. Capture these dependencies without
copying users, passwords or site tokens into the public contract.

Observed read-only in Joomla admin at 127.0.0.1:8212 on 2026-09-12: Home - Hero (178) is published,
uses masthead and Public access, but is assigned only to Home variation. The working demo also has
later content and layout edits; it is not the published 1.1.0 baseline.

## One base archive, more than one design

A design is not always its own archive. `tracy-airbnb/j6/1.0.0` is the same `tracy-apple/j6/1.1.0`
base with the `tracy_airbnb` template installed on top and the six base template styles rewritten
in place, so both profiles describe the same 197 entities and the same 1,113 scalar slots. The
difference is exactly six template-style rows, the six `media/t4/css/<styleId>.css` files T4
compiles from their parameters, and the 272 files of the template package.

Which profile a site is held to is a component parameter the provisioner writes, next to the write
token and with the same trust; it never arrives on a request. A Claude Cowork plugin that does not carry the
profile a site names refuses every action rather than answering as a site with no contract — that
state is the one in which structural writes are allowed, so reaching it by being out of date would
be the worst possible failure. Changing the parameter on a site that is already bound does not
rebind it: the stored snapshot pins the contract hash, and the file lock catches the design change
first. A design change on a live site needs its own migration workflow.

T4 writes `media/t4/css/<styleId>.css` the first time a route using that style is served, so an
activation regenerates all of them before the site is bound. Otherwise a site binds with the base
design's compiled colours and drifts on its first visitor.

## Current delivery boundary

The first contract covers the published `tracy-apple/j6/1.1.0` archive. The capture contains
197 entities, 1,113 scalar slots, page-to-menu/style/assignment relationships and 3,900 protected
files. `assignedModules` are routing candidates, not a claim that every candidate is visible:
rendered positions, responsive rules, access, language and schedules still apply.

The seeder accepts an explicit reviewed mapping through its existing `--copy` argument:
`contract`, `revision` from `content.contract inspect`, `changes` keyed by slot, `evidence` for
factual copy, and `pending` for missing customer inputs. The new Claude Cowork plugin is Cowork 0.14.0.
Its package contains the same three canonical JSON files. A bound site's generic structural
write actions are refused; content receipts support replay and reverse-order undo.

This is an opt-in path in the current implementation. The default Joomla build stages still use
the older T4 recipe. Do not advertise the contract as active for all builds until the new Claude Cowork plugin
is released/pinned and the default copy/style/seed stages use it. The 8212 working demo does not
match this published archive and needs its own versioned profile after its design is finalized.

ACL comparison uses effective inherited rules. Joomla may materialize a previously absent empty
module asset during a normal save; this must not be confused with a change in audience or edit
permissions. View-level memberships and user-group ancestry are preserved without recording users.

Keeping CSS/layout unchanged does not keep text wrapping or section height identical. The scalar
limits and image aspect-ratio checks reduce overflow; desktop/mobile visual review remains needed.
Evidence references record provenance supplied by the caller; the Claude Cowork plugin cannot independently
prove a business claim is true. Joomla plugin directives such as `{loadposition ...}` remain locked.

T4's hashed generated files under `media/t4/optimize/css` and `js` may be created or cleared as
routes render. Their source CSS/JS, optimizer code and settings stay hash-compared: a changed file is
reported as a `PRESENTATION_DRIFT` warning (never a refusal, ADR 0022); the cache exception does not
accept executable files or symlinks. Seeder build verifies the three canonical file hashes
against hashes extracted from the checksum-pinned Claude Cowork plugin ZIP in `quickstarts.json`.

## Adding a language version (contract extension, 1.0.0)

`multilingual-map.json` is a FOURTH file beside the three above, with its own `extensionVersion`,
pinned to the base by the sha256 of those three files' bytes. The published `tracy-apple/j6/1.1.0`
identity and the Claude Cowork plugin's own `contractHash` are unchanged: a site already bound keeps working,
and a Claude Cowork plugin without this file simply reports the capability as unsupported.

It is GENERATED from the base contract by `scripts/build-joomla-multilingual.mjs`, and the
`joomla-multilingual` gate regenerates and compares it. That is not ceremony: it classifies all 197
entities, and one missing classification is not a missing line in a file — it is a block of
source-language text on a translated page, which nothing else in the system would mention.

Every entity is `translate` or `shared`, and every `shared` one carries its reason. Article, menu
item and module copies are DERIVED: the Claude Cowork plugin recomputes, from the source row plus this profile,
exactly what each copy must contain, so the binding records which ids exist and never what they may
hold. A copy's content slots are the source's slots re-keyed (`zh-CN::module-170.0`), so editing a
translation afterwards runs through the same door, the same length limits and the same refusals as
editing the original.

Two alias rules, because Joomla has two. `#__menu` is unique on
`(client_id, parent_id, alias, language)`, so a menu copy KEEPS its source's alias and
`/en/resources/style-guide` and `/zh/resources/style-guide` are one route in two editions.
`Table\Content::store()` checks an article alias against `(alias, catid)` and ignores language
entirely, so an article copy takes the language's URL segment as a suffix. The source must leave
`language='*'` BEFORE any copy is created, or Joomla refuses each menu item with a sentence about
aliases that says nothing about ordering.

The language pack is named by LOCALE, never by URL: `language-packs.json` pins the three verified
archives (fr-FR, zh-CN, zh-TW) by first-hop host, version, sha256 and exact byte count, all
re-measured against Joomla's accredited-translation feed on 2026-09-12. A caller on a bound site
cannot supply its own URL, hash or size even correctly — accepting that shape is accepting a request
that could carry wrong ones.

⚠ A phase of the apply is bounded, NOT atomic. Joomla places tree rows and every `#__assets` row
through `Table\Nested::store()`, whose `LOCK TABLES` is an implicit COMMIT in MySQL and MariaDB, so a
phase that throws can leave real rows behind while its own checkpoint and undo entries roll back.
What makes a re-run safe is that every copy is FOUND before it is made — by the provenance note for
a module or menu item, and by derived alias plus category for an article, whose row has no note
column an Apply may write.

What this does NOT cover, with the effect a visitor sees, is listed in the profile's `unsupported`
array and must be repeated to the customer rather than quietly omitted: category titles and
descriptions, the utility menu outside the contract inventory, archived articles, words inside
images, and menu items linking to a raw path.
