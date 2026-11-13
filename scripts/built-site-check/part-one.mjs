// The seam with the Part 1 release gate (tickets #585 and #586). The demo scan and the link check are Part 1's; this
// tool never has its own. It calls them through two functions and only shapes what they find:
//
//   demoScan({pages, kit}) -> Promise<Array<{kind: 'demo_text' | 'demo_image', page, place, excerpt}>>
//   linkCheck({pages, base, expected}) -> Promise<Array<{kind: 'missing_page' | 'anchor_missing' | 'demo_page',
//                                                         page, place, href}>>
//
// `pages`: `[{path, url, status, html}]`, the rendered pages; `kit`: `{blockStore, mapping, contentMap}`; `base`: the
// site's base address; `expected`: `{paths}`, the addresses of the plan's pages (a link to a demo page the plan does not
// have is `demo_page`). `excerpt` is template text only (the demo sentence, or the demo picture's file name).
// Until Part 1 exports them from PART_ONE_MODULE, both checks report `not_run`, never a silent pass.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PART_ONE_MODULE = 'scripts/ai-quickstart/rendered-scan.mjs'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXCERPT = 80
const DEMO_KINDS = new Set(['demo_text', 'demo_image'])
const LINK_KINDS = new Set(['missing_page', 'anchor_missing', 'demo_page'])

/** Part 1's two functions, each null while it is not exported. */
export async function loadPartOne(root = ROOT) {
  const file = path.join(root, PART_ONE_MODULE)
  if (!existsSync(file)) return { demoScan: null, linkCheck: null }
  const mod = await import(pathToFileURL(file).href)
  return {
    demoScan: typeof mod.demoScan === 'function' ? mod.demoScan : null,
    linkCheck: typeof mod.linkCheck === 'function' ? mod.linkCheck : null
  }
}

const missing = (name, ticket) => ({
  status: 'not_run',
  reason: `part_one_export_missing: ${PART_ONE_MODULE} does not export ${name} (#${ticket})`,
  findings: []
})
const cut = (text) => {
  const chars = [...String(text ?? '')]
  return chars.length > EXCERPT ? `${chars.slice(0, EXCERPT - 3).join('')}...` : chars.join('')
}
const pathOnly = (href) =>
  String(href ?? '')
    .replace(/^[a-z]+:\/\/[^/]+/i, '')
    .replace(/\?.*$/, '')

/** Part 1's findings, kept to their kinds, each with its page and place, an excerpt cut short. */
function shaped(found, kinds, extra) {
  const findings = []
  let dropped = 0
  for (const f of Array.isArray(found) ? found : []) {
    if (!kinds.has(f?.kind)) {
      dropped++
      continue
    }
    findings.push({ kind: f.kind, page: f.page ?? null, place: f.place ?? null, ...extra(f) })
  }
  return {
    status: 'ran',
    notes: dropped ? [`${dropped} finding(s) of an unknown kind left out`] : [],
    findings
  }
}

async function guarded(run) {
  try {
    return await run()
  } catch (error) {
    return {
      status: 'not_run',
      reason: `part_one_failed: ${error?.code ?? error?.name ?? 'error'}`,
      findings: []
    }
  }
}

/** The demo check through Part 1's scan. */
export function checkDemo({ demoScan, pages, kit }) {
  if (!demoScan) return missing('demoScan', 585)
  if (!kit)
    return { status: 'not_run', reason: 'kit_missing: the demo list comes from the kit', findings: [] }
  return guarded(async () =>
    shaped(await demoScan({ pages, kit }), DEMO_KINDS, (f) => ({ excerpt: cut(f.excerpt) }))
  )
}

/** The link check through Part 1's check. */
export function checkLinks({ linkCheck, pages, base, expected }) {
  if (!linkCheck) return missing('linkCheck', 586)
  return guarded(async () =>
    shaped(
      await linkCheck({ pages, base: base.href, expected: { paths: (expected ?? []).map((e) => e.path) } }),
      LINK_KINDS,
      (f) => ({ href: cut(pathOnly(f.href)) })
    )
  )
}
