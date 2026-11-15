- **The plan gate fixes the sixth end to end run's plan faults: left out wording repaired by code, one count rule at compose and revise, hours in a display form, a section key on every block (#609).** -- AI quickstart work for #575 (#609) | PR pending | `feat/ai-quickstart-575` | 2026-11-15
  **Affects:** the plan card team (new optional keys to translate by) and anyone reading compose `fixes`. Every new key of the plan is optional, so a stored plan stays valid (Contract B: `fact.display`, `fact.code`, `fact.params`, `block.labelCode`, `left out entry.params`; `docs/references/build-contract.md`). No prompt changed.

  - A left out reason with a build word ("fields", "CTA", a block id) no longer fails the plan: the gate replaces it with the sentence code knows for that section, else a neutral sentence, recorded in `fixes` as `left_out_internal_wording`. Only a build word in the name (`what`) of a section still goes back to the model.
  - A model reason saying a section has no data to show, or that the business has no logo on a plan with a logo (own or drawn by Tracy), takes the sentence code writes (fix `left_out_reason_derived`). Photos no gallery has room for read one sentence agreeing with their number.
  - A block the gate leaves under its `items.min` (items too long for it, or taken off by the pictures summary) leaves the plan with a left out entry, or, when it is the page's main block, is a `too_few_items` problem at compose. A plan the compose gate passes now passes the change request gate again: before, a list kept with one item under its minimum of two was refused at the first unrelated request. The pictures estimate is counted on the final pages.
  - A revision carries the code of a left out entry code wrote (it used to turn into `model_reason`).
  - Opening hours the owner gives in a request and the design has no place for are a not done line (`owner_value_not_shown`), and the saved line says them in their display form.

  | Where | Code | Parameters | English text |
  |---|---|---|---|
  | `facts[].display` of `contact.hours` | `opening_hours` | `{groups, from1, to1, hours1, ...}`: days `mo` to `su`, hours `HH:MM-HH:MM` (ranges joined by a comma) or `closed` | Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00 |
  | `blocks[].labelCode` | the block type (`services`, `footer`, ...) or `page_header` | none | the composer's `label` stays the fallback |
  | `leftOut[]` | `no_gallery_room` | `{count}` | No gallery has room for this photo. ... / No gallery has room for these N photos. They ... |
  | `leftOut[]` | `section_below_minimum` | `{min, shown}` (section), `{min}` (item) | This section needs at least N of your services, and only M is left for it, so I left the section out. |
  | `leftOut[]` | `left_out_neutral` | none | This page is not part of your plan. / This section is not part of your plan. / This is not shown on your plan. |
  | `leftOut[]` | `no_items_to_show` (now also replacing a model reason) | none | You have nothing yet for this section to show. |
  | `codes.notDone[i]` | `owner_value_not_shown` | `{kind, label, because}` (`because`: the fact's left out code) | Your answer is saved, but your design has no place that shows it. |
  | `codes.changed[i]` | `owner_value_saved` | adds `display` for hours | Your answer is saved: Opening hours, Monday to Friday, ... |
