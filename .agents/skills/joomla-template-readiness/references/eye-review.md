# Eye review: every page at 1440 and 390

The verdict's measures read numbers; some faults only an eye sees. This review is done by the running agent, against
the fixed list below, with no person approving pictures.

## 1. Shoot

On a site freshly restored from the pinned version and untouched (the same kind of site `demo-measures.mjs` reads):

```bash
node .agents/skills/joomla-template-readiness/scripts/shoot-pages.mjs \
  --base "<demo address>" --kit "$CONTRACT/template-kit.json" --out "$RUN/eye/shots"
```

Every page of the kit (not only its representatives), full page, at 1440 and 390. Exit 1 names failed pages in
`shots.json`; a page that does not answer 200 is itself fault V12.

## 2. Review

Open every shot. Split the shots among subagents (at most two at a time, about 20 shots each); each returns, per fault,
`{ id, page, width, shot, where (what element, in words), evidence }`. Review the full list, in this order; a shot is
done when every item was looked for, not when the first fault is found.

| Id | Visible fault |
|---|---|
| V1 | Cards of one row misaligned: tops, titles, pictures or buttons at different heights |
| V2 | A grid row left with a hole, or a last row with fewer cards placed oddly |
| V3 | Text cut by its box, overlapping another element, or running under a picture |
| V4 | At 390: anything past the right edge, or a page wider than the screen |
| V5 | An empty picture frame, an empty card, box or column |
| V6 | A broken, stretched or squashed picture |
| V7 | At 390: desktop columns squeezed instead of stacked, text too small to read, the desktop menu bar |
| V8 | Text unreadable on its ground (on a picture or a band) |
| V9 | A sticky header, bar or floating widget covering content |
| V10 | A large blank gap: a band or section that paints nothing |
| V11 | A missing icon: an empty square, a font icon not loaded |
| V12 | Visible error text: a PHP notice, a raw language key (`TPL_...`, `MOD_...`), a module error, a page not answering 200 |

## 3. Fix, then judge again

- A fault in the template's layout, CSS or language strings: fix in the template source, as a template release
  (`quickstart-contract` section 7b step 3). Shoot again after the new version is restored.
- A fault the verdict's own measures should have caught (V2, V3, V4, V5, V10 are measured by `demo-measures`): also fix
  the measure in the Tracy tool, test first, so the next template is caught by the number and not by the eye.
- A fault that needs a person (a design choice, a picture the template ships that is wrong by design): write it in the
  report, do not stop the run for it.

## 4. Readiness report

`$RUN/readiness-report.md`, one section per fault left: id, page, width, why it was not fixed, and a cropped picture of
the element (`locator.screenshot()` or `page.screenshot({ clip })` around `where`, saved beside the report). No fault
left: the report says the review ran on N shots and found none. The PR body lists every fault left, one line each.
