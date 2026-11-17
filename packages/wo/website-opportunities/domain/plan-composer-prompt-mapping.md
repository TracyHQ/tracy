# Plan composer prompt: what it took from the step chain's site planner

The build chat's plan composer prompt (`plan-composer-prompt.md`, a draft for #600) is made from the step chain's site
planner prompt (`apps/tracy-web/src/site-planner/planner-prompt.md`), as spec #575 asks: the build chat inherits the
step chain, and only what the new model needs changes. The step chain's prompt itself is unchanged and its runs keep
their recorded hash.

What the new model needs, and nothing else:

- it reads the template's form (blocks with typed fields, item counts, length limits, page recipes; ADR 0046) instead
  of the template's demo site, its images and its kit;
- the plan is made before any site exists, and shown to the owner as a plan card in the chat;
- it chooses pages, blocks, data and order; it writes no copy and plans no picture frame (the pictures summary,
  menu, footer and links are made by code from its pages).

The two prompts are kept as two files: their inputs and their answers have no part in common that a shared file with
a small variable part could hold without changing the step chain's bytes.

| Step chain section | In the composer prompt | Why |
|---|---|---|
| Your job | adapted | Same job and same "you decide, you do not write" rule; the plan goes to the owner's plan card, and a checking script (the rules gate) reads it first. |
| Input 1: the brief | adapted as "Input 1: the business" | Facts and items come as the needs profile with plan ids. The brief's `keyMessages`, `audience`, voice and `missing` (as `held`, with each reason) are passed as `brief` (`plan-composer-brief.mjs`). Observed facts never reach the needs profile, so their rule has nothing to act on. `suggestions` (sitemap hints) are not passed: the recipes decide the pages. |
| Input 2: the template kit | adapted as "Input 2: the template form" | The kit's page groups, frames, links, fixed text and demo slots do not exist in the form; blocks and recipes do. The brand step still owns name, logo and colours. Each block also carries the name the template gives its section when the kit's content map has one (#575), the one trace of the demo the model reads; demo wording never reaches it. |
| What the images are for | dropped | The model never sees the template's demo or its images (ADR 0046). Cards per row cannot be ported: the form declares no row width yet (deferred). |
| One job per block | copied, adapted | Copied whole, read from a block's type and fields instead of its look. Added from the plan's `story`, `visitorQuestion` and `keyMessage`: every kept block's `reason` says which visitor question, message or proof it carries, since the plan card shows reasons and has no page story field. |
| Trade knowledge | copied, adapted (#575) | Restored. The step chain marks a copy LINE `basis: "trade"` with the activity's fact; the composer writes no copy, so it marks the kept BLOCK `basis: "trade"` with `factIds` (the same names), and the block's own written copy is written after approval. The page writer does not yet write cards without items, so a repeating trade block is hidden by the write order with `list_below_min` (recorded, never a crash). The model never sees the demo, so it recognises such a block by the name the template gives the section (`name`, read from the kit's content map, `ai-quickstart-block-names.mjs`; no name, no trade basis) and by its field kinds (`editorial.*` is written copy, any other kind is a fact). Only a block whose unfilled fields are all written copy is kept this way; a fact field without data still follows the kit's `noData` rule. The terms rule is copied whole (no number, price, "free", discount, duration, count, schedule, place, result or guarantee), now on the block's `label` and `reason`. The step chain's owner task to confirm trade content becomes a note on the plan card under that block (owner tasks are shown after the build), which also says it can be removed with Change plan. The step chain's "hide only when a brief fact shows the business does not do it" becomes a left out block entry with its `block` id and that fact in `factIds`. Gate: `plan-gate-trade.mjs` (R10f and R21 adapted). |
| What you may decide | adapted | Kept: page keep or drop with reason, a person page kept for one named person, block keep or hide, item counts within min and max and never past the true items, one block per item on a page, contact channels on the contact page, never promising a channel a block does not show, the map needs an address, a form needs somewhere for its answers (a `newsletter` block, the only form the form declares), people never dropped while a block can show them. Dropped: slugs, main menu and dropdowns, footer columns, social rows and icons, picture frames, links, the map button, privacy and not found pages: all made after approval or by code, none on the plan card. |
| What you must never do | copied, adapted | Kept: never invent a fact or an offer's terms, never use what is held, reviews only in a reviews block, no new blocks, no final copy, no made up id, never decide a part twice. Dropped: rules about demo slots, frames, logo frames, name slots, CMS notices, kit gaps and link targets, which the form has none of. |
| Pictures: describe, do not choose | dropped | The composer plans no frame; code sums the pictures up for the card (`plan-look-pictures.mjs`) and the picture step works after approval. The person rule lives on in the gate (`plan-gate-people.mjs`). |
| How to work | adapted | Same order (read, decide pages, then blocks, count true items first, leave out instead of filling), without the image passes and frame wishes. |
| Output: the site plan | adapted | The answer is the composer's reply (`pages`, `assumptions`, `leftOut`), the shape the rules gate closes; the owner reads every label, reason and entry, so each is one plain sentence. Owner tasks are dropped here: they are shown after the build. |
| (closedness list) | adapted | "Nothing in the kit is left without a decision" becomes "every fact and item is shown or left out", which the gate also checks (`data_unaccounted`). |
| Left out pages | adapted | The pages of the kit the plan does not keep are listed by code from the page recipes, with a reason from the data (`plan-left-out-pages.mjs`), never by the model: the model's page names in the owner's language made the card change from one walk to the next (#575). A page entry of the model is dropped; one without a fact or item id is too (`plan-left-out-keyed.mjs`). |
| Self-check before you answer | adapted | Every check that applies to pages, blocks, data, labels and reasons is kept; checks about frames, slots, links, menu label widths and footer columns are dropped with their sections. |
| After you answer | copied | Fix only what the findings name, keep every other decision, answer with the whole plan; at most two fix rounds, as the step chain's bench has (`PLAN_COMPOSE_ATTEMPTS` is 3). |
