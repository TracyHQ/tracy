---
description: What the draft write step holds a plan to before any door is called. Covers the one unit of every text limit and the door's own count, every guard, where markup and double parentheses are caught and by whom, how each value is made safe as raw HTML at its kind of place, and the skip reasons and unproven flags of a plan.
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
| `value_not_escaped` | words not escaped at a place printed raw (`via: not_escaped`), or not escape neutral at a place not measured (`via: not_escape_neutral`); see "Every value safe as raw HTML" |
| `record_name_empty` | a contact created with an empty or blank name: the site writes it (measured), so the build refuses it |
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

## Every value safe as raw HTML (`draft-write-escape.mjs`)

The template escapes almost nothing (measured: only block 177's `info-email-label`, `info-email`, `info-phone-label`,
`info-phone`, `info-note` and the chrome's `moduleclass_sfx`), so the write step is the only barrier. After the plan
is built, `safeOps` makes every value and every created record column safe at its kind of place (`safetyAt`), and the
guard refuses any value that is not (`value_not_escaped`, `draft-write-place-guard.mjs`):

| Place | Kind | Written as | Why |
|---|---|---|---|
| a JA ACM block's data key (`jatools-config`, no xpath): titles, texts, links, picture paths, classes | raw | escaped as `htmlspecialchars` with ENT_QUOTES (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`); declared markers kept | measured printed raw in text, `href`, `src`, `style`, `alt`, `class`, `title` |
| a module title written on a copy | raw | escaped | measured printed raw (chrome text, a plans tab label) |
| a module setting (`params` key: `top-desc`, `title-btn`, `link-btn`) | raw | escaped | measured printed raw (chrome) |
| a site language string (`value`) | raw | escaped | printed by `Text::_` as stored |
| a module title or other slot through the contract that the door counts raw (`countsRaw`: a fixed width column) | neutral | escape neutral | escaping would make the door count more than the writer wrote and refuse it |
| block 177's `info-*` keys, `moduleclass_sfx` | neutral | escape neutral | measured escaped by the template: escaping again would show `&amp;` |
| an xpath piece of a stored HTML value | piece | the DOM escapes `&`, `<`, `>`; plain words get typographic quotes | the DOM leaves a quote in a text node as it is, and where an `attribs` piece prints is not measured |
| a whole HTML column (`introtext`, `fulltext`, `content`, `misc`) | html | words escaped (`textAt`, `inline_html`), declared tags kept | printed as HTML |
| every other place: a created record's title, alias, name, `metadesc`, attribs key, contact column, a menu item title, a page title key, the site name | neutral | escape neutral | not measured: whether Joomla or the template escapes them is not known |

**Escape neutral** means the value reads the same escaped or not, so it is never escaped twice and never left open:
straight quotes become typographic ones (`"` as `“` and `”`, `'` as `’`, or `‘` at a word start), and a `<`, a `>`
or a character reference (`&#39;`, `&amp;`) is refused. An address at a neutral place keeps its quotes, so a quote
there is refused. A plain `&` stays (`Q&A`, `R&D`); a legacy name without its semicolon (`&copy 2026`) could still
show as a sign where the place does not escape: a look, never markup.

**Lengths.** The visible count (`visibleLength`) reads entities, so an escaped value counts what the writer wrote;
typographic quotes are one code point each. Where the door counts the raw string, the value is written neutral, so
`doorLength` of what is sent equals the writer's count (`domain-draft-write-escape.test.mjs`).

**What the site then prints** is scanned on the memory site (`draft-write-rendered-output.test.mjs`): every hostile
writer value in every writer field is either refused before any door or printed with no tag, handler, broken attribute
or code address the kit does not declare.

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
| `detail_position_not_printed` | a block that sits only in a detail position (`detail-bottom-1`, `main-bottom-2`, `DETAIL_POSITIONS`) on a page whose menu item opens its own article: T4 prints those positions only under the list page's menu item (measured), so the block prints nothing |
| `article_without_page` | a created article with no menu item of its own: it takes the home page's layout and prints nothing (measured) |
| `initials_drawn_as_figure` | the drawer has strokes for A to Z only: a name in another script is drawn as a neutral figure, and the JA Boxing frames have no text slot for the letters |

