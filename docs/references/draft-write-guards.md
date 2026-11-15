---
description: What the draft write step holds a plan to before any door is called. Covers the one unit of every text limit and the door's own count, every guard, where markup and double parentheses are caught and by whom, how each value is made safe as raw HTML at its kind of place, the kit build declarations the plan reads and the typed stops for the ones it cannot follow, and the skip reasons and unproven flags of a plan.
sources:
  - packages/wo/website-opportunities/domain/draft-write-guards.mjs
  - packages/wo/website-opportunities/domain/draft-write-escape.mjs
  - packages/wo/website-opportunities/domain/draft-write-place-guard.mjs
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
  - packages/wo/website-opportunities/domain/draft-write-kit-pages.mjs
  - packages/wo/website-opportunities/domain/draft-write-kit-build.mjs
  - packages/wo/website-opportunities/domain/draft-write-kit-keys.mjs
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
| `value_not_escaped` | words not safe at their kind of place as the kit declares it (`via`: `not_escaped`, `not_escape_neutral`, `unsafe_mark`, `not_a_token`); see "Every value safe where it prints" |
| `record_name_empty` | a contact created with an empty or blank name: the site writes it (measured), so the build refuses it. A contact with no name value (no block brought the business name in) is named after its own page (`draft-write-plan-names.mjs`); only with neither is it refused |
| `markup_forbidden` | a tag is sent through the contract, a `((` or `))` anywhere outside the declared markers of a codes field (`double_parenthesis`), declared markers left open (`markers_unbalanced`) or whose converted form runs code (`markers_run_code`), a tag is sent to a codes place, a plain text column (a record title or alias, a `title`, `name`, `alias`, `label`, `metadesc` column, a page title or search description key) holds a tag, a comment or any `<!`, `<?`, `</` form (`tag_in_plain_column`), or a field holds markup it does not declare (`field_inline`, `markupNotDeclared`). The order check catches the field cases first and stops the build there; for a value the writer wrote, the copy check catches them before that and the writer rewrites it (see "Where markup is caught") |
| `markup_runs_code` | a value written as HTML (an HTML piece, a value with a tag or a double parenthesis, a created record's HTML) holds a code element (`script`, `iframe`, `style`, `svg` and the like) or a raw text element (`title`, `textarea`, `xmp`, ...), an `on*` handler, a code address in an address attribute (`href`, `src`, `action`, ...) or a style that runs code, in a tag or a marker, in any case, whatever entities, slashes, quotes or white space hide it; markup inside an attribute value; a comment or any other `<!`, `<?`, `</` form (`markup_unread`); a `((` or `))` no marker reads (`marker_unread`); a tag, a marker or a quote left open, a closing tag that closes nothing or the wrong element (`markup_unbalanced`); or a value written where an address is written (a link field, a link or picture slot, an address attribute piece, a record's link) is an address that runs code (`javascript:`, `vbscript:`, `data:` other than a picture). Words are never read as an address: `Data: we keep only what you send` passes (`draft-write-markup.mjs`) |
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
| written by the writer, with a `<`, a `>`, any `((` or `))`, or a character reference (`&amp;`) | the copy check (`fieldValueProblems`: `markup`, `angle_bracket`, `template_code`, `character_reference`) | the writer rewrites the field |
| from the plan data (a business name, an answer) with markup or a double parenthesis its field does not declare | the order check (`markupNotDeclared`) | the build stops (`order_invalid`) |
| a record column, a library block's HTML, a value the plan built | the write guard | the build stops |

Every value the order check refuses for its markup the copy check refuses first, whatever the field declares
(`domain-copy-markup-first.test.mjs`, a table and 5000 generated strings).

**A double parenthesis is markup everywhere.** The JA ACM converter is a blind `str_replace` of `((` with `<` and
`))` with `>` over a module's whole `jatools-config` string (measured on plugin 0.24.85: `((script))` prints a real
script element, `Kids (6+)) and ((more` prints `Kids (6+> and <more`). A value the write sends to a JA ACM block's data
is converted wherever it sits (a text, a link, a picture path), and a piece of an HTML value inside that data keeps its
`((` as text, which the converter then turns into a tag. So every `((` and `))` is refused, in any position, with or
without a letter after it (`readTags` counts each one no marker reads as a stray): at the copy check as a rewrite,
at the order check for data, and at the guard. The guard applies it at every place, not only the JA ACM data: outside
it a double parenthesis prints as words (a module title, the section chrome, measured), but nothing is lost by
refusing it there too. This refuses some plain words (`Open (weekdays (9 to 5))`, `See you soon ((:`, `:))`): a false
refusal taken for safety, which the writer redoes with other punctuation. The only exception is a codes field whose
`inline` declares markers (`write: "codes"`, its `wrapper` and `emphasis` tags, such as the `((p))` wrapper `textAt`
adds): there only those marker names pass, well formed and balanced, and the value with every `((` and `))` converted
must pass `runsCodeIn` (`doubleParenthesisProblem`, `draft-write-escape.mjs`).

## Every value safe where it prints (`draft-write-escape-place.mjs`, `draft-write-escape.mjs`)

The kit declares how every place it writes prints (`mapping.escapes.places`, measured on JA Boxing 1.0.11 with
plugin 0.24.85, [ai-quickstart-contract.md](ai-quickstart-contract.md), "Escaping of every place the build writes").
The write reads it for each value with `escapeOf(mapping, placeOf(mapping, loc))` (`ai-quickstart-escapes.mjs`;
a column of a record the write creates is the place `{kind, column, menutype}`, a contact's `title` its `name`).
After the plan is built, `safeOps` makes every value and created record column safe at its kind of place
(`safetyAt`), and the guard refuses any value that is not (`value_not_escaped`, `place_not_written`,
`draft-write-place-guard.mjs`):

| `escaped` | Kind | Written as | Guard refuses |
|---|---|---|---|
| `false` | raw | escaped as `htmlspecialchars` with ENT_QUOTES (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`); declared markers kept | an unescaped `<`, `>`, quote or `&` |
| `false`, a whole HTML column (`introtext`, `fulltext`, `content`, `misc`) | html | words escaped (`textAt`, `inline_html`), declared tags kept | markup that runs code |
| `false`, an xpath piece | piece | the DOM escapes `&`, `<`, `>`; plain words get typographic quotes | markup that runs code |
| `false`, a module title | neutral | the character, never a reference: the administrator escapes the stored title (measured, "Module titles") | as neutral |
| `false`, a contract slot the door counts raw (`countsRaw`) | neutral | escaping would make the door count more than the writer wrote | as neutral |
| `true` (`metadesc`, `page_title`, `og_*`, a menu item title, a contact's name, block 177's `info-*` keys) | plain | the words as they are; quotes typographic when a quote is in `unsafe` | every mark of `unsafe` and `doorRefuses`, and any text that reads as a reference |
| `"mixed"` (an article title, `images`, a contact's address and phone, the site name) | neutral | escape neutral | `<`, `>`, a straight quote, any text that reads as a reference |
| `"not-printed"` (a created category title) | free | as it is | nothing of its own |
| `"not-text"` (an id, a class, a position) | token | as it is | `<`, `>`, a quote |
| `"not-written"` | unwritten | never | any value (`place_not_written`) |
| no entry, two alike, or no `escapes` | neutral | escape neutral | as neutral: never a guess |

**Escape neutral** means the value reads the same escaped or not, so it is never escaped twice and never left open:
straight quotes become typographic ones (`"` as `“` and `”`, `'` as `’`, or `‘` at a word start), and a `<`, a `>`
or a text that reads as a character reference is refused. An address at a neutral place keeps its quotes, so a quote
there is refused.

**A text that reads as a reference** is `&` followed by `#` or a letter (`&#39;`, `&amp;`, and a legacy name with no
semicolon: `&copy 2026` shows as `© 2026` where it prints raw, measured). The kit's rule
(`escapes.legacyReferences`): it is written only where the build escapes the `&` (raw, html); at a plain or neutral
place it is refused. So is `Q&A` there; at a raw place it is written `Q&amp;A`.

**The JA ACM markers.** Every `((` and `))` is refused at every place outside the declared markers of a codes field
(measured: the converter replaces them blindly in the whole `jatools-config` string).

**Lengths.** The visible count (`visibleLength`) reads entities, so an escaped value counts what the writer wrote;
typographic quotes are one code point each. Where the door counts the raw string, the value is written neutral, so
`doorLength` of what is sent equals the writer's count (`domain-draft-write-escape.test.mjs`).

**What the site then prints** is scanned on the memory site (`draft-write-rendered-output.test.mjs`): every hostile
writer value in every writer field is either refused before any door or printed with no tag, handler, broken attribute
or code address the kit does not declare.

## The kit's build declarations (`draft-write-kit-pages.mjs`, `draft-write-kit-build.mjs`)

The plan reads what the kit declares about the build besides the blocks ([ai-quickstart-contract.md](ai-quickstart-contract.md),
"What the build writes besides the blocks"). Every key of those families is listed with what the write does with it in
`DRAFT_WRITE_KIT_KEYS` (`draft-write-kit-keys.mjs`); a kit key missing there fails
`domain-draft-write-kit-places.test.mjs`. The rule: a declared, measured key is followed; a key the kit has not
measured, or whose meaning the contract leaves open, is never acted on. When the plan needs it, the plan stops typed
(noRerun, before any door); when it does not, the key is not read.

| Key | What the plan does |
|---|---|
| `pages.<type>.menuItem` | the page item takes the declared link (`{record}`, `{category:<type>}`, `{page:<type>}` as references the run fills; `{entity:<key>}` as the kept record's id), template style (0 or a kept style's id), params and parent page item, created after its parent |
| `pages.<type>.under` | an item page whose list page is in the plan has no item of its own: its address is the declared one, its modules are assigned to the list page's item, its main menu entry is skipped (`page_reached_under`), and a cut row keyed to it is cut (`row_page_reached_under`). The plan carries the addresses in `plan.under` |
| `pages.<type>.under.detailPositions` | a module on a page reached under its list page is assigned to the list page's item, so it prints there too except at a declared position (`assignTo: "list-page"`). Outside them (`draft-write-under-blocks.mjs`): every-page blocks are not checked; one record the list page shows anyway (in place or `recipe-pages`) is written as placed; any other block a recipe of the page type places (a variant included) is not written on that page, its entries skipped `under_page_block_on_list_page` and listed in `plan.underNotWritten` (unproven `under_page_block_not_written`); a block no recipe of the page type places, or a library block, stops the plan (`under_page_position_not_detail`). The positions are also the ones `detail_position_not_printed` reads |
| `pages.<type>.ownItem` | the item page's own item when the plan has no list page; a block only in a detail position is flagged `detail_position_not_printed` |
| `pages.<type>.record` | the created article or contact starts from `base` and is filed in the declared category (`extension`, `params`, at the top level). A created article no page shows, listed by a list block, is of the page type reached under that list block's page (`pages.<type>.under.page` and the recipe's main block; a block that lists another block's records, `itemsOf.block`, is that block) |
| `pages.<type>.record.category.title` | `{from: "page-name", pageType, fallback: "business-name"}`: the name of the first plan page of `pageType`, else the business name; another word stops `category_title_unknown`. A kit with no `title` keeps the list page's name |
| `pages.<type>.unbuilt` | stops `page_unbuilt` (with the kit's code): the page is never planned, so never reported written |
| `placements.<id>.keyedRow` | a list row keyed to a page of `pageType` is cut (`row_keyed_to_page_type`): that page takes the keyed row only |
| `placements.<id>.holds.copies` | one container per page; `keptWhen: "any-held-block-kept"`: a container holding none of the page's blocks is dropped (`container_without_held`); another `keptWhen` stops `kept_when_unknown` |
| `placements.<id>.menu.items` | `from: "main-menu"`: the block shows the page items. `from: "pages"`: items the order gives are written, at most `max` (else `menu_items_over_max`); a block the order shows with none of its own lists the pages of the kit's rule (`menuItemPagesOf` of `ai-quickstart-menu-items.mjs`, imported, never copied), each labelled with its page's menu label. `link: "page-address"`: each item is a `url` menu item (component 0) to the page's address, `index.php?Itemid=<its page item>` or its `under.address` (so an item may link a page reached under its list page); another `link` stops `menu_items_link_unknown`. A menu block with no `items` keeps an alias item, written with link `index.php?Itemid=` (an empty link is refused, measured K3) |
| `createdFrames` | a created record's HTML value is written into its declared frame (measured, K1); a value with no declared frame stops (`created_frame_not_declared`). A kit with no `createdFrames` keeps the smallest frame (`created_record_frame`). Every row a created record writes (an object of a JSON list: `exer-features0`) carries every key the mapping declares on that row (block fields and frames), the keys the plan does not fill set to the base's value there or empty (`rowFillsOf`, `draft-write-row-keys.mjs`): a row with only some keys prints PHP warnings for the others (measured, K1) |
| `seo.featuredView.article` | every created article of its page type is written with `set`; none in the plan: flagged `featured_article_none` |
| `facts.<f>[i].notWritten` | the place is never sent; `plan.notWritten` and the run's report and recorded value list it (fact, entity, column, `by`), and a fact all of whose places are so is skipped `fact_not_written_by_decision` |
| `look.accent.writtenAs`, `look.accent.sides` | one op `look.accent` writes the accent as declared (measured, L1): a `mod_custom` with the declared title, position, ordering, showtitle and style, assigned `[0]` (`assign: "every-page"`), its text built at write time by `accentModule` from the stylesheets the site serves (door `sheets`), the template's own accent read as the one colour the stylesheets give the declared variables on `:root`. `sides.values`: the light tone is the order's `accent`, the dark one its `accentDark` (the accent when it has none), under `sides.darkHook`. `look.accent` and `look.accentDark` are written by it. Another `kind`, `content`, `assign` or `sides.values` word stops `accent_written_as_unknown` |
| hides `scope`, `from` | `scope: "item"`: each item prints its own control. `scope: "block"`, `from: "first-item"`: the first item's words are written into every item (`hides.from_first_item`); another item's own words never print, so they are not written and their entry is skipped (`control_printed_from_first_item`); an empty first item stops |
| hides `order: "packed"` | a row left empty before a filled one stops (`omit_row_gap`) |

Typed stops (all noRerun, `DRAFT_WRITE_NO_RERUN`):

| Code | Caught when |
|---|---|
| `page_type_not_declared` | a page of a type the kit's `pages` does not name |
| `page_unbuilt` | a page of a type the kit says the write cannot make; `details.code` is the kit's code |
| `page_link_unresolved` | a link placeholder names no record of the page, no declared category, no page of the plan or no kept record |
| `page_style_unresolved` | a template style that is no kept record of the blank site |
| `page_parent_not_in_plan` | a parent page type the plan has no page of |
| `menu_item_to_under_page` | an alias item of another menu (a kit with no `menu.items`) links to a page reached under its list page: an alias has nothing to name |
| `menu_items_link_unknown`, `menu_items_over_max` | see `menu.items` above |
| `kept_when_unknown`, `category_title_unknown`, `accent_written_as_unknown` | a word of `holds.copies.keptWhen`, `record.category.title` or `look.accent` the write does not know |
| `container_copies_per_page`, `held_block_without_container` | a page places more containers than `perPage`, or a held block without its container |
| `created_frame_not_declared` | see `createdFrames` above |
| `under_page_position_not_detail` | a block on a page reached under its list page sits outside the declared detail positions and no recipe of the page type places it (or it is a library block), or `assignTo` is not `list-page` |
| `place_not_written` | a value at a place the kit's `escapes` declares `not-written` |
| `control_first_item_empty` | a control printed from the first item: the first has no words while another item has some |
| `omit_row_gap` | an `omit` list declared `packed` with a gap |

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
| `page_reached_under`, `row_page_reached_under`, `row_keyed_to_page_type` | a page reached under its list page has no item of its own; a cut row keyed to such a page, or to the page type a `keyedRow` keys, is cut |
| `container_without_held` | a container copy that holds none of the page's blocks is not kept |
| `under_page_block_on_list_page` | a recipe block on a page reached under its list page, outside the detail positions, whose record the list page does not show: written, it would print on the list page too (`plan.underNotWritten`) |
| `fact_not_written_by_decision` | every place of the fact is left unwritten by the kit's decision (`notWritten`) |
| `control_printed_from_first_item` | an item's own words for a control the template prints from the first item's words (`hides` `scope: "block"`, `from: "first-item"`): they never print; the first item's words are written there instead (`by`: the entry whose words print) |

## Unproven (flags in `plan.unproven`; the run copies them to its report)

| Code | Why |
|---|---|
| `accent_variables_not_declared` | the mapping declares no accent colour variables, so the accent is not written |
| `accent_door_missing` | the variables exist but no door writes them (a kit with no `look.accent.writtenAs`) |
| `identity_field_no_door` | an identity field that `site.identity` neither reads nor writes and the kit does not leave unwritten: not sent |
| `menu_item_link_not_declared` | a kit with no `pages`: a list or plans page gets the featured view |
| `featured_article_needed` | a kit with no `seo.featuredView.article`: the home page's featured view needs a featured article |
| `featured_article_none` | the plan has a featured view page and no article of the declared page type: these pages print no share tags |
| `created_record_frame` | a kit with no `createdFrames`: a created article's HTML pieces go into the smallest frame that holds them (`draft-write-frame.mjs`) |
| `article_category_not_declared`, `seo_record_not_declared` | the contract does not say which category an article goes in, or which record holds a page's search texts |
| `control_shared_by_items`, `omit_row_gap`, `omit_on_record_in_place` | see Hides in [draft-write-step.md](draft-write-step.md) |
| `row_form_keys`, `recipe_ordering` | not measured on a real site (contract point 7) |
| `detail_position_not_printed` | a block that sits only in a detail position (every position the kit declares in a `pages.<type>.under.detailPositions`, `detailPositionsOf`) on a page whose menu item opens its own article: T4 prints those positions only under the list page's menu item (measured), so the block prints nothing |
| `article_without_page` | a created article with no menu item of its own: it takes the home page's layout and prints nothing (measured) |
| `initials_drawn_as_figure` | the drawer has strokes for A to Z only: a name in another script is drawn as a neutral figure, and the JA Boxing frames have no text slot for the letters |

