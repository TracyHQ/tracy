---
description: The built site check, a tool the Tracy team runs during local trial runs on a site just built from an AI quickstart. Covers the command, the inputs, every finding kind, what it cannot see, and the seam with the Part 1 release gate.
sources:
  - scripts/built-site-check/run.mjs
  - scripts/built-site-check/check-built-site.mjs
  - scripts/built-site-check/check-design.mjs
  - scripts/built-site-check/check-limits.mjs
  - scripts/built-site-check/check-pages.mjs
  - scripts/built-site-check/part-one.mjs
  - scripts/built-site-check/part-one-links.mjs
  - scripts/built-site-check/limit-measure.mjs
  - scripts/built-site-check/held-mask.mjs
  - scripts/built-site-check/inputs.mjs
---

# The built site check

A tool for **local trial runs** (#601). It reads the rendered pages of a site just built from an AI quickstart and
reports what it finds. It decides nothing: a build is done when every step, ending with the write step, completed
([ADR 0047](../adr/0047-a-failing-build-step-stops-and-reports.md), decision 3). No part of a build calls it; a test
walks every module of `apps/tracy-web/src` and of the domain and proves none reaches it
(`scripts/test/built-site-check-run.test.mjs`).

## The command

```
node scripts/built-site-check/run.mjs (--site <local base address> | --pages <folder>) \
  [--plan <file>] [--kit <dir>] [--write-result <file>] [--write-order <file>] [--stored <file>] \
  [--demo-content <file>] --out <report.json>
```

| Input | What it is |
|---|---|
| `--site` | The base address of a locally built site. Only `localhost`, `127.x`, `::1`, `*.localhost`, `*.test` and `*.ddev.site` are read; any other host is refused before a request. Only GET is sent; a redirect off the base is not followed (the page keeps its redirect status, note `redirect_off_base`). Never point it at a customer site. |
| `--pages` | A folder of saved rendered pages instead: `index.html` is the home page, `about.html` is `/about`. A symbolic link in it is never followed, and at most 200 pages are read. |
| `--plan` | The approved plan: the approval `{plan, profile}` or the plan alone. The held names come from `profile.withheld`. |
| `--kit` | The AI quickstart kit folder: `block-store.json`, `mapping.json`, `blank-site-contract/content-map.json` (Contract A, [ai-quickstart-contract.md](ai-quickstart-contract.md)). The released content map beside it (`contracts/<slug>/<j>/<version>/content-map.json`) gives the routes of the template's demo pages. |
| `--write-result` | The write step's result `{order, plan, report}`: the write order `tracy-write-order/v1`, the write plan `tracy-draft-write-plan/v1` and the run report (`ran`, `unproven`, `conflicts`). `{plan, report}` or a write plan alone is read too (a plan alone as fully run), but then the order must come with `--write-order`. See [draft-write-step.md](draft-write-step.md). |
| `--write-order` | The write order, when the write result does not hold it. The write plan keeps only the order's ids (`order: {run, plan, template}`), and the limits check needs the order's entries. An order of another run than the plan's is refused (`write_order_mismatch`). |
| `--demo-content` | The template's released content map, when it is not beside the kit. |
| `--stored` | Optional: `{slots: {<slot>: <value>}}`, the blank site contract slots read back from the built site after the build (the `read` door). |
| `--out` | The JSON report; a readable summary is written next to it as `.txt`. |

### What a trial run saves for the tool

The write step's value is `{report, order, plan, build, recorded}` (`apps/tracy-web/src/step-chain-draft-write-step.js`),
and a failure's `error.value` is `{report, order, plan, recorded}`; the engine stores only `recorded`. A trial run wires
`deps.draftWrite.keepTrial({order, plan, report}, ctx)`, which the step calls once per attempt, done or failed, and
saves three files:

- `order.json`: the write order the step read (`trial.order`);
- `write.json`: `{order, plan, report}` as the hook receives it;
- `plan.json`: the approval `{plan, profile}` (`inputs.plan`), for the plan's pages and the held names.

With `write.json` holding the order, `--write-order` is not needed.

The crawl starts at the home page and the plan's page addresses, follows links on the base, reads at most 200 pages
and at most 4 at a time (`capped: true` in the report when it stopped early).

Exit code:

| Code | Meaning |
|---|---|
| 0 | every one of the five checks ran, whatever it found (a finding is not a failure; the tool decides nothing) |
| 3 | the report is written but at least one check is `not_run`; no finding from that check is a pass |
| 1 | the tool could not run (a site that is not local or answers nothing, an unreadable input) |
| 2 | a usage error |

## The report

`tracy-built-site-check/v1`: `source` (kind, pages read, every page that answered another status than 200),
`complete` (true only when all five checks ran), `notRun` (the names of the checks that did not), `counts` (per
check, `null` when it did not run) and `checks`. The readable summary ends with `Every check ran.` or
`INCOMPLETE: n check(s) did not run (...)`. Each check is `{status: 'ran', notes, findings}` or
`{status: 'not_run', reason}`. A check that cannot run says so; it never passes silently. A check that examined
nothing while there was something to examine is `not_run` too: limits with written text fields none of which was found
on a page (`nothing_measured`) or whose values name no entry of the order (`write_order_unmatched`); design and limits
when the run report lists none of the plan's operations (`nothing_ran`); design with a kit that declares no design
place (`no_design_place`); pages with a plan of no page (`plan_has_no_pages`); demo and links with no page read
(`no_rendered_page`). A check that throws is `not_run` with the error's code, never its message.

Every finding has `kind`, `page` (a site address, or a plan page id for a plan page) and `place`.

| Check | Kind | Place and fields |
|---|---|---|
| `demo` | `demo_text`, `demo_image` | Part 1's place; `excerpt`: the template's demo sentence or picture file, at most 80 characters |
| `links` | `missing_page`, `anchor_missing`, `demo_page` | Part 1's place, kept to its known keys; `href`: the path and anchor only, no host, no query; a mail or phone link as its scheme only (`mailto:`) |
| `design` | `design_field_written` | `{op, entity, block, field, slot}`; `source: 'write'` (sent by an operation that ran) or `'stored'` (read back, not the blank value, with `lengths`) |
| `design` | `icon_class_not_allowed` | an icon class value sent outside the mapping's `networkIconClasses`; `allowed`: how many are |
| `limits` | `text_over_limit` | `{entry, place, block, field, element}` or `slot`; `limit`, `limitFrom`, `length`; `source: 'rendered'` or `'stored'` |
| `pages` | `plan_page_missing` | `{pageType, path}`; `status` when the address answered something else, `null` when nothing was there |
| `pages` | `plan_menu_item_missing` | `{menu, path}`: `main`, or the menu type of another menu the write made; never for a page the write plan reaches under its list page (`plan.under`), which has no item of its own and is looked for at its record's alias below the list page |
| `pages` | `site_page_not_in_plan` | a page read on the site whose address is not under a plan page (a demo leftover) |
| `pages` | `site_menu_item_not_in_plan` | a menu link to such a page; `excerpt`: its label, at most 40 characters, only when the template's demo content declares that address; else `labelLength` only |

## Design typed

A place is design typed when it is any of:

- the place of a block store field typed `design` (its `slot`, or its location in the mapping);
- a location the mapping lists in a block's `designLines`;
- a blank site contract slot whose role is `editorial.design_element`;
- a slot shared with any of these.

The write order never has an entry for a design field (`write-order-check.mjs`, `design_field`), so any write at a
design place is one no order entry approved. An icon class sent outside the mapping's `networkIconClasses` is reported
too. A write location overlaps a design location when both name the same record and column and one path is the start
of the other: a write of the whole `params` column, of a parent (`['gallery']`) or of a path under a design line is a
design write. Two sources are read: the operations of the write result that ran, and the stored slots (`--stored`) against the
blank site's `sample` value. A design value is not visible text, so the rendered pages are not read for it.

## Limits

The order's entries are indexed by their `place` (`home.home-b2.button-label`), the id every write value names
(`entry`); SEO values (`seo:home.title`, `seo:home.description`) are text entries with the order's SEO limits, share
images, pictures and icons are indexed and skipped. For every text entry the write wrote, the field's own run is found
on the rendered pages (its own page first): in the innermost element whose visible words hold the first 24 characters
of what was written, across inline tags, entities read, the run is the words from where the field starts for as long
as they are the written words. Other words of that element (a label before it, a tail the template adds) are not the
field's. Of several places, the longest run. An SEO title is read in its own page's `title`, a description in its
description meta. A run is counted one per code point (`charCount` of `page-copy-check.mjs`, the unit of every limit
of the domain; the domain does not normalise to NFC before counting, so neither does this tool) against the smaller of
the kit's declared limit and the order's limit for the field. A written field found on no page is listed in
`notLocated` and in the notes. With `--stored`, the stored value of the field's slot is counted too.

On the invented florist of the draft write tests (the real write order and write plan on the real JA Boxing kit), all
89 written text fields (77 block fields and 12 SEO values) are measured on pages invented from the plan's values
(`scripts/test/built-site-check-real-plan.test.mjs`).

## Privacy

The report quotes template text only: a demo excerpt, a leftover menu label. It gives the lengths and the field of a
text over its limit, never its words, and never the value of a design field. Every string of the report goes through
`held-mask.mjs` with the plan's held names: character references and percent escapes are read first, then the
domain's `maskHeld` (case, accents, slug), then two forms it does not find: a digit between the words of a held name
(`Odalys1Brenwick`) and a one word held name of 4 letters or more inside a token of a path or a slug
(`brenwickflowers`). A held name is written `[held]`. A one word held name glued to a capitalised word in prose
(`Brenwicks`) is not found.

## What it cannot see

- A design value from the rendered page: only what the write sent and what the site stores.
- Which menu a rendered menu link belongs to. A menu item is matched by the page it opens, so an item of another menu
  linking a page the main menu also links is found by either.
- A field the template shows in other words than written (rewritten by a filter): it is `notLocated`. A field the
  template cuts short is measured as shown.
- A text kept short by CSS (`text-overflow`, a line clamp): no browser runs.
- A page reached only by a query address (a site without search engine friendly addresses): the crawl follows paths
  and reads a query link as its path. Part 1 gets the query in `links` and can `probe` it.
- Whether Joomla opens a page reached under its list page at `/<list page>/<record alias>`: the address is the
  search engine friendly form of the declared link with ids left out of addresses, not measured on a built site.
- Pages no link and no plan address reaches, and anything drawn by script after load (no browser runs).
- Pages a site answers only to a signed in visitor.

## What each check needs

| Check | Needs | `not_run` when |
|---|---|---|
| `demo` | a kit with a demo source: the template's released content map (`--demo-content`, or found beside the kit, or the release files the module finds by `kit.mapping.template`) | no page read (`no_rendered_page`); no kit (`kit_missing`); the kit gives no demo source (`demo_corpus_empty`) |
| `links` | the pages; the plan (for `expected` pages) and the kit (for the demo routes) make it sharper | no page read (`no_rendered_page`) |
| `design` | the kit and the write result (the stored slots add a second source) | `no_design_place`, `nothing_ran` |
| `limits` | the write result with its order | `write_order_missing`, `write_order_unmatched`, `nothing_measured`, `nothing_ran` |
| `pages` | the plan | `plan_has_no_pages` |

`not_run` means the check examined nothing, so it says nothing about the site. It is never a pass: the report has
`counts` null, `complete` false and `notRun` naming it, the summary says `NOT RUN` and `INCOMPLETE`, and the exit code
is 3.

## The seam with Part 1

The demo scan and the link check are the Part 1 release gate's (#585, #586); this tool never has its own. It imports
`demoScan` and `linkCheck` from `scripts/ai-quickstart/rendered-scan.mjs` (`PART_ONE_MODULE` of
`scripts/built-site-check/part-one.mjs`); a function the module does not export makes its check `not_run`
(`part_one_export_missing`). The signatures:

```js
demoScan({ pages, kit }) -> Promise<Array<{ kind: 'demo_text' | 'demo_image', page, place, excerpt }>>
linkCheck({ pages, base, expected: { paths }, links, probe, demoRoutes }) -> Promise<Array<{
  kind: 'missing_page' | 'anchor_missing' | 'demo_page', page, place, href }>>
```

`pages` are `[{path, url, status, html}]`; `kit` is `{blockStore, mapping, contentMap, demoRoutes, demoContentMap}`
(`demoContentMap`: the released content map, the scan's demo source); `base` is the site's base address;
`expected.paths` are the plan's page addresses (a link to a page the plan does not have is `demo_page`);
`demoRoutes` are the template's demo page routes. `links` is every link of every page read, resolved by
`part-one-links.mjs`: `{page, href, url, path, query, hash, kind, menu}`, `kind` one of `page`, `asset` (a file under
the base, which the crawl does not read), `anchor`, `scheme` (mail, phone), `other_site`; a link with a query string
keeps it, so `index.php?option=com_content&view=article&id=3` is not taken for the home page. The link's words are
never handed on. `probe(url)` reads one address of the local site again with the tool's guards and answers
`{status, note?}`, so a query or asset link can be judged; it is `null` for a folder of saved pages. A scan with no
demo source throws `demo_corpus_empty`, which the tool reports as `not_run` with that reason. What comes back is
shaped: `place` keeps only `element`, `menu` and `anchor`, each a plain value of at most 40 characters; a demo excerpt
is cut to 80 characters; every string then goes through the held name mask.

Tests: `scripts/test/built-site-check-*.test.mjs`, on an invented florist (`scripts/test/fixtures/built-site-check/`);
`built-site-check-end-to-end.test.mjs` runs the real module through one command on a fake local server.

## Not measured yet

The tool has not been run on a real built site. Unmeasured there: how many demo words a real template's released
files miss (the corpus is only as good as its sources); whether a real site's pretty addresses make `probe` read the
same pages as the crawl; how long a crawl of 200 pages takes against a real local site. On a folder of saved pages
nothing can be probed, so a dead link to a page the plan does not have is told as `demo_page`, not `missing_page`.
