# ADR 0038 — Slot roles live in the content map; the Road to live checks them under Content coverage

- **Status:** (binding) — replaces [ADR 0037](0037-place-profile-is-template-independent.md) decision 5 (where slot roles are stored and when they are bound). Every other decision of ADR 0037 stands.
- **Date:** 27/10/2026
- **Decided by:** Akemi (COO), grilling session 27/10/2026. Lee, who decided ADR 0037, is informed on the pull request.

## Context

ADR 0037 decision 5 stores slot roles in a sidecar `slot-roles.json` next to each contract version, keyed by the sha256 of the contract's `content-map.json`. The Road to live shows it as its own step, Slot roles, which never holds Publish. Measured on `origin/develop` on 27/10/2026:

1. **What a slot is gets declared in three places.** The content map declares each slot (where it is, its type, its sample, `maxCharacters`, `requiresEvidence`). The sidecar declares what kind of fact it holds. Website Opportunities also keeps hand-written role maps (`packages/wo/website-opportunities/domain/slot-roles/*.json`) that `contract-copy-pins.mjs`, `section-fills.mjs`, `wo-copy-pins.js` and `emdash-wo-copy.js` still read.
2. **A role is just one more attribute of a slot.** The content map already carries half of it: `requiresEvidence` says a slot must not be invented, but not which fact fills it.
3. **The sidecar goes stale as a whole.** Its `baseHash` covers the content map's bytes, so any recapture marks every role stale, even when no slot changed meaning.
4. **Slot keys are stable across releases.** JA Boxing j6 1.0.1 to 1.0.4: 1648 and 1664 slots; 1632 keep the same key and the same sample, 16 keep the key with a new sample, 0 disappear, 16 are new.
5. **The sidecar repeats one rule.** In `tracy-base/j6/1.0.5/slot-roles.json`, all 439 neutral policies are `empty`.
6. **Roles are proposed without a model today.** `scripts/slot-roles/propose.mjs` maps field names and xpaths to roles from fixed tables; whatever it cannot place goes to `unplaced[]` for an agent to finish.
7. **The role vocabulary covers facts only.** `place-content-roles.mjs` lists 35 roles (business, offering, person, stat, quote, faq). There is no role for a heading, a paragraph, a button label, a menu label or a decorative picture.
8. **A released content map cannot change.** The Claude Cowork plugin stores the contract hash on every bound site. Changing one byte of a released `content-map.json` makes every site bound to it answer "Installed content contract changed" (Joomla `QuickstartContract.php`, no fallback; WordPress has `superseded.json`). This, not a quickstart release, is why a released map stays as it is.
9. **Two steps measure "is the content map complete".** Content coverage (holes and page hygiene) does; Slot roles asks the same question one level deeper (a declared slot that does not say what it holds).

## Decision

1. **Roles are declared in the content map, on each slot.** Every slot carries its role and its group (the card it belongs to: a name, a price and a picture of one offering share a group). The rule for a slot without a fact (ADR 0037 decision 7: empty or neutral wording) is declared once per role in the shared role vocabulary, next to the neutral wording; a template states it only to differ.
2. **Every text and image slot has a role.** The vocabulary gains editorial roles (heading, paragraph, button label, menu label, decorative picture) next to the fact roles.
3. **Roles are bound while the contract is captured, by the packaging agent, without a manual review.**
   - The rule tables propose first, so the same kind of slot gets the same role in every template.
   - The agent (a language model) reviews every slot, corrects wrong proposals and binds the rest from the sample and the position.
   - An automated check validates the structure.
   - The roles are then fixed in the content map, so a demo built from them is the same every time.
4. **A recapture keeps roles.** A slot with the same key and the same sample as in the previous version keeps its role; any other slot is bound again.
5. **EmDash declares roles in `seed/field-map.json`**, once per field, for every entry that uses it. EmDash has no content map.
6. **Released contract versions are never edited.** Roles enter a content map only when the template releases a new contract version. The three existing sidecars (`tracy-base/j6/1.0.5`, `ja-restaurant/wp7/1.0.1`, `tracy-emdash-theme-base/0.5.6`) stay readable until their template's next version, then are removed. During that window readers take roles from the content map first and the sidecar second.
7. **The Road to live checks roles inside Content coverage**, as a third group next to holes and page hygiene. The separate Slot roles step is removed.
   - A release not yet shown on Design inspiration is held from Publish while a text or image slot has no role.
   - A release already shown there only warns, like the other steps do for a live release.
8. **The hand-written Website Opportunities role maps are retired template by template**: a map is deleted once its template has roles in its content map. Until then a template without roles is built through the model, as today.
9. **Claude Cowork reads roles too.** The Joomla and WordPress plugins return each slot's role and group to the agent with the slot list. The skill tells the agent to use them (for "change the price of the Pro plan", edit the price slot in the Pro plan's group). No new write refusal is added.

## Consequences

- Capture scripts (`capture-contract.py` for Joomla, `capture-contract.mjs` for WordPress) read the previous version's content map, carry roles over by decision 4, run the rule tables, and leave the rest to the agent in the `quickstart-contract` skill.
- The role vocabulary gets a new version with the editorial roles and the per-role rule for a slot without a fact.
- Content coverage needs a group that holds Publish for a new release and only warns for a live one; today a warning exists only for a whole step.
- `slot-roles-step.js`, the Slot roles row of `ROAD_STEPS` and its guide entry in `problem-guides.ts` go away. `propose.mjs` and `check.mjs` become part of capture and of the contract check.
- A new template must bind roles for every slot (JA Boxing 1.0.4 has 1664 slots in all) before Publish. The rule tables and the agent keep that inside one packaging run.
- Templates released before this ADR get roles at their next release. Until then the Road to live only warns for them.
- The Claude Cowork plugin ships the new slot fields with the next contract it copies; sites bound to older contracts are unaffected.

## Alternatives rejected

- **Keep the sidecar (ADR 0037 decision 5).** Safe for released maps, but it keeps three declarations of one slot, goes stale as a whole on every recapture, and adds a Road to live step that does not hold anything.
- **Put roles into released content maps and make the plugin's hash skip role fields.** It would give old templates roles at once, but every bound site's check would depend on two plugins computing the same stripped hash; one difference locks customers out of editing.
- **Slot roles inside the Contract step.** Contract asks whether a contract exists and is pinned; whether the map is complete is Content coverage's question.
- **Roles for evidence slots only.** Smaller, but the Claude Cowork agent then knows nothing about headings and paragraphs, the larger part of what customers edit.
- **A language model binds every slot from scratch.** More judgement per slot, but the same field could get different roles in two templates; the rule tables keep them aligned and the model corrects them.
