// The release gate on the invented florist kit and a site in memory (ticket #586): the inputs `releaseGate` takes,
// with every hook stamped in the order it ran. Shared by the release gate test and the release guard test, which needs
// a record the gate really made. Invented values only.
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EXEMPTIONS } from '../../../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { JOOMLA_PROBES } from '../../../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { codesIn } from '../../../ai-quickstart/gate/marker-codec.mjs'
import { memoryTryWrite } from '../../../ai-quickstart/gate/memory-write.mjs'
import { blankControlOf } from '../../../ai-quickstart/gate/verdict.mjs'
import { PROBE_CATALOGUE } from '../../../ai-quickstart/gate/write-probes-edge.mjs'
import { demoCorpus, observationsFromHtml } from '../../../ai-quickstart/rendered-scan.mjs'
import { floristKit } from './florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './memory-site.mjs'

export const HUMAN_SHA = createHash('sha256').update('invented human quickstart').digest('hex')
export const groups = (failures = []) => ({
  groups: [{ name: 'text-overflow', status: failures.length ? 'red' : 'green', failures }]
})
export const overflow = (selector) => ({
  group: 'text-overflow',
  width: 390,
  level: 'block',
  reason: 'cut',
  selector
})

/** The SEO items every page needs, so the marker pages carry no finding of their own. */
const headOf = (p) =>
  '<head><title>Petal ' +
  p.pageType +
  '</title><meta name="description" content="x"><meta property="og:image" content="' +
  ORIGIN +
  '/og.png"><meta name="viewport" content="width=device-width"><link rel="icon" href="/icon.png"></head>'

export function floristGate({
  reset = true,
  faults = {},
  quality = groups(),
  secrets,
  write,
  kitHashes,
  inputs
} = {}) {
  const kit = floristKit()
  const site = memorySiteOf(kit, { ...faults, reset })
  const lines = []
  const order = []
  const stamp =
    (name, fn) =>
    async (...a) => {
      order.push(name)
      return fn(...a)
    }
  const fetchPage = site.fetch
  const session = {
    origin: ORIGIN,
    write:
      write ??
      (async (built) => ({ ...(await site.write(built)), plugin: { start: '1.0.0', end: '1.0.0' } })),
    pages: site.pages,
    fetch: async (url) => (url.endsWith('/icon.png') ? { status: 200, html: '' } : fetchPage(url)),
    hide: site.hide,
    show: site.show,
    off: site.off,
    back: site.back
  }
  const out = mkdtempSync(path.join(tmpdir(), 'release-gate-'))
  const input = {
    kit,
    archive: { names: [], files: new Map() },
    kitHashes: kitHashes ?? { 'mapping.json': createHash('sha256').update('{}').digest('hex') },
    adapter: { exemptions: EXEMPTIONS },
    iconLibrary: { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] },
    tryWrite: memoryTryWrite(kit),
    corpus: demoCorpus({ fixedTexts: ['Our spring tulip sale'] }),
    widths: [1440],
    themes: ['light'],
    site: session,
    reset: site.reset,
    secrets: stamp('secrets', async () => secrets ?? { status: 'passed', findings: [] }),
    control: stamp('control', async () => ({
      human: { status: 'run', findings: 3, pages: 1 },
      blank: blankControlOf([]),
      quality: { from: 'measured', ...groups([overflow('.hero h1')]) }
    })),
    quality: stamp('quality', async () => quality),
    render: stamp('render', async (pages) => {
      const out = []
      for (const p of pages) {
        const { status, html } = await site.fetch(p.url)
        const page = html.replace('<html>', '<html lang="en">' + headOf(p)).replace(/<nav>.*?<\/nav>/, '')
        out.push({
          ...p,
          theme: 'light',
          width: 1440,
          status,
          html: page,
          // The memory pages print the block titles and the page names around the markers: only what carries a
          // marker is read (and not the menu items' internal links), so the marker test is clean and the verdict can pass.
          observations: observationsFromHtml(page)
            .filter((o) => codesIn(String(o.value)).length && !String(o.value).includes('option='))
            .map((o) => ({ ...o, visible: true }))
        })
      }
      return out
    }),
    probes: [...PROBE_CATALOGUE, ...JOOMLA_PROBES],
    inputs: inputs ?? { humanQuickstart: { sha256: HUMAN_SHA } },
    scanRecord: async () => ({ findings: [], gitleaks: { status: 'ran' } }),
    out,
    log: (l) => lines.push(l)
  }
  return { input, site, out, lines, order, done: () => rmSync(out, { recursive: true, force: true }) }
}
