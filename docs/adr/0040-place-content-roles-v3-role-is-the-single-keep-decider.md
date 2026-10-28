# ADR 0040 — Place content roles v3: the slot role is the only decider of keep or replace

- **Status:** (binding) — replaces [ADR 0039](0039-slot-fit-lives-in-content-map.md) decision 3 (a picture's keep flag follows its measured kind) for content maps bound against `place-content-roles/3`. Every other decision of ADR 0039 stands, and decision 3 still holds for every `place-content-roles/2` map.
- **Date:** 28/10/2026
- **Decided by:** Akemi (COO), spec "Template readiness, every slot labelled right and enforced by Road to live" (TracyHQ/tracy#37), ticket #40.

## Context

1. **Three fields decide whether a slot keeps the demo's content.** The slot role (ADR 0038), a picture's `fit.replace`
   (ADR 0039) and `customize: "keep"` (the full-coverage capture). They disagree: Slot fit locks avatars, signatures,
   cut-outs and icons to "keep" whatever the role says, so in JA Boxing 1.0.7 seven trainer photos with role
   `person.image` keep the demo faces, because capture measured them as avatars.
2. **The vocabulary lacks roles.** A research pass on 28/10 judged JA Boxing 1.0.7 component by component and all 47
   released content maps mechanically. It found no role for a gallery, a video, a class schedule, a card's icon, a
   copyright line, a map, a newsletter sign-up, a link to a page of the site, faces that prove a number, or a heading
   that states a claim ("No1 since 2008"), and no way to label a sample blog post once.
3. **`editorial.decorative_image` mixes two things.** A picture that illustrates the copy (a build may put the
   business's own photo there) and a shape or texture of the design (it must stay).
4. **Repeated lists are fixed-size.** A restaurant with 256 priced items shows the demo's two and keeps the demo menu.
5. **A released content map cannot change** (ADR 0038, context 8).

## Decision

1. **Vocabulary `place-content-roles/3`**, in `packages/wo/website-opportunities/domain/place-content-roles.mjs`, beside
   version 2:
   - new fact roles: `business.gallery_image`, `business.video`, `business.copyright`, `contact.map`,
     `offering.schedule`, `stat.proof_image`, `claim.heading`;
   - the sample article roles: `article.title`, `article.lead`, `article.image`, `article.date`;
   - `editorial.decorative_image` is split into `editorial.illustration` and `editorial.design_element`;
   - new editorial roles: `editorial.item_icon`, `editorial.newsletter_label`, `editorial.navigation_url`;
   - a new group kind, `gallery`.
2. **The role alone decides keep or replace** (`KEEP_DECISION_BY_ROLE`), with three outcomes:
   - `replace`: the demo never stays. Every fact role and every article role. The business's fact (or its own post)
     fills the slot; without one, the role's neutral rule does (ADR 0037: the layout stays).
   - `rewrite`: page copy or an illustration; a build may write the business's own words or photo over it.
   - `keep`: the template's own stays: `editorial.design_element`, `editorial.item_icon`, `editorial.navigation_url`.
3. **`customize` and `fit.replace` are derived from the role** in a version 3 map. They stay on the slot so every
   reader keeps working, but the contract check refuses a slot where they disagree with the role:
   `customize: "keep"` exactly when the role decides `keep`; a picture's `fit.replace` is `keep` for a kept role,
   `logo` for `business.logo` and `claim.entity_logo`, else `photo`. Slot fit's `kind` describes shape only.
4. **Repeatable lists.** A version 3 map may declare `repeatableLists`, keyed by a collection of groups (a group id
   without its item number, as `fitGroups` names it): `itemTemplate` (the group a build copies for each item it adds),
   `min` and `max` (`null` for no limit). Every group of the collection has the template's kind.
5. **Neither side invents a role string.** The vocabulary file is the one reviewed place where a role is added. The
   checks refuse a string the map's version does not list: a version 3 role in a version 2 map, and
   `editorial.decorative_image` in a version 3 map. The brief side (Brief readiness) uses the same strings.
6. **Expand, then contract.** Version 2 stays valid and stays the version capture writes until capture moves to
   version 3 in its own change. A version 2 map keeps its old reading (ADR 0039 decision 3) and every released map
   validates unchanged.

## Consequences

- One function answers keep or replace for any slot (`keepDecisionOf` in `content-map-keep-decision.mjs`): from the
  role in a version 3 map, from `customize` and `fit.replace` in an older one.
- The Slot fit check stops tying `replace` to `kind` in a version 3 map; the role check judges it instead. A picture
  measured as an avatar with a person role is replaced; the build gives it a neutral substitute when the business has
  no photo of that person.
- Capture (whole-unit slots, WordPress coverage, rule tables) and the LLM judge are separate changes (#42 to #44);
  they write and enforce version 3.
- The mechanical rules R2 to R9 (#41) are computed by the content coverage audit (audit 1.2.0) and committed in
  `content-coverage.json` as `labelRules`; the Road to live Content coverage step reads only that block. A failing rule
  holds a release not shown on Design inspiration and warns for a live one; R1 (the fact-role share) is a number and
  never holds. They hold only for a `place-content-roles/3` map (`labelRules.blockingVocabularies` in the coverage
  policy): a version 2 map is measured and listed but never holds, so no released template is held before it adopts
  version 3. A coverage file without `labelRules` (audit 1.1.0) is not judged. R9 ignores accepted reasons: a fact the
  map misses stays the demo's on the customer's site.
- JA Boxing 1.0.8 is the first contract expected in version 3; every template adopts it with its next release.

## Alternatives rejected

- **Keep three deciders and document their order.** Every reader would have to apply the same order, and the
  trainer-photo bug shows they do not.
- **Drop `customize` and `fit.replace` now.** Every reader (Customize, the picture planner, the agent demo, the Claude
  Cowork plugin) would change in one step, and released maps would read differently.
- **Rename `editorial.decorative_image` in place.** Released maps carry it; they must keep validating.
