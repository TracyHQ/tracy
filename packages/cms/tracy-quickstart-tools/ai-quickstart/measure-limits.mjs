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
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readTextFit } from '../template-kit/lib/read-text-fit.js'
import { NARROWEST_WIDTH } from './lib/draft-fields.mjs'
import { readHiddenTexts, readPlaceholderFit, wrapTextNodes } from './lib/read-box-state.js'
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
  const plan = planMeasurements({
    unmeasured: readJson(path.join(out, 'draft-report.json')).unmeasured ?? [],
    blockStore: readJson(path.join(out, 'block-store.json')),
    kit: readJson(path.join(contract, 'template-kit.json')),
    contentMap: readJson(path.join(contract, 'content-map.json')),
    measureOn:
      (existsSync(path.join(out, 'draft-decisions.json'))
        ? readJson(path.join(out, 'draft-decisions.json')).measureOn
        : null) ?? {}
  })
  const file = path.join(out, 'measured-limits.json')
  const previous = existsSync(file) ? readJson(file) : {}
  const limits = { ...previous.limits }
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
      for (const { path: pagePath, click, texts } of plan.pages) {
        if (!(await openPage(page, site, pagePath))) continue
        if (click) await page.getByText(click, { exact: true }).first().click()
        await page.evaluate(() => document.body.setAttribute('data-kit-block', 'ai-quickstart-page'))
        const fit = (key) =>
          page.evaluate(readTextFit, {
            block: 'ai-quickstart-page',
            texts: texts.filter((t) => !readings[t.slot]?.[width]).map((t) => ({ id: t.id, text: t[key] }))
          })
        // The words as the sample reads, then as a phone shows them when it hides a forced line break.
        for (const key of ['text', 'tight']) {
          const got = await fit(key)
          for (const t of texts) if (got[t.id]) readings[t.slot] = { ...readings[t.slot], [width]: got[t.id] }
        }
        const unread = texts
          .filter((t) => !readings[t.slot]?.[width])
          .map((t) => ({ id: t.id, text: t.text }))
        if (unread.length && (await page.evaluate(wrapTextNodes, { texts: unread }))) {
          const got = await fit('text')
          for (const t of texts) if (got[t.id]) readings[t.slot] = { ...readings[t.slot], [width]: got[t.id] }
        }
        const rest = texts.filter((t) => !readings[t.slot]?.[width]).map((t) => ({ id: t.id, text: t.text }))
        const placeholders = await page.evaluate(readPlaceholderFit, { texts: rest })
        for (const t of texts)
          if (placeholders[t.id]) readings[t.slot] = { ...readings[t.slot], [width]: placeholders[t.id] }
        const gone = await page.evaluate(readHiddenTexts, {
          texts: texts.filter((t) => !readings[t.slot]?.[width]).map((t) => ({ id: t.id, text: t.text }))
        })
        for (const t of texts) if (gone[t.id]) hidden[t.slot] = [...(hidden[t.slot] ?? []), width]
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  for (const { texts, path: pagePath } of plan.pages)
    for (const t of texts) {
      const rec = limitFromReadings(readings[t.slot] ?? {}, pagePath, { hiddenAt: hidden[t.slot] ?? [] })
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
    notFound: [...plan.skipped, ...notFound]
  }
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  process.stdout.write(
    `measured ${Object.keys(limits).length} limit(s); ${doc.notFound.length} not measurable\n`
  )
}

main(process.argv.slice(2))
