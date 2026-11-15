// The marker test as one function (ticket #585) on an invented florist kit: the real marker build, a memory site in
// place of a real one and pages rendered from that site's state as HTML with no browser. This proves the scorer is
// not tied to one template: the same `runGate` that `gate.mjs` runs on a real site with a browser reads these pages,
// names each leak by its true source in an invented blank site archive, groups it with a fix class, and keeps the
// record not passed while the measurements of the next ticket are not run.
import assert from 'node:assert/strict'
import test from 'node:test'
import { memorySite } from '../../packages/wo/website-opportunities/domain/write-order-memory-site.mjs'
import {
  FLORIST_TEMPLATE,
  floristBlockStore,
  floristPageRecipes
} from '../../packages/wo/website-opportunities/test/fixtures/write-order/florist-store.mjs'
import { EXEMPTIONS } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { codesIn } from '../ai-quickstart/gate/marker-codec.mjs'
import { runGate } from '../ai-quickstart/gate/run-gate.mjs'
import { demoCorpus, observationsFromHtml } from '../ai-quickstart/rendered-scan.mjs'

const ORIGIN = 'http://florist.example'
const kit = () => ({
  ref: 'example-petal/j6@1.0.0',
  blockStore: floristBlockStore(),
  pageRecipes: floristPageRecipes(),
  template: { slug: FLORIST_TEMPLATE.slug, version: FLORIST_TEMPLATE.version },
  mapping: {
    overrides: { language: [{ key: 'TPL_PETAL_FOLLOW', keep: 'kept: the label of the social row' }] }
  }
})
// The invented blank site archive: what the template and the CMS bring with them.
const archive = {
  names: ['templates/petal/favicon.ico'],
  files: new Map([
    ['language/en-GB/joomla.ini', 'JLIB_HTML_READ_MORE="Read more"\n'],
    ['language/en-GB/tpl_petal.ini', 'TPL_PETAL_FOLLOW="Follow us"\n'],
    ['templates/petal/html/layouts/footer.php', '<p class="note">Fresh flowers every morning</p>'],
    ['installation/sql/mysql/custom.sql', "INSERT INTO `#__content` VALUES (1,'Our spring tulip sale');"]
  ])
}
const strings = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.entries(value)
          .filter(([k]) => k !== 'page')
          .flatMap(([, v]) => strings(v))
      : []
// One page of HTML from the memory site's state, inside an invented template frame.
const htmlOf = (page) => {
  const words = page.blocks.flatMap((b) =>
    [
      b.fields,
      ...(b.items ?? []).map((i) => i.fields),
      ...(b.lists ?? []).flatMap((l) => l.rows.map((r) => r.fields))
    ]
      .flatMap(strings)
      .filter((v) => !/^https?:/.test(v))
  )
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<html><head><title>${esc(page.seo?.title ?? '')}</title>
</head><body><img src="/templates/petal/favicon.ico" alt="">
${words.map((w, i) => `<p id="Mod${i + 1}">${esc(w)}</p>`).join('\n')}
<p><a href="/more">Read more</a></p><p>Follow us</p><p>Fresh flowers every morning</p>
<p>Our spring tulip sale</p><p>A sentence nobody wrote</p><mark>qqqqq</mark></body></html>`
}

test('runGate on an invented kit with a memory site and no browser: every leak named, grouped, not passed', async () => {
  const lines = []
  const result = await runGate({
    kit: kit(),
    archive,
    adapter: { exemptions: EXEMPTIONS },
    iconLibrary: { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] },
    corpus: demoCorpus({ fixedTexts: ['Our spring tulip sale'] }),
    widths: [1440],
    themes: ['light'],
    log: (l) => lines.push(l),
    controls: async () => ({
      human: { status: 'run', findings: 3, pages: 1 },
      blank: { status: 'run', findings: 0, pages: 1 }
    }),
    site: async ({ built }) => {
      const { report, site } = await memorySite().apply(built.order)
      return {
        origin: ORIGIN,
        real: { report, record: { ids: {}, paths: {} }, plugin: { start: '1.0.0', end: '1.0.0' } },
        pages: site.pages.map((p) => ({ pageType: p.id, path: p.home ? '' : p.id, html: htmlOf(p) })),
        siteValues: new Map()
      }
    },
    render: async (pages) =>
      pages.map((p) => ({
        ...p,
        theme: 'light',
        width: 1440,
        status: 200,
        observations: observationsFromHtml(p.html).map((o) => ({ ...o, visible: true }))
      }))
  })
  const { record, groups, classified } = result
  assert.ok(lines.some((l) => l.startsWith('universe ')))
  assert.ok(lines.includes('control blank: run, 0 finding(s)'))
  // The markers the build wrote are read on the pages and are no finding.
  assert.ok(classified.seen.size > 0)
  for (const f of classified.findings) assert.equal(codesIn(f.value).length, 0, f.value)
  // Each frame text is one group, named by its true source and given the fix it most likely needs.
  const of = (value) => groups.find((g) => g.value === value)
  assert.deepEqual(
    [of('Read more').source.class, of('Read more').source.key, of('Read more').fixClass],
    ['language', 'JLIB_HTML_READ_MORE', 'kit_declare_keep']
  )
  assert.equal(of('Read more').count, result.renders.length)
  assert.deepEqual(
    [of('Fresh flowers every morning').source.class, of('Fresh flowers every morning').fixClass],
    ['literal', 'template_patch']
  )
  assert.deepEqual(
    [of('Our spring tulip sale').source.class, of('Our spring tulip sale').fixClass],
    ['data', 'build_gap']
  )
  assert.equal(of('A sentence nobody wrote').source.class, 'unknown')
  assert.equal(of('/templates/petal/favicon.ico').fixClass, 'kit_write')
  // The kit's kept key and the marker filler are exemptions, never findings.
  assert.equal(of('Follow us'), undefined)
  assert.equal(of('qqqqq'), undefined)
  assert.ok(classified.exempt.some((e) => e.why.startsWith('kept_by_kit')))
  assert.ok(classified.exempt.some((e) => e.why === 'marker_filler'))
  // The demo scan finds the demo sentence; the record is not passed and says what was not run.
  assert.ok(record.demoScan.findings.length > 0)
  assert.equal(record.verdict.controls, 'right')
  assert.equal(record.verdict.pass, false)
  assert.deepEqual(record.verdict.notRun, ['minItems', 'linkCheck'])
  assert.equal(record.markerTest.groupCounts.unknown, 1)
})
