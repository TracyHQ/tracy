# Content coverage holes on WordPress

The fix of `coverage-holes` and its family, as the Joomla run does it (`quickstart-contract` section 7 step 7 and
section 7b, the accept reasons of the Joomla contracts), translated to a WordPress block theme. Worked out on JA Diner
WP7 1.0.2 (TracyHQ/tracy#459): 580 blocking holes on the first measure.

## 1. Measure, then read every hole

The registry's measure (`content-coverage/cli.mjs`, see the words of [`fix-map.md`](fix-map.md)) with `--db-dump` and
`--webroot` of the version being cut. A re-read of the same crawl after a tool or accept change needs no browser:
`--reclassify --out <a copy of the last out dir>`. Group the holes of `content-coverage.json` by `class`, `cause` and
`evidence`; `evidence` names the row (`posts#63.post_content`, `options#106.option_value`) or the theme file.

## 2. What the tool already settles

- A size WordPress generated from an upload (`cake-300x200.jpg` in `srcset`, `-scaled`) is matched to the picture slot
  of its attachment.
- A picture no slot names is resolved through `_wp_attached_file` to its attachment, and the row that prints it by id
  is named (`options#… site_logo`, `postmeta#… <theme meta key> (post N)`, `posts#….post_content`). It is class
  `capture`, never `unknown`.

## 3. Where each WordPress hole goes

The Claude Cowork WordPress plugin addresses a block by its `metadata.name` only (`QuickstartContract::findBlock`),
writes a slot as plain text (markup is escaped), reads a page's or post's `post_title` / `post_excerpt`, and reads one
post meta, `_thumbnail_id`. From 0.18.39 it also writes a text slot with `markup: "inline"` as inline markup (a fixed
allowlist: `span[class]`, `strong`, `em`, `b`, `i`, `br`, `a[href|class|target|rel]`, `sup`, `sub`; classes held to the
slot's demo; then `wp_kses`), and reads and writes the pictures the manifest declares in `themePictures` (options with
the theme's own prefix, post meta keys not starting with `_`), each holding an attachment id. Nothing else is a door. `capture-contract.mjs --all-text` makes slots addressed by
position (`blockType` + `occurrence`): the plugin cannot bind them, so never ship a profile with them.

| What the evidence shows | Door | Fix |
|---|---|---|
| A page's title (document title `"<title> -"`) | page `post_title` | capture with `--page-titles` |
| A post's title, excerpt, featured picture | post fields, `_thumbnail_id` | capture with `--posts` |
| A plain-text block with no name, or the second block of a name, in a page, post or template part | `metadata.name` | name the block in the theme pattern (overlay `patterns/`) and in the demo content of the next cut, then capture again |
| An image block with no name | `metadata.name` | as above; `capture-image-slots.mjs` makes the slot |
| Text with inline markup in one NAMED block: a price `<span>`, a highlight `<span>`, a link inside a paragraph, `<br>` lines | `markup: "inline"` (plugin 0.18.39) | capture with `--inline-markup`: the sample is the inner HTML in the notation (`((span class="price"))$56((/span))`), the limit counts the words |
| The same in a block with no name (every one on JA Diner WP7 1.0.2: dish names with their price, `btn` links in paragraphs, footer contact lines) | `metadata.name` + `markup: "inline"` | name the block in the theme pattern and the demo content of the next cut, then capture with `--inline-markup` |
| Inline markup the plugin does not write (`small`, `mark`, a `style` attribute, a bare `#` link) | none | accept when it is a style guide sample; otherwise a theme change to the allowed tags; the capture says which tag or attribute (`inline markup the plugin cannot write: …`) |
| A picture a theme option or a theme post meta points at by attachment id (`<theme>_blog_banner_image`, a list thumbnail meta) | `manifest.themePictures` (plugin 0.18.39) | capture with `--theme-picture-options <options>` and `--theme-picture-meta <keys>` (each option becomes an entity), then `capture-image-slots.mjs` makes their image slots; on JA Diner WP7: `wp_ja_diner_blog_banner_image`, `wp_ja_diner_categories_banner_image`, `jd_intro_image` |
| A navigation label kept in a `wp_navigation` post, a category or tag name | none yet | stop W5: plugin follow-up (navigation labels are attributes of self-closing `navigation-link` blocks with no name, in a row the showcase navigation map rewrites; terms need a new entity kind) |
| A `core/html` block | none, on purpose: arbitrary HTML is never made writable | accept with the reason (what the block holds, why a customer does not need to change it), or a design change that rebuilds it from named blocks. A fact inside it (a phone) is not accepted: put an identity token in its place (row below). Rebuilding a styled band from core blocks changed its height and dark scheme on JA Diner (12 height groups), so prefer the token |
| Business words hard-coded in a theme pattern (`class: template`: an address, a phone, a price) | the page content | theme release: the pattern prints them from named blocks of the page |
| A business phone, address or email printed by a theme pattern or template part (`class: template`, or a `core/html` block) | `manifest.themeTexts` (plugin 0.18.40) | the theme reads them from options with its own prefix (`wp_<theme>_contact_phone`) and prints them through its identity tokens (`{contact.phone}`) with no demo words in a theme file; the quickstart database seeds the demo values; capture with `--theme-text-options <options>`. Never accept this: R9 cannot be lifted by an accept |
| Named blocks in a template part (the footer's location, hours and contact lines) | `templatePart` entity (identity `{slug}`, lock = skeleton only) | capture with `--template-parts <slug,...>` once the blocks carry `metadata.name` in the part |
| Interface words of the theme (`class: template`: pagination, read more, form labels, buttons, accessible names) | none needed | accept: interface string of the theme's text domain |
| WordPress core words (paged document titles, submenu toggles, the default widgets) | none needed | accept with the core source |
| A style guide page (typography) or a template showcase page (404, offline, search screen, colour variants of the home page) whose links `showcase-nav-map.json` removes | none needed | accept, naming the page |
| The site logo (`site_logo`) | the template kit's logo spot | accept: the brand step writes it |

An accept is `"accepted": "<reason, English, at least 12 characters>"` on exactly that row of `content-coverage.json`,
written only when certain it is not business words a customer reads. The next measure keeps it (`holeKey`: kind and
value). Write the accepts with a small script of rules over `class`, `kind`, `value`, `evidence` and `firstPage`, kept
in `$RUN`, so a re-measure and its accepts stay one step.

## 4. Class `unknown`

Never handed back: read the evidence yourself. Open the page in `report.html`, find the words in the page's markup in
the dump (`post_content`) or the theme, and put each group into a row of the table above. On JA Diner WP7 every
`unknown` text was either a remainder of a block with inline markup (a price span split "Baked Squid" from "$56", a
highlight span cut a heading in two), a form label with its required mark, a core accessible name, or a style guide
sample. Record the classification in `$RUN/fix-log.md`; the class in the file only changes when the tool learns the
rule (test first).

## 5. Label rules and the label judge

- **R5** (a cut-out or decoration picture on a fact role, or without a person, quote or business role): a design
  cut-out stays in R5 until the label judge sees it and says right; a picture in the wrong role is relabelled in the
  content map.
- **R9** (fact-like hole, such as a price): follows the hole; it is 0 once the price is a slot.
- **The label judge** is the agent, no model call: answer `label-judge/request.json` of the measure out dir and record
  it with `record-judge.mjs` (`quickstart-contract` section 7 step 7). Judge on the **final** capture: verdicts are
  cached per slot hash, so a slot whose sample changes is asked again.

Every content map change (names, `--page-titles`, relabels) is a contract change: procedure W1.

## 6. Recipes by symptom

Each recipe is theme-neutral; JA Diner WP7 1.0.2 (TracyHQ/tracy#459) is only the example. Entry point: the red state
code of the verdict (`coverage-holes`, `coverage-labels`, `coverage-judge`) or a red check of the release sweep. Every
recipe ends in "verify": nothing a customer sees may move, and no demo business data may stay in a place the plugin
writes. `scripts/test/hole-recipes.test.mjs` holds each detection to a deliberately broken fixture and holds this page
to the same list.

| Recipe | Symptom | Red state / check |
|---|---|---|
| H1 | Business words (phone, address, email, website) hard-coded in a theme pattern or part | `coverage-labels` R9, `coverage-holes` class `template` |
| H2 | A fact inside a `core/html` block (a styled band: a phone in a reservation promotion) | `coverage-labels` R9, hole class `unknown` |
| H3 | A menu or price list item whose name carries its price in one inline-markup block | `coverage-labels` R2 (priced sample without a price role) |
| H4 | Cut-out or design pictures on an editorial role | `coverage-labels` R5, then `coverage-judge` |
| H5 | Words in a template part (footer location, hours, contact lines) with no write door | `coverage-holes` class `capture`, evidence a `wp_template_part` row |
| H6 | A style guide page whose samples read as facts (a sample address and phone) | `coverage-labels` R9 |
| H7 | Visible text in an unnamed block, or markup the capture skips | `coverage-holes` class `capture` or `unknown` |
| H8 | A markup change that moves heights (a rebuilt band, a longer text) | release sweep, check `heights` (also `scheme`), `patch-release.md` |
| H9 | A link (an address) inside an inline markup slot | `coverage-holes`, hole kind `link` |
| H10 | A page or post title | `coverage-holes`, evidence `….post_title` |
| H11 | A picture a theme option or theme post meta points at | `coverage-holes`, hole kind `image`, evidence an `options#` or `postmeta#` row |

### H1. Business words hard-coded in a theme pattern or part

- **Confirm.** The hole has class `template` and `evidence` names a file under the theme's `patterns/`, `parts/` or
  `templates/`; its value is a phone, an address, an email or a website. A customer cannot change a theme file.
- **Fix.** Move the words to theme text options: names with the theme's own prefix (`wp_<theme>_contact_phone`), kept
  by a small reader in the theme that returns `''` for an unset option and holds no default, and printed in the pattern
  through it or through an identity token (`{contact.phone}`) that the theme's token filler replaces in paragraphs and
  Custom HTML blocks. The quickstart database seeds each option with the demo words (a default left in a theme file
  keeps the hole open). Declare them at capture with `--theme-text-options a,b,c`: `manifest.themeTexts`, an option
  entity and one text slot each, which the Claude Cowork plugin (0.18.40 or later) reads and writes; then give each slot
  a contact role and a group (`contact.phone`, `contact.address`, `contact.email`). Seed values exactly as the markup
  printed them, including non-breaking spaces.
- **Verify.** The rendered page is byte identical to before (diff the HTML of the page before and after); the next
  release sweep shows no `heights` or `text` group on that page; measure again: the hole is gone and the slot is covered.

### H2. A fact inside a `core/html` block

- **Confirm.** The hole is class `unknown`, its page shows the words, and the page's markup holds them inside a
  `wp:html` block. A rebuild of the band from core blocks is the tempting fix: on JA Diner it added 12 height groups and
  3 dark scheme defects, so do not.
- **Fix.** Keep the block and its wrapper markup exactly; replace only the text node with an identity token
  (`{contact.phone}`) and give the token a theme text option as in H1. The token filler runs on `core/html` output.
  Seed the option with the demo value **of that spot**: a value longer than the original wraps a heading at narrow
  widths (JA Diner: `(084) 555-0110` for `413-305-7497` moved the band at 320 and 390 px). One business has one phone,
  so two spots that showed two demo values show one after this fix; keep the value that fits both.
- **Verify.** As H1, and the sweep has no group for that page's band.

### H3. A priced item name in one inline-markup block

- **Confirm.** R2 names a slot whose sample reads `Name ((span class="price"))$30((/span))`.
- **Fix.** Capture with `--inline-markup`; name the block in the pattern and the demo content; give the slot the
  `offering.name` role in a `menu_item` group. The label rules accept a price inside an inline-markup slot of a name
  role (`offering.name`, `package.name`): the role is a fact role, so a build never keeps the demo's words and the
  price goes with the name. A name with a price inside a plain text slot still fails R2: make it inline-markup.
- **Verify.** R2 is 0; the plugin writes the slot back with the price span intact (`inline-markup.mjs` mirrors its
  allowlist, a class outside the slot's demo classes is refused).

### H4. Cut-out pictures on an editorial role

- **Confirm.** R5 lists picture slots (a plate cut out of its photo, a brush stroke).
- **Fix.** Read the crop of each (`label-judge/images/`) yourself: right as `editorial.illustration` or
  `editorial.design_element` is recorded with `record-judge.mjs`; a person, quote or business picture gets its role in
  the content map through the **role hints file** of the template
  (`packages/cms/tracy-wordpress-quickstart/role-hints/<design>-wp<major>.json`, `{key, role, group?, why}` per slot,
  passed as `--role-hints` to `capture-contract` and `capture-image-slots`, so every recapture produces the role again;
  a plated dish: `offering.image`; a staff member or chef: `person.image`; both are empty on a customer site until the
  customer adds their own). No model call, no edit of the map after the capture.
- **Verify.** R5 is 0 after the judge is recorded on the **final** capture; a changed slot is asked again.

### H5. Words in a template part

- **Confirm.** Hole evidence names a `wp_template_part` row (`posts#97.post_content`); the plugin reads pages, posts
  and options, and a `templatePart` entity (identity `{slug}`, lock = skeleton) from 0.18.x.
- **Fix.** Give each text block of the part a `metadata.name` in the overlay part file and the demo database, then
  capture with `--template-parts footer,header` (every part that prints words; `--template-parts` alone captures
  nothing); the inventory locks the part by its skeleton. Business words in the part follow H1. A part holding inline
  markup follows H3 as well.
- **Verify.** The part has slots in `content-map.json`; the part's rendered HTML is unchanged.

### H6. A style guide page that reads as facts

- **Confirm.** R9 names samples on the typography (style guide) page: a sample address with a phone number.
- **Fix.** The page is demo-only and a customer never writes it, but R9 cannot be accepted. Change the samples so no
  phone, address, email or price pattern is left, keeping the same length (`Folsom Avenue 795`, `(123) 456 789`).
- **Verify.** R9 is 0. Record the change as a decision in the port's dossier: the sweep reports the sample as changed
  text against the source.

### H7. Visible text with no door

- **Confirm.** Capture holes on blocks without a name, or text the capture skipped (`coverage.skipped` in the capture
  output: a second block of a name, markup the plugin does not write).
- **Fix.** Name the block (`metadata.name`) in the pattern and the demo content; make names unique per page (a
  repeated section gets `menu-2.*`); inline markup follows H3. Never ship `--all-text` slots. Blocks of a style
  guide (typography) page that stay unnamed are a hole too: name them, or accept them as H6 does when no customer
  writes that page.
- **Verify.** Measure again; skipped list empty or each entry accepted with a reason.

### H8. A markup change that moves heights

- **Confirm.** The release sweep (`patch-release.md`) fails `heights` or `scheme` with groups on the page you changed
  and none in the baseline; read the group's `culprit` and `detail`.
- **Fix.** Revert to the exact wrapper markup of the baseline and change only text; if the text is longer than the
  original, use an original-length value or accept the group with a written decision (only for a difference nobody
  sees). A group that changes width to width between runs on a page you did not touch is a flaky measure of the
  source, not your change: compare two runs before accepting it.
- **Verify.** Sweep again: all eleven checks pass.

### H9. A link inside an inline markup slot

- **Confirm.** Hole kind `link` whose page text sits in a block with inline markup (a button link inside a paragraph,
  a link in a heading).
- **Fix.** Name the block and capture with `--inline-markup`: the address held in the slot's notation
  (`((a href="/menu/"))…((/a))`) is the slot's address, so the link is covered by it; a bare `#` link or a tag the
  plugin does not write is not (accept it only for a style guide or showcase page).
- **Verify.** The link hole is gone, the rendered HTML of the page is unchanged, no `heights` group.

### H10. A page or post title

- **Confirm.** Hole evidence ends in `.post_title` (document title `"<title> -"`).
- **Fix.** Capture with `--page-titles` (every page entity gets a `post_title` slot) and `--posts` for posts. A menu
  label equal to a page title then matches by text, but the label really comes from `wp_navigation`: do not count it.
  Adding a slot to a released profile is a new profile version (W2/W4).
- **Verify.** The title holes are slots; the page's `<title>` renders as before.

### H11. A picture a theme option or post meta points at

- **Confirm.** Hole kind `image`, evidence an `options#… <theme prefix>_…` or `postmeta#… <meta key> (post N)` row,
  never `unknown`.
- **Fix.** Capture with `--theme-picture-options <options>` and `--theme-picture-meta <keys>` (own prefix, no leading
  underscore), then `capture-image-slots.mjs` makes the image slots; the plugin (0.18.39 or later) writes them.
  A picture the theme prints from a fixed asset file is not a hole of this kind: the theme must read an option first.
- **Verify.** The image holes are slots; the page renders the same picture; no `heights` group.

### H12. Sample posts of a style guide that carry contact-shaped text

- **Confirm.** R9 names text of a style guide or typography sample post (an address block with a phone number, a
  card with a name and an email). A customer never edits it, but R9 cannot be lifted by an accept.
- **Fix.** Replace the sample contents with plain role labels that carry no business data, keeping the same markup
  elements (`address`, `strong`, `abbr`, a link) so the style guide still shows the styles: `Company name / Street
  address / City / Phone number`, `Full name / Phone number / Email address`. Do not wrap the samples in a code block
  and do not shorten them to a pattern that still looks like a number: a code block hides demo contact text from the
  check while a visitor still sees it. Change the text in the demo database, pack again, and record the change as a
  decision in the dossier (the sweep reports the sample as changed text).
- **Verify.** R9 is 0 on the next measure; the rendered style guide keeps the same elements.

### H13. An hours or schedule sample on a plain editorial role

- **Confirm.** R2 names a slot whose sample is an hours or schedule line (`Mon to Thu 12 Noon to 11 PM`) on
  `editorial.paragraph`.
- **Fix.** The rule `scripts/slot-roles/rule-tables-hours.mjs` gives the slot the role of the card it sits in
  (`event.date_or_year`, `offering.schedule`) or `contact.hours` when it sits in none, and a group. A sample the rule
  cannot place goes in the role hints file (H4). The slot stays writable and reads empty on a customer site until it is filled. A blanket
  accept would leave the demo hours in place.
- **Verify.** R2 is 0; the slot has a role and a group.
