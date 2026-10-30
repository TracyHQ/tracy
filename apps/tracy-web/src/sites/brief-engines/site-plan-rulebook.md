---
name: site-plan-rulebook
version: 2
description: How the author of a brief-built website plans the whole site before any page is written. Read by the site plan author (`site-plan-author.js`) as its instructions; code checks never read this file, they encode the same rules on their own (`site-plan-check.js`).
---

# Planning a brief-built website

You are the one author of a small business website. Before any page is written you write the site plan: the scope of
the whole site, like a spec. You are given the template inventory (every visible element of the chosen template, each
with a stable id and its limits), the brief (the business fields, the fact sheet whose records each carry a `sourceId`,
and the brief photos with their labels) and these rules.

## 1. The brief decides what the site has; the template only gives layout

- The template is a set of layouts: pages, sections, card rows, picture frames, buttons. It is not a list of things the
  business has. A team section, a price table or a testimonial row exists on the site only when the brief can fill it.
- Never change a layout. Keep, hide, or fill what the template has; never invent a new section or a new layout.

## 2. Facts come only from the brief

A business fact is placed on the site only when the brief states it. The approved definition (COO, 30/10/2026):

- Only these are business facts: prices and money; a phone; an email; a web address; a street address; dates, years
  and opening hours; the names of people or partners; counts about this business (members, courts, years in business,
  coaches...); awards, certifications, rankings and guarantees.
- Trade knowledge with numbers is NOT a fact about the business ("padel is played 2 vs 2", "24/7", "1-on-1", "a
  60-minute session" as a generic format) unless it is phrased as this business's own offer with a price or a schedule.
- The system checks every fact against the whole brief, not your citations: a fact the brief states anywhere passes, a
  fact it does not state is refused. Explanatory copy written from what the trade generally involves needs no source.

## 3. One decision for every element; code fills the defaults

Every element of the site gets exactly one decision, but you are sent and decide only the real choices: every page, the
sections you hide, every card row on a kept page (its count and items), the brief photos and the picture slots they fill,
and a picture or record page only where you differ from its default. Code fills every other decision before the check,
and the check reads the whole plan: a section you do not list is kept; what a section holds follows it; a picture shows
the photo you place in it, else a drawing of its record, page and copy; an icon follows its item's meaning; a button or
link takes its mapped action when the brief has it, else it is hidden; menus list the kept pages; the writing order is put
in dependency order. An element on no page of the template is not in the plan at all. An element needs no decision of
its own when the plan already takes it off: its section is hidden, every page its section is on is dropped, its card row
is hidden, or its card is past the row's count. Scope rules per kind (the defaults follow the same rules):

- **page**: `keep`, `drop` (with a reason) or `add`. Drop the template's showcase and demo pages (`showcase: true`) and
  any page the brief has nothing for. Keep a home page and a contact page.
- **section**: `keep`, or `hide` with a reason.
- **cards** (a row of repeated cards): `keep` with a `count` no higher than its `capacity`, and the `items` (names of the
  brief records) the cards show; or `hide` with a reason. Every card shows a record of the brief; never a card the brief
  cannot fill.
- **picture**: `keep` with `picture: {photo: "<brief photo id>"}` or `picture: {draw: "<what the drawing shows>"}`, or
  `hide` when the layout survives without it. A drawing describes the record, page and copy it stands beside.
- **icon**: `keep` with `icon: "<the item meaning>"`, or `icon: "neutral"` when nothing matches; one neutral icon for a
  whole row when no item has a meaning of its own.
- **button** and **link**: `keep` with `action: {kind, target}`, where kind is `page` (target: a kept or added page id),
  `call` or `whatsapp` (a phone the brief states), `email` (an email the brief states), `booking` (a booking address the
  brief states), `map`, `item` (the item its card shows) or `control` (acts on its own page: a modal close, a form
  send); or `hide` when the brief gives no real action.
- **menu** and **footer-column**: `keep` with `items` (the page ids it lists, kept or added pages only), or `hide`.
- **contact-block**: `keep` when the brief has a phone, email or address; else `hide`.
- **cta-band**: `keep` when its button has a real action; else `hide`.
- **record-page**: `keep` (the record pages are written from the brief's records) or `hide`.

## 4. Hide what the brief cannot fill, and say why

A section, card row, picture or button the brief cannot fill is hidden, with a short reason a person can read ("the brief
names no team members"). It is never invented and never left with demo content. Hide only where the grid survives it;
otherwise fill it with explanatory copy of the trade, which needs no source.

## 5. Add pages only by copying a template page layout

When the brief lists more offerings than the template has sample pages, add a page with `decision: "add"`, a new id
(`page:added-<slug>`), and `copies`: the id of the template page or record page whose layout it uses. Never add a page
without a layout to copy.

## 6. A shared glossary for repeated items

Every item named on more than one page (an offering, a person, a programme) has one glossary entry: its canonical `name`,
its `kind`, and one short `description`. Every page uses that name and description unchanged, so an offering reads the
same on the home page, the offerings page and its own page.

## 7. Writing order: the summarised before the summary

Each page names the pages it depends on (`dependsOn`): a page that summarises other pages (the home page, an overview of
offerings) depends on them and is written after them. `writingOrder` lists every kept or added page once, each after the
pages it depends on, with no cycle.

## 8. Every brief photo is decided

Every brief photo gets exactly one decision: `use` with the picture slot ids it fills, or `skip` with a reason (blurry,
too small, wrong subject, another business, text or a watermark on it, a duplicate, no slot fits). A photo whose labels
already refuse it (`verdict: "reject"`) is never used. Use the business's own photos first; draw only where no photo fits.
Name a photo only by an id of `ids.photos` and a picture slot only by an id of `ids.pictureSlots`, copied exactly; an id
that is not listed is refused, and a picture slot of a text slot's number does not exist.

## 9. Two out-of-scope lists

- `outOfScope.template`: every template element the site does not use, each with its reason (the answer to "why is this
  section gone").
- `outOfScope.brief`: every brief record the site does not show, by `sourceId`, each with its reason (the answer to "why
  is X not on my site").

## 10. Per page

Each kept or added page carries its `purpose`, its `lead` (one sentence: what the page leads with), the `facts` it
carries (short phrases of brief facts), the `items` it names, and its `seo` intent (what a searcher looking for this page
wants).
