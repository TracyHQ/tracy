---
description: What the draft write step holds a plan to before any door is called. Covers the one unit of every text limit and the door's own count, every guard, where markup is caught and by whom, who escapes a plain value at each kind of place, and the skip reasons and unproven flags of a plan.
sources:
  - packages/wo/website-opportunities/domain/draft-write-guards.mjs
  - packages/wo/website-opportunities/domain/draft-write-library-check.mjs
  - packages/wo/website-opportunities/domain/draft-write-markup.mjs
  - packages/wo/website-opportunities/domain/draft-write-tags.mjs
  - packages/wo/website-opportunities/domain/draft-write-length.mjs
  - packages/wo/website-opportunities/domain/draft-write-door-length.mjs
  - packages/wo/website-opportunities/domain/draft-write-place-kinds.mjs
  - packages/wo/website-opportunities/domain/draft-write-entities.mjs
  - packages/wo/website-opportunities/domain/draft-write-held.mjs
  - packages/wo/website-opportunities/domain/page-copy-check.mjs
  - packages/wo/website-opportunities/domain/write-order-check-entries.mjs
---

# The guards of the draft write

The write step ([draft-write-step.md](draft-write-step.md)) holds its plan to every rule below before any door is
called. A guard that fails stops the build (noRerun): the same plan would fail the same way. A rule a rewrite can fix is
therefore caught earlier, by the page writer's copy check, where the writer still rewrites the field.

## Text limits: one unit, and the door's own count

Every limit counts what a visitor reads, in code points (`visibleLength`, `draft-write-length.mjs`): an inline tag or
marker that only styles words is nothing, any other tag (`br`, `p`) one space, an entity the character it shows, a run
of ASCII white space or no-break spaces one space, no space at either end, NFC. The writer check (`charCount` of
`page-copy-check.mjs` is this function), the plan limits, the order check and the write guard all count it, so a value
the writer and the order check let through is never refused at the guard for its length. Code points, not grapheme
clusters: a flag shows as one glyph but the door counts two, and the kit's limits were measured in code points.

The guard also holds a contract slot to its `maxCharacters` as the plugin's door counts it (`doorLength`,
`draft-write-door-length.mjs`, `unit: 'door'`), which is the plugin's PHP (`SlotFit::slotLength`) step for step: its
tag patterns have no `/u` flag, so a tag with a no-break space after its name is words to it; `html_entity_decode` with
`ENT_QUOTES | ENT_HTML5` reads a reference only with its semicolon, a name only from the HTML5 list
(`draft-write-entity-table.mjs`, the WHATWG list, which PHP's table equals name for name), a number only when HTML5
allows the character (not NUL, CR, DEL, a C1 control, a surrogate, a noncharacter); its white space pattern has `/u`,
so an em space or an ideographic space folds; its `trim` leaves a byte order mark. A text slot stored in a fixed width
column (`title`, `name`, `alias`, `label`, ...), a link or a picture path counts its raw value. Measured: the same
count as the PHP of plugin 0.24.85 on 400 generated strings and 17 hand picked ones
(`test/fixtures/draft-write-door-length.json`, `domain-draft-write-door-length.test.mjs`). Only the guard knows the
slots, so only it can refuse that (the memory site refuses by the same count).

Still counted in UTF-16 units elsewhere in the domain (other owners, not changed here): `plan-data.mjs`,
`pinned-copy.mjs`, `site-answers.mjs`, `neutral-signature.mjs`, `fact-value-kinds.mjs`, `brief.mjs`,
`ai-quickstart-labels.mjs`, `place-profile.mjs`, `demo-request.mjs`.

## Guards (before any door, `draft-write-guards.mjs`, all noRerun)

| Code | Caught when |
|---|---|
| `text_over_limit` | a value is longer than its field limit (`unit: 'visible'`), or than its contract slot's `maxCharacters` as the door counts it (`unit: 'door'`); see "Text limits: one unit, and the door's own count" |
| `straight_quote_in_open_slot` | a straight double quote goes to a contract slot that opens empty |
| `empty_text_node` | an empty value is sent to a text node (the write sends one space instead) |
| `markup_forbidden` | a tag is sent through the contract, the map's codes are sent to an HTML place, a tag is sent to a codes place, a plain text column (a record title or alias, a `title`, `name`, `alias`, `label`, `metadesc` column, a page title or search description key) holds a tag, a comment or any `<!`, `<?`, `</` form (`tag_in_plain_column`), or a field holds markup it does not declare (`field_inline`, `markupNotDeclared`). The order check catches the field cases first and stops the build there; for a value the writer wrote, the copy check catches them before that and the writer rewrites it (see "Where markup is caught") |
| `markup_runs_code` | a value written as HTML (an HTML piece, a value with a tag or a marker start, a created record's HTML) holds a code element (`script`, `iframe`, `style`, `svg` and the like) or a raw text element (`title`, `textarea`, `xmp`, ...), an `on*` handler, a code address in an address attribute (`href`, `src`, `action`, ...) or a style that runs code, in a tag or a marker, in any case, whatever entities, slashes, quotes or white space hide it; markup inside an attribute value; a comment or any other `<!`, `<?`, `</` form (`markup_unread`); a marker start no marker reads (`marker_unread`); a tag, a marker or a quote left open, a closing tag that closes nothing or the wrong element (`markup_unbalanced`); or a value written where an address is written (a link field, a link or picture slot, an address attribute piece, a record's link) is an address that runs code (`javascript:`, `vbscript:`, `data:` other than a picture). Words are never read as an address: `Data: we keep only what you send` passes (`draft-write-markup.mjs`) |
| `slot_missing` | a contract value with no slot, or a slot the blank site contract does not have |
| `icon_not_in_list` | a network class is missing from `networkIconClasses`, or an image icon is missing from the icon library (`iconKeys`; with no library wired, none is in it) |
| `picture_without_alt` | a shown picture has no alt text |
| `picture_web_address_only`, `picture_not_stored` | a picture has no stored bytes (an initials picture is drawn instead) |
| `held_text_in_value` | a held name or person, in any form, is in a value, an alt text, a record column (title, alias, link) or a library block's HTML (`heldInLeaf(text, heldTexts)` of `draft-write-held.mjs`: entities read until the text stops changing, percent escapes read, `+` as a space, then as a person reads it with `plainOf`: accents and zero width characters out, white space as one space, tags read as a space or as nothing; whole words or slug form). Not caught: look-alike letters of another script, another word order, initials |
| `block_not_approved` | a block is not placed by the approved plan |
| `pair_incomplete` | one half of a button, or one version of an icon, is written without the other (block or item fields) |
| `library_html_stale` | a library block's HTML does not show a shown field of the order (the heading, the label, the listing address escaped, each review's text, its reviewer as the block names them, its stars), or is empty |
| `library_html_unsafe` | a library block's HTML holds anything `runsCodeIn` refuses (`rules` lists them): it is read by the same reader as every other value written as HTML |

## Where markup is caught

| Value | Caught by | Outcome |
|---|---|---|
| written by the writer, with a `<`, a `>` or a marker start (`((` and a letter: `f((x))`, `((free))`) | the copy check (`fieldValueProblems`: `markup`, `angle_bracket`, `template_code`) | the writer rewrites the field |
| from the plan data (a business name, an answer) with markup its field does not declare | the order check (`markupNotDeclared`) | the build stops (`order_invalid`) |
| a record column, a library block's HTML, a value the plan built | the write guard | the build stops |

Every value the order check refuses for its markup the copy check refuses first, whatever the field declares
(`domain-copy-markup-first.test.mjs`, a table and 5000 generated strings). A `((` or `))` that starts no marker is words
everywhere (`Open (weekdays (9 to 5))`, `See you soon ((:`): the template's converter reads a marker only as `((`, an
optional `/`, a letter, then no parenthesis up to `))` (`fromMarkers` of the quickstart scripts and of the memory site).
What the template's own converter does with an unknown marker (`((free))`) is not measured, so a marker start in words
stays refused, as a rewrite.

## Who escapes a plain value

| Place | Who | Evidence |
|---|---|---|
| a text node or an attribute piece of a stored HTML value (an xpath) | the piece functions: the plugin's `ContentSlots::htmlPatch` sets the node through the DOM; the memory site's `memoryHtml.set` writes `&quot;` in an attribute | `apps/tracy-web/test/draft-write-quote-inert.test.mjs` |
| a whole HTML column written on a copy or a created record (`inline.write: "html"`) | the plan (`escapeHtml` of `draft-write-values.mjs`) | same test |
| a column through the contract (an HTML column in place: `<` and `>` are refused by the door) | nobody: a quote stays a quote in text, where it opens nothing | not in that test: the florist's writer fields reach no contract text slot |
| a codes place (an ACM block's data) | nobody in the write: the template prints it | not measured: whether the template escapes a value it prints inside an attribute |
| a plain column (`title`, `alias`) | nobody in the write: Joomla escapes it where it prints it | not measured here |

## Skip reasons (in `plan.skipped`)

| Reason | Why |
|---|---|
| `left_empty`, `template_fallback`, `place_fallback`, `place_<state>`, `block_hidden` | the order leaves the place empty, to the template, or not shown |
| `no_candidate_icon`, `gallery_own_photos_only`, `no_fitting_video`, `no_generated_people` | the order's own reason for a picture or icon it does not fill |
| `address_shared` | another entry already writes the same words at that place (other words: a conflict, see the plan) |
| `menu_item_is_page_item` | a menu block on the main menu: its items are the page items |
| `menu_item_without_page`, `menu_item_without_label`, `menu_item_title` | a menu item with no page to link to; one with a page but no label; a menu item title, written by the page |
| `derived_drawn_by_template` | a derived value the template draws itself |
| `fact_fanned_out`, `fact_place_missing`, `fact_place_not_on_site`, `text_logo_prints_site_name` | a fact written once at its own place, or with no place on the site |
| `no_mapping_entry`, `location_unresolved`, `entity_not_declared`, `kept_record_without_slot` | the mapping gives no place the write can reach (`kept_record_without_slot`: a location of a record written in place, its own block's or another's, with no contract slot). A skipped half of a button stops the plan as `pair_incomplete` |
| `held_block_not_placed`, `foreign_copy_not_placed` | the block holding the place is not placed |
| `seo_derived_by_template`, `seo_record_not_declared` | the page's search title and description |
| `accent_variables_not_declared`, `accent_door_missing` | the accent is not written |

## Unproven (flags in `plan.unproven`; the run copies them to its report)

| Code | Why |
|---|---|
| `accent_variables_not_declared` | the mapping declares no accent colour variables, so the accent is not written |
| `accent_door_missing` | the variables exist but no door writes them |
| `identity_field_no_door` | an identity field (`fromname`) that `site.identity` neither reads nor writes: not sent |
| `menu_item_link_not_declared` | the contract gives no menu link per page type: a list or plans page gets the featured view |
| `featured_article_needed` | the home page's featured view needs a featured article, which the build does not make |
| `created_record_frame` | a created article has no frame from the blank site: its HTML pieces go into the smallest frame that holds them (`draft-write-frame.mjs`); the template's own skeleton, `attribs` layout and `template_style_id` are not known |
| `article_category_not_declared`, `seo_record_not_declared` | the contract does not say which category an article goes in, or which record holds a page's search texts |
| `control_shared_by_items`, `omit_row_gap`, `omit_on_record_in_place` | see Hides in [draft-write-step.md](draft-write-step.md) |
| `row_form_keys`, `recipe_ordering` | not measured on a real site (contract point 7) |
| `initials_drawn_as_figure` | the drawer has strokes for A to Z only: a name in another script is drawn as a neutral figure, and the JA Boxing frames have no text slot for the letters |

