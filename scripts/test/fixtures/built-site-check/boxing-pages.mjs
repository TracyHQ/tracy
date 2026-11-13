// The invented florist of the draft write tests (`boxing-site.mjs`: an invented business on the real JA Boxing kit,
// every step value made by the real modules with scripted fake models), written by the REAL write plan
// (`writePlanOf`), and rendered pages invented from that plan's own values: each page shows the text values of its
// entries, its SEO title and description, the main menu and the site map menu. Nothing here is a real business,
// person or link. The pages are made the way a template shows a field, not the way JA Boxing lays a page out.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writePlanOf } from '../../../../packages/wo/website-opportunities/domain/draft-write-plan.mjs'
import { boxingSite } from '../../../../packages/wo/website-opportunities/test/fixtures/draft-write/boxing-site.mjs'
import { entriesOf, expectedPagesOf, loadKit, writeResultOf } from '../../../built-site-check/inputs.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
export const BOXING_KIT = path.join(
  ROOT,
  'packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11'
)
const escapeAttr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The real write order, write plan, run report, approval and kit of the florist; `edit(plan)` changes the plan. */
export async function boxingWrite({ edit } = {}) {
  const site = await boxingSite()
  const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })
  edit?.(plan)
  const result = { order: site.order, plan, report: { status: 'done', ran: plan.ops.map((o) => o.key) } }
  return { site, result, approval: site.build.approval, kit: loadKit(BOXING_KIT) }
}

/** The file name of a page address: `/` is `index.html`, `/visit-us` is `visit-us.html`. */
const fileOf = (p) => (p === '/' ? 'index.html' : `${p.slice(1)}.html`)

/** Rendered pages invented from a write result: by file name, each page's text values in its own element. */
export function boxingPages(result, approval) {
  const write = writeResultOf(result)
  const entries = entriesOf(write.order)
  const expected = expectedPagesOf(approval.plan, write)
  const menu = (menutype) =>
    write.plan.ops
      .filter((op) => op.kind === 'menuItem.create' && op.fields.menutype === menutype)
      .map((op) => {
        const to = expected.find((e) => e.page === op.page)?.path ?? '/'
        return `<li><a href="${to}">${op.fields.title}</a></li>`
      })
      .join('')
  const byPage = new Map(expected.map((e) => [e.page, { body: [], seo: {} }]))
  const seen = new Set()
  for (const op of write.ops)
    for (const v of op.values ?? []) {
      const hit = entries.get(v.entry)
      if (!hit || hit.entry.type !== 'text' || typeof v.value !== 'string' || seen.has(v.entry)) continue
      seen.add(v.entry)
      const page = byPage.get(hit.page)
      if (!page) continue
      if (hit.entry.seo) page.seo[hit.entry.seo] = v.value
      else page.body.push(`<div class="field"><p>${v.value}</p></div>`)
    }
  const files = {}
  for (const e of expected) {
    const { body, seo } = byPage.get(e.page)
    files[fileOf(e.path)] = `<!doctype html><html><head><title>${seo.title ?? ''}</title>
<meta name="description" content="${escapeAttr(seo.description ?? '')}"></head><body>
<nav class="t4-megamenu"><ul>${menu(write.plan.mainMenu)}</ul></nav>
<main>${body.join('\n')}</main>
<footer><div class="site-map-menu"><ul>${menu('site-map')}</ul></div></footer></body></html>`
  }
  return files
}
