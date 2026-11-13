#!/usr/bin/env node
/**
 * Measure, on a running copy of the template at the narrowest width (390 px), the text limits the kit could not give
 * (ticket #583). Reads <out>/draft-report.json (its `unmeasured` list, written by draft.mjs) and <out>/block-store.json;
 * opens each page in headless Chromium at 390, 768 and 1440 px (the limit is the smallest over the widths that draw
 * the text, as the kit takes) and runs the kit's own frame reading (`readTextFit`): the demo text's box is filled
 * longer and longer until it needs more lines than the demo shows, grows the page or pushes another text. A text the
 * layout hides at 390 px is measured at the narrowest width that draws it.
 * Writes <out>/measured-limits.json, which draft.mjs reads on its next run. Nothing on the site is written.
 *
 *   PLAYWRIGHT_MODULE=<path to @playwright/test> node packages/cms/tracy-quickstart-tools/ai-quickstart/measure-limits.mjs \
 *     --contract <contract folder> --out <AI quickstart folder> --site <site URL> --site-label "<what the site is>"
 *
 * The site URL is a machine address and is never written to the output; `--site-label` names the copy instead.
 *
 * A run starts clean: it measures again every slot the previous measured-limits.json held, beside the texts the draft
 * still reports unmeasured, and writes only what it read now. A slot measured before and not read again is dropped
 * and listed in `notFound` with that reason, never carried over silently.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readTextFit } from '../template-kit/lib/read-text-fit.js'
import { NARROWEST_WIDTH } from './lib/draft-fields.mjs'
import { readHiddenTexts, readPlaceholderFit, toggleChainOf, wrapTextNodes } from './lib/read-box-state.js'
import { MEASURE_WIDTHS, limitFromReadings, planMeasurements } from './lib/measure-plan.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
/** Opens a kit page path; a site without URL rewriting serves it under /index.php. */
async function openPage(page, site, pagePath) {
  for (const candidate of [pagePath, `/index.php${pagePath === '/' ? '' : pagePath}`]) {
    const res = await page.goto(new URL(candidate, site).href, { waitUntil: 'networkidle', timeout: 60000 })
    if (res && res.status() < 400) return candidate
  }
  return null
}

const argOf = (argv, name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

/** The block of the store that declares `slot` as a field, an item field or a child field. */
function blockHolding(blockStore, slot) {
  const childHolds = (lists) =>
    (lists ?? []).some(
      (l) => l.fields.some((f) => (f.slots ?? []).flat().includes(slot)) || childHolds(l.lists)
    )
  const block = blockStore.blocks.find(
    (b) =>
      [...b.fields, ...(b.itemFields ?? [])].some((f) => f.slot === slot || (f.slots ?? []).includes(slot)) ||
      childHolds(b.lists) ||
      childHolds(b.itemLists)
  )
  return block?.id
}

/** Opens the page of a plan entry and clicks what it names first: a tab's words, then each selector, every match. */
async function openWith(page, site, { path: pagePath, click, clickSelector }) {
  if (!(await openPage(page, site, pagePath))) return null
  if (click) await page.getByText(click, { exact: true }).first().click()
  // A toggle a width does not draw (a phone menu button on the desktop) leaves the texts undrawn there.
  for (const selector of [clickSelector ?? []].flat())
    for (const el of await page.locator(selector).all())
      await el
        .click({ timeout: 2000 })
        .then(() => page.waitForTimeout(400))
        .catch(() => {})
  return pagePath
}

/** How many submenu toggles `openEach` matches once the page is open. */
async function countToggles(page, site, entry) {
  if (!(await openWith(page, site, entry))) return 0
  return page.locator(entry.openEach).count()
}

/** Clicks the toggles that open submenu `index` alone, outermost first. */
async function openChain(page, selector, index) {
  const chain = await page.evaluate(toggleChainOf, { selector, index })
  for (const i of chain)
    await page
      .locator(selector)
      .nth(i)
      .click({ timeout: 2000 })
      .then(() => page.waitForTimeout(400))
      .catch(() => {})
}

/** Reads, on the open page, the texts not yet read at this width (the kit's frame fill, then the fallbacks). */
async function readVisit(page, texts, width, readings, hidden) {
  await page.evaluate(() => document.body.setAttribute('data-kit-block', 'ai-quickstart-page'))
  const take = (got) => {
    for (const t of texts) if (got[t.id]) readings[t.slot] = { ...readings[t.slot], [width]: got[t.id] }
  }
  const unreadOf = (key = 'text') =>
    texts.filter((t) => !readings[t.slot]?.[width]).map((t) => ({ id: t.id, text: t[key] }))
  const fit = (key) => page.evaluate(readTextFit, { block: 'ai-quickstart-page', texts: unreadOf(key) })
  // The words as the sample reads, then as a phone shows them when it hides a forced line break.
  for (const key of ['text', 'tight']) take(await fit(key))
  if (unreadOf().length && (await page.evaluate(wrapTextNodes, { texts: unreadOf() })))
    take(await fit('text'))
  take(await page.evaluate(readPlaceholderFit, { texts: unreadOf() }))
  const gone = await page.evaluate(readHiddenTexts, { texts: unreadOf() })
  for (const t of texts) if (gone[t.id]) hidden[t.slot] = [...(hidden[t.slot] ?? []), width]
}

async function main(argv) {
  const contract = argOf(argv, '--contract')
  const out = argOf(argv, '--out')
  const site = argOf(argv, '--site')
  const siteLabel = argOf(argv, '--site-label') ?? 'a running copy of the template'
  if (!contract || !out || !site) {
    process.stderr.write(
      'usage: measure-limits.mjs --contract <dir> --out <dir> --site <url> [--site-label <text>]\n'
    )
    process.exit(2)
  }
  const file = path.join(out, 'measured-limits.json')
  const previous = existsSync(file) ? readJson(file) : {}
  const blockStore = readJson(path.join(out, 'block-store.json'))
  const again = Object.keys(previous.limits ?? {}).map((slot) => ({
    block: blockHolding(blockStore, slot),
    slot
  }))
  const plan = planMeasurements({
    unmeasured: [...(readJson(path.join(out, 'draft-report.json')).unmeasured ?? []), ...again],
    blockStore,
    kit: readJson(path.join(contract, 'template-kit.json')),
    contentMap: readJson(path.join(contract, 'content-map.json')),
    measureOn:
      (existsSync(path.join(out, 'draft-decisions.json'))
        ? readJson(path.join(out, 'draft-decisions.json')).measureOn
        : null) ?? {}
  })
  const limits = {}
  const notFound = []
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  const browser = await (mod.chromium ?? mod.default.chromium).launch()
  const readings = {}
  const hidden = {}
  try {
    for (const width of MEASURE_WIDTHS) {
      const phone = width < 768
      const context = await browser.newContext({
        viewport: { width, height: phone ? 844 : width < 1440 ? 1024 : 900 },
        isMobile: phone,
        hasTouch: phone,
        deviceScaleFactor: 1
      })
      const page = await context.newPage()
      for (const entry of plan.pages) {
        // One visit, or with `openEach` one visit per submenu toggle, each opening its submenu alone.
        const visits = entry.openEach ? await countToggles(page, site, entry) : 1
        for (let v = 0; v < visits; v++) {
          if (!(await openWith(page, site, entry))) continue
          if (entry.openEach) await openChain(page, entry.openEach, v)
          await readVisit(page, entry.texts, width, readings, hidden)
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  for (const { texts, path: pagePath } of plan.pages)
    for (const t of texts) {
      // A width counts as hiding the text only when no visit read it there.
      const hiddenAt = (hidden[t.slot] ?? []).filter((w) => !readings[t.slot]?.[w])
      const rec = limitFromReadings(readings[t.slot] ?? {}, pagePath, { hiddenAt })
      if (rec) limits[t.slot] = rec
      else
        notFound.push({
          slot: t.slot,
          why: `no shown box on ${pagePath} at ${MEASURE_WIDTHS.join(', ')} px holds the demo words`
        })
    }
  const doc = {
    $comment:
      'Text limits measured on a running copy of the template by measure-limits.mjs (ticket #583): the smallest reading over the widths that draw the text, read at 390 px unless the layout hides it there. draft.mjs reads them.',
    width: NARROWEST_WIDTH,
    widths: MEASURE_WIDTHS,
    measuredOn: siteLabel,
    limits,
    notFound: [
      ...plan.skipped,
      ...notFound,
      ...Object.keys(previous.limits ?? {})
        .filter((slot) => !limits[slot] && !notFound.some((n) => n.slot === slot))
        .map((slot) => ({
          slot,
          why: 'measured by an earlier run, not read again by this one: dropped, not carried over'
        }))
    ]
  }
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  process.stdout.write(
    `measured ${Object.keys(limits).length} limit(s); ${doc.notFound.length} not measurable\n`
  )
}

main(process.argv.slice(2))
