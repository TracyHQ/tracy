// Fixtures for a page the plan asks to create: the fake site of `_write-step-run.mjs` and a footer link printed by a menu. Every
// business, word and row here is invented.
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy, fakeSite, frozenFiles, KIT, plan, SITE } from './_write-step-run.mjs'

export const LINK = 'block-2.9'
const RECORDS = [
  { kind: 'menuItem', id: 101, path: 'home', home: 1, published: 1, type: 'component', menutype: 'mainmenu' },
  {
    kind: 'menuItem',
    id: 40,
    path: 'price',
    published: 1,
    type: 'url',
    link: 'index.php?Itemid=70',
    menutype: 'useful-links',
    params: '{}'
  }
]

/** The kit with block-2 printing a menu whose item `menuItem-40` is `LINK`. */
export function pagesKit() {
  const kit = KIT()
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.source = { entity: 'module-2' }
  block.links = [
    {
      id: LINK,
      position: 0,
      label: 'Price',
      target: '/price',
      menuItem: 'menuItem-40',
      menu: 'module-2',
      action: 'navigation'
    }
  ]
  return kit
}

/** The plan with `LINK` leading to `leadsTo`. */
export function pagesPlan(leadsTo = 'legal:privacy') {
  const p = plan()
  p.site.legalPages = p.site.legalPages.map((page) => ({ ...page, use: 'create' }))
  p.pages[0].blocks[0].links = [{ link: LINK, leadsTo, labelSlot: null }]
  return p
}

/** `fakeSite` with the footer menu's rows and two reads of what the run made. */
export function pagesSite(script = {}) {
  const site = fakeSite({ records: RECORDS, ...script })
  site.batches = () => site.calls.filter((c) => c.action === 'content.batch')
  site.rows = (kind) => [...site.records.values()].filter((r) => r.kind === kind)
  return site
}

/** One run on this site; `over` replaces the frozen files, `last` is the last run's report. */
export async function runOn(site, { over = {}, last = null, kit = pagesKit() } = {}) {
  const frozen = frozenFiles({ plan: pagesPlan(), copy: copy(), ...over })
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap: null,
      files: frozen.files,
      sleep: async () => {},
      last
    })
    return { report, line: (slot) => report.slots.find((s) => s.slot === slot) }
  } finally {
    frozen.done()
  }
}
