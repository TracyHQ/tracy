# `from-url` — a running site → a source folder

> **Packet P1.** Read after `detect-source.mjs` returns `road: rendered` or `rendered-ask`
> (see `SKILL.md` §Getting started). The source is **someone else's running site** — read §Rights before downloading.

## Command

```bash
node scripts/ingest/from-url.mjs <start-url> --out <dir> \
  [--max-pages 30] [--no-assets] [--allow-cross-origin] [--max-asset-mb 5]
node tools/inventory.mjs <dir> <out-dir>     # the next step, exactly as for an HTML source
```

The output folder **takes the shape of the site itself**: `/` → `index.html`, `/about` → `about/index.html`,
assets keep their paths (`media/templates/site/…`). No file is rewritten, so relative links
in the downloaded HTML still point correctly — and `inventory.mjs` can hash the whole tree just like a design folder.

## What it takes

| Takes | Skips |
|---|---|
| Same-origin HTML pages, breadth-first from `<start-url>` | `mailto:`/`tel:`/`javascript:` links, `#` anchors, binary extensions |
| CSS · JS · images · fonts the pages reference | assets larger than `--max-asset-mb` (recorded in `crawl.json`) |
| Images and fonts referenced by **CSS** (`url(...)` one level deep) | every other origin, unless `--allow-cross-origin` |

`crawl.json` keeps the record: start URL, timestamp, `sameOrigin`, every page with its byte count, every asset,
and **every failure with its reason**. That is what answers "when was this snapshot taken, from where, is it complete".

## Three things it tells you instead of leaving you to find out

1. **Hitting the `--max-pages` cap** → prints how many URLs are left in the queue. A 200-page site with
   `--max-pages 30` gives a **partial** snapshot, and the `routes.json` that follows will be missing exactly that part.
2. **Pages under 2 KB** → warns that the site may render with JavaScript. This crawler **does not run JS**:
   an SPA returns an empty shell that looks like success. Open a page and look before trusting it.
3. **Redirects off the origin** → refused rather than silently followed, because `crawl.json` is the record
   the licensing question relies on.

## 🔒 Rights — read before downloading

Downloading someone else's site to rebuild its look is a **licensing** question, not a technical one.
Doing it locally for research is fine; **releasing** a derivative template requires clear rights —
`SKILL.md` §Stop conditions: *"the source has no clear reuse rights and the job is a release → stop,
ask Lee"*. `crawl.json` records what was downloaded from where, so that question can be answered with evidence.

## After that

Continue on exactly the HTML-source road: `inventory.mjs` → `routes.json` → `qa.contract.json` with
`source.kind: url`, `source.parity: measured` (the site still renders, so both sides can be compared). See
[`source-inventory.md`](../source-inventory.md).

⚠ If the source is a **CMS within reach**, this is the WRONG road — `detect-source` will say `road: contract`.
When the content model can be read, do not scrape HTML: [`site-model.md`](../site-model.md).
