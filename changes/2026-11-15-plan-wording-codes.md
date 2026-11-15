- **Every sentence or name code writes into the plan now has a stable code and its parameters beside the English text (#609 over #617).** -- AI quickstart work for #575 (#609) | PR pending | `feat/ai-quickstart-575` | 2026-11-15
  **Affects:** the plan card team, which translates by code (the pattern of `leftOut[].code`). The English text stays as the fallback. Every new key of the plan is optional, so a stored plan stays valid (Contract B: `logo.code`, `logo.sourceKind`, `own pictures.fromKinds`, `generated pictures.code`, `generated pictures.params`, `assumption.code`, `assumption.params`; `docs/references/build-contract.md`). A change request result adds `codes.changedParams`, `codes.notDoneParams` and `codes.notDoneReasons` beside `codes.changed` and `codes.notDone`, one entry per line, in the same order. The pictures estimate after the customer lowers the count is now written again for the lowered count (the sentence used to keep the old number). No prompt changed.

  | Where | Code | Parameters | English text |
  |---|---|---|---|
  | `plan.pictures.generated` | `pictures_generated_estimate` | `{count}` | About N pictures will be created where you have no suitable photo. The final number depends on your photos. (one sentence; "picture" when count is 1) |
  | `plan.pictures.own.fromKinds` | none, a list | kinds: `website`, `google`, `social`, `answer`, same order as `from` | `from` keeps the names ("Website", "Google Maps listing", ...) |
  | `plan.look.logo` (own, fallback look in tests) | `logo_source_own` | `sourceKind`: `website`, `google`, `instagram`, `facebook`, `tiktok` | the source name, for example "Instagram profile" |
  | `plan.look.logo` (drawn) | `logo_source_drawn` | `sourceKind` as above, absent when unknown | Tracy, based on the logo on your <source> |
  | `plan.look.logo` (text) | none | none | no source line |
  | assumption `logo`, drawn | `logo_drawn` | `{reason: new-symbol-drawn \| symbol-cut-from-logo \| name-set-in-template-font, sourceKind?}` | Tracy drew a logo based on your logo: ... |
  | assumption `logo`, made | `logo_made` | `{found: boolean, mark: icon \| lettermark \| mark}` | ... I made a temporary one: ... |
  | `codes.changed[i]` | `page-removed` | `{page, name}` | The X page is removed. |
  | | `page-added` | `{page, name}` | A X page is added. |
  | | `page-renamed` | `{page, from, name}` | The X page is now called Y. |
  | | `page-order` | `{pages: ids, names}` | The pages are now in this order: ... |
  | | `block-removed`, `block-added` | `{page, pageName, block, label, section?}` | The X section is removed from the Y page. / A X section is added to the Y page. |
  | | `block-data` | `{page, pageName, block, label, section?, count, names?: [{name, count}]}` (no `names` when the line says only the count) | The X section of the Y page now shows ... |
  | | `block-order` | `{page, pageName}` | The sections of the X page are in a new order. |
  | | `data-off`, `data-on`, `data-again` | `{names: [{name, count}], count}` | No longer shown: ... / Now shown: ... / Now shown again: ..., which you had taken off earlier. |
  | | `pictures-own` | `{count}` | The plan now uses N photos of yours. |
  | | `pictures-drawn` | `{count}`, 0 means none | About N pictures will be created ... / Tracy will not create any pictures now. |
  | | `owner_value_saved` | `{kind, label, value}` | Your answer is saved: label, value. |
  | | `item_renamed` | `{item, from, name}` | X is now called Y. |
  | | `item_taken_off` | `{item, name}` | X stays off your site, as you asked. |
  | `codes.notDone[i]` | `page_already_on_plan` | `{name}` | The plan already has this page. |
  | | `section_not_filled` | `{name}` | There is nothing of your business to fill it, so it is not added. |
  | | `item_rename_refused` | `{item, from, name}` | the gate's message |
  | | `nothing_to_change` | `{}` | Nothing on the plan could follow it, so the plan is unchanged. |
  | `codes.notDoneReasons[i]` | the refusal kind of every line, also a line the model wrote (code null): `no_recipe`, `no_data`, `fact_missing`, `kept_private`, `outside_plan` | none | the model's `why` stays as text |

  `section` is the code of the section label: the block type (`team`, `gallery`, `services`, ...) or `page_header`, from `SECTION_LABELS` in `plan-gate-fixes.mjs`; absent when the block type has no label name.

  Still English text without a code (for a later round), all under `packages/wo/website-opportunities/domain/`:
  - assumptions `said` written by code: `plan-composer.mjs:95` (language), `plan-conflicts.mjs:109-110` (sources disagree), `brand-before-site.mjs` `noHueSaid` and `record.accent.say` (accent), `brand-look-adjust.mjs:95-101` and `:111` (accent adjusted or unreadable), `plan-look-pictures.mjs:45` and `:63` (tests only fallback look).
  - block `reason` written by code: `plan-placement.mjs:84-85` (section added for leftover items), `plan-placement-facts.mjs:118` (section for business details).
  - labels and names: `plan-data.mjs:74` and `:77` (a photo, "Review by NAME", "Review: TEXT"), `plan-data.mjs` `FACT_LABELS` and `ITEM_NOUNS` (fact and item labels have a `kind` to translate by), `plan-placement.mjs:80` (section label from a noun), `plan-answers.mjs:36-38` and `:190` (left out `what` of a contact detail), `plan-withheld.mjs:172-177` (what of a withheld entry), `plan-look-pictures.mjs` `EMPTY_FRAME_REASONS` (what "N picture spots of people", count not a parameter).
  - left out entries with a code but no parameters in the sentence: `plan-placement.mjs:133-138` (counts "needs at least N, and you have M"), `plan-rows-fit.mjs`, `plan-data-limits.mjs:39`, `plan-emptied-blocks.mjs:17`.
  - left out entries that carry the code `model_reason` or `stated` though code wrote them: `plan-request-apply.mjs:17` and `plan-request-taken-off.mjs:16` (taken off at the request), `plan-request-settled.mjs:26` and `:28` (page removed, page no longer part of the plan).
  - texts outside the plan data but read by the owner: `plan-edit-gate.mjs:38-45` and `plan-edit-words.mjs:15` (edit refusals), `plan-site-name.mjs:31` and `plan-site-name-question.mjs:16`.
