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
post meta, `_thumbnail_id`. Nothing else is a door. `capture-contract.mjs --all-text` makes slots addressed by
position (`blockType` + `occurrence`): the plugin cannot bind them, so never ship a profile with them.

| What the evidence shows | Door | Fix |
|---|---|---|
| A page's title (document title `"<title> -"`) | page `post_title` | capture with `--page-titles` |
| A post's title, excerpt, featured picture | post fields, `_thumbnail_id` | capture with `--posts` |
| A plain-text block with no name, or the second block of a name, in a page, post or template part | `metadata.name` | name the block in the theme pattern (overlay `patterns/`) and in the demo content of the next cut, then capture again |
| An image block with no name | `metadata.name` | as above; `capture-image-slots.mjs` makes the slot |
| Text with inline markup in one block: a price `<span>`, a highlight `<span>`, a link inside a paragraph, `<br>` lines | none: a plain-text slot would drop the markup | stop W5: a plugin door for marked-up text, or a design change that splits the block |
| A `core/html` block, a navigation label kept in a `wp_navigation` post, a category or tag name, a picture a theme option or a theme post meta points at | none | stop W5 |
| Business words hard-coded in a theme pattern (`class: template`: an address, a phone, a price) | the page content | theme release: the pattern prints them from named blocks of the page |
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
