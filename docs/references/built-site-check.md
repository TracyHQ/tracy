---
description: The built site check, a tool the Tracy team runs during local trial runs on a site just built from an AI quickstart. Covers the command, the inputs, every finding kind, what it cannot see, and the seam with the Part 1 release gate.
sources:
  - scripts/built-site-check/run.mjs
  - scripts/built-site-check/check-built-site.mjs
  - scripts/built-site-check/check-design.mjs
  - scripts/built-site-check/check-limits.mjs
  - scripts/built-site-check/check-pages.mjs
  - scripts/built-site-check/part-one.mjs
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
  [--plan <file>] [--kit <dir>] [--write-result <file>] [--stored <file>] --out <report.json>
```

| Input | What it is |
|---|---|
| `--site` | The base address of a locally built site. Only `localhost`, `127.x`, `::1`, `*.localhost`, `*.test` and `*.ddev.site` are read; any other host is refused before a request. Only GET is sent; a redirect off the base is not followed (the page keeps its redirect status, note `redirect_off_base`). Never point it at a customer site. |
| `--pages` | A folder of saved rendered pages instead: `index.html` is the home page, `about.html` is `/about`. |
| `--plan` | The approved plan: the approval `{plan, profile}` or the plan alone. The held names come from `profile.withheld`. |
| `--kit` | The AI quickstart kit folder: `block-store.json`, `mapping.json`, `blank-site-contract/content-map.json` (Contract A, [ai-quickstart-contract.md](ai-quickstart-contract.md)). |
| `--write-result` | The write step's result `{plan, report}`: the write plan `tracy-draft-write-plan/v1` with its write order, and the run report (`ran`, `unproven`, `conflicts`). A write plan alone is read as fully run. See [draft-write-step.md](draft-write-step.md). |
| `--stored` | Optional: `{slots: {<slot>: <value>}}`, the blank site contract slots read back from the built site after the build (the `read` door). |
| `--out` | The JSON report; a readable summary is written next to it as `.txt`. |

The crawl starts at the home page and the plan's page addresses, follows links on the base, reads at most 200 pages
and at most 4 at a time (`capped: true` in the report when it stopped early). Exit code 0 when the tool ran, whatever
it found; 1 when it could not run (a site that is not local or answers nothing, an unreadable input); 2 on a usage
error.

## The report

`tracy-built-site-check/v1`: `source` (kind, pages read, every page that answered another status than 200),
`counts` (per check, `null` when it did not run) and `checks`. Each check is `{status: 'ran', notes, findings}` or
`{status: 'not_run', reason}`. A check that cannot run says so; it never passes silently. A check that throws is
`not_run` with the error's code, never its message.

Every finding has `kind`, `page` (a site address, or a plan page id for a plan page) and `place`.

| Check | Kind | Place and fields |
|---|---|---|
| `demo` | `demo_text`, `demo_image` | Part 1's place; `excerpt`: the template's demo sentence or picture file, at most 80 characters |
| `links` | `missing_page`, `anchor_missing`, `demo_page` | Part 1's place; `href`: the path only, no host, no query |
| `design` | `design_field_written` | `{op, entity, block, field, slot}`; `source: 'write'` (sent by an operation that ran) or `'stored'` (read back, not the blank value, with `lengths`) |
| `design` | `icon_class_not_allowed` | an icon class value sent outside the mapping's `networkIconClasses`; `allowed`: how many are |
| `limits` | `text_over_limit` | `{entry, place, block, field, element}` or `slot`; `limit`, `limitFrom`, `length`; `source: 'rendered'` or `'stored'` |
| `pages` | `plan_page_missing` | `{pageType, path}`; `status` when the address answered something else, `null` when nothing was there |
| `pages` | `plan_menu_item_missing` | `{menu, path}`: `main`, or the menu type of another menu the write made |
| `pages` | `site_page_not_in_plan` | a page read on the site whose address is not under a plan page (a demo leftover) |
| `pages` | `site_menu_item_not_in_plan` | a menu link to such a page; `excerpt`: its label, at most 40 characters |

## Design typed

A place is design typed when it is any of:

- the place of a block store field typed `design` (its `slot`, or its location in the mapping);
- a location the mapping lists in a block's `designLines`;
- a blank site contract slot whose role is `editorial.design_element`;
- a slot shared with any of these.

The write order never has an entry for a design field (`write-order-check.mjs`, `design_field`), so any write at a
design place is one no order entry approved. An icon class sent outside the mapping's `networkIconClasses` is reported
too. Two sources are read: the operations of the write result that ran, and the stored slots (`--stored`) against the
blank site's `sample` value. A design value is not visible text, so the rendered pages are not read for it.

## Limits

For every text entry the write wrote, the element showing it is found on the rendered pages (its own page first): the
innermost element whose visible words hold the first 24 characters of what was written, across inline tags, entities
read; of several, the one closest in length to what was written. Its words are counted one per code point
(`charCount` of `page-copy-check.mjs`, the unit of every limit of the domain) against the smaller of the kit's
declared limit and the order's limit for the field. A written field found on no page is listed in `notLocated` and in
the notes. With `--stored`, the stored value of the field's slot is counted too.

## Privacy

The report quotes template text only: a demo excerpt, a leftover menu label. It gives the lengths and the field of a
text over its limit, never its words, and never the value of a design field. Every string of the report goes through
`maskHeld` with the plan's held names: a held name, in any form (case, accents, slug), is written `[held]`.

## What it cannot see

- A design value from the rendered page: only what the write sent and what the site stores.
- Which menu a rendered menu link belongs to. A menu item is matched by the page it opens, so an item of another menu
  linking a page the main menu also links is found by either.
- A field the template shows in other words than written (cut, rewritten by a filter): it is `notLocated`.
- Pages no link and no plan address reaches, and anything drawn by script after load (no browser runs).
- Pages a site answers only to a signed in visitor.

## The seam with Part 1

The demo scan and the link check are the Part 1 release gate's (#585, #586); this tool never has its own. It imports
`demoScan` and `linkCheck` from `scripts/ai-quickstart/rendered-scan.mjs` (`PART_ONE_MODULE` of
`scripts/built-site-check/part-one.mjs`); until that module exports them, both checks are `not_run`
(`part_one_export_missing`). The signatures:

```js
demoScan({ pages, kit }) -> Promise<Array<{ kind: 'demo_text' | 'demo_image', page, place, excerpt }>>
linkCheck({ pages, base, expected: { paths } }) -> Promise<Array<{
  kind: 'missing_page' | 'anchor_missing' | 'demo_page', page, place, href }>>
```

`pages` are `[{path, url, status, html}]`; `kit` is `{blockStore, mapping, contentMap}`; `base` is the site's base
address; `expected.paths` are the plan's page addresses (a link to a demo page the plan does not have is
`demo_page`). Menu links and in page anchors that point nowhere are the link check's.

Tests: `scripts/test/built-site-check-*.test.mjs`, on an invented florist (`scripts/test/fixtures/built-site-check/`).
The tool has not been run on a real built site yet.
