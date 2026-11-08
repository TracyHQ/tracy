# Eye review: every page at 1440 and 390

The procedure and the fault list are the Joomla skill's (`joomla-template-readiness` `references/eye-review.md`):
review, split among subagents, fix, report. Only the shooting command and fault V12 differ on WordPress.

## 1. Shoot

On the demo (restored from the pinned version, untouched):

```bash
node .agents/skills/wordpress-template-readiness/scripts/shoot-pages.mjs \
  --base "<demo address>" [--host-header "<the name in siteurl>"] \
  --kit "$CONTRACT/template-kit.json" --out "$RUN/eye/shots"
```

Every page of the kit, full page, at 1440 and 390. Each page is opened at the address WordPress serves it at (a
trailing slash), through the kit tool's own browser context, so `--host-header` reaches a demo that answers only on a
local port. Exit 1 names the failed pages in `shots.json`; a page that is not 200 is fault V12.

## 2. Review

The Joomla list V1 to V11, as written there. V12 on WordPress:

| Id | Visible fault |
|---|---|
| V12 | Visible error text: a PHP notice, warning or fatal error, a block that failed to render ("This block has encountered an error", "Your site doesn't include support for ..."), a raw shortcode in brackets, a page not answering 200 |

## 3. Fix, then judge again

As the Joomla page says, with WordPress places: a fault in the theme's templates, parts, patterns or CSS is fixed in
the theme overlay and released ([`fix-map.md`](fix-map.md), *Theme release*; stop W1 follows); a fault the demo
measures should have caught (V2, V3, V4, V5, V10) also fixes the measure in the Tracy tool, test first; a fault that
needs a person goes in the report.

## 4. Readiness report

`$RUN/readiness-report.md`, as the Joomla page says: one section per fault left, with a cropped picture.
