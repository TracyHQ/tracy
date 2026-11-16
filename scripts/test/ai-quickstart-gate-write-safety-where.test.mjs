// Where a site stop is searched and what a finding names (ticket #586, review 5 Y2 and Z1), on a hand-made build of an
// invented bakery site and a site in memory. One value (the call to action address) is stored in two operations; the
// site refuses it in the second. The finding must name the operation the site refused, not the first one the plain
// build stores it in (Y2). Probes that replace the whole value carry no code, so the pass plan cannot say where they
// went: the plain plan can, and a place the plain plan never stores in the refused operation is no suspect of its stop
// (Z1). With no site step left, the stop is still named by its one probed place.
import assert from 'node:assert/strict'
import test from 'node:test'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'

const PROBES = PROBE_CATALOGUE.filter((p) =>
  ['link-quote', 'empty', 'number-zero', 'single-space'].includes(p.id)
)
const REFUSED_OP = 'contract:store:module-2'
const order = {
  pages: [
    {
      id: 'home',
      blocks: [
        { id: 'home-b3', block: 'block-2' },
        { id: 'home-b4', block: 'block-1' },
        { id: 'home-b5', block: 'block-3' }
      ]
    }
  ]
}
const CODES = ['AAC', 'AAD', 'AAE', 'AAF', 'AAG', 'AAH']

/** The invented build: one address in two operations, six paragraphs in a third. */
function build(options) {
  const cta = options.factOf({
    what: 'fact',
    kind: 'contact.cta_url',
    value: 'https://qxaab.example/',
    code: 'AAB'
  })
  const paragraphs = CODES.map((code, i) =>
    options.textOf({ page: 'home', key: 'home-b5/paragraph-' + i, code, kind: 'paragraph', limit: 200 })
  )
  const writePlan = {
    ops: [
      {
        key: 'copy:home.home-b4',
        values: [
          {
            value: cta,
            entry: 'home.home-b4.cta-url',
            loc: { entity: 'module-1', column: 'params', slot: 'module-1.0' }
          }
        ]
      },
      {
        key: REFUSED_OP,
        values: [
          {
            value: cta,
            entry: 'home.home-b3.button-link',
            loc: { entity: 'module-2', column: 'content', slot: 'module-2.0' }
          }
        ]
      },
      {
        key: 'copy:home.home-b5',
        values: paragraphs.map((value, i) => ({
          value,
          entry: 'home.home-b5.paragraph-' + i,
          loc: { entity: 'module-3', column: 'params', slot: 'module-3.' + i }
        }))
      }
    ]
  }
  return Promise.resolve({ writePlan, order, gaps: [] })
}

/** A site that refuses an address holding a double quote in the second operation only, as a contract slot does. */
function siteOf() {
  let writes = 0
  return {
    get writes() {
      return writes
    },
    reset: async () => {},
    write: async (built) => {
      writes += 1
      const op = built.writePlan.ops.find((o) => o.key === REFUSED_OP)
      if (op.values.some((v) => v.value.includes('"')))
        return {
          report: {
            status: 'stopped',
            code: 'redo_failed',
            details: { op: REFUSED_OP, cause: 'contract_failed' }
          }
        }
      return { report: { status: 'done' }, record: {} }
    },
    pages: async () => [],
    fetch: async () => ({ status: 200, html: '' })
  }
}

test('Y2 and Z1: a stop names the operation the site refused and is searched only among the places stored there', async () => {
  const site = siteOf()
  const result = await writeSafety({ build, site, probes: PROBES, limits: { ...LIMITS, steps: 0 } })
  const refused = result.findings.filter((f) => f.kind === 'door_refused')
  assert.equal(refused.length, 1, JSON.stringify(result.findings))
  const [f] = refused
  assert.equal(f.place, 'fact:contact.cta_url#0')
  assert.equal(f.probe, 'link-quote')
  assert.equal(f.evidence, 'named_alone')
  // The operation, block and field the site refused (Y2), not the first place the plain build stores the address.
  assert.equal(f.location.op, REFUSED_OP)
  assert.equal(f.location.slot, 'module-2.0')
  assert.equal(f.block, 'home-b3')
  assert.equal(f.storeBlock, 'block-2')
  assert.equal(f.field, 'button-link')
  // No whole value probe of the paragraphs, stored elsewhere by the plain plan, was a suspect (Z1).
  assert.equal(result.findings.filter((x) => x.kind === 'stop_not_traced').length, 0)
  assert.equal(result.ends.untested.filter((u) => /untraced/.test(u.why)).length, 0)
  assert.equal(result.steps, 0)
})

// Review 5 Z2: a probe a page runs is judged on that page, not isolated by trials: the finding says so and names the
// page, and the location is the one that page prints.
test('Z2: a finding judged on a page says it was seen there and names that page', async () => {
  const tag = PROBE_CATALOGUE.find((p) => p.id === 'tag')
  const site = {
    reset: async () => {},
    write: async (built) => ({ report: { status: 'done' }, record: { built } }),
    pages: async (built) => [{ pageType: 'home', url: 'http://site.invalid/', built }],
    fetch: async () => ({ status: 200, html: '' })
  }
  let last = null
  site.write = async (built) => {
    last = built
    return { report: { status: 'done' }, record: {} }
  }
  // The home page prints the paragraphs as stored: a tag typed as words becomes a live element.
  site.fetch = async () => ({
    status: 200,
    html:
      '<html><body>' +
      last.writePlan.ops
        .flatMap((o) => o.values)
        .map((v) => '<p>' + v.value + '</p>')
        .join('') +
      '</body></html>'
  })
  const result = await writeSafety({ build, site, probes: [tag], limits: { ...LIMITS, steps: 0 } })
  const injected = result.findings.filter((f) => f.kind === 'markup_injected')
  assert.ok(injected.length > 0)
  for (const f of injected) {
    assert.equal(f.evidence, 'page')
    assert.equal(f.judgedOn, 'home')
    assert.equal(f.page, 'home')
  }
})

// Run 6: an article operation writes the item's name into its title and, derived from it, its alias. The alias is a
// stored location with no plan entry; a read back that names the alias column must still name the page, block and
// field of the name, so a location with an entry wins over one without among those the failure names.
test('Y2 (run 6): a read back at a derived column still names the entry the operation writes', async () => {
  const { storedFor, nameOf } = await import('../ai-quickstart/gate/write-safety-places.mjs')
  const entries = [
    {
      op: 'article:class-3',
      entry: 'home.home-b6.class-3.name',
      loc: { entity: 'article-9', column: 'title', slot: 'article-9.4' }
    },
    { op: 'article:class-3', entry: null, loc: { entity: 'article:class-3', column: 'alias' } }
  ]
  const stored = storedFor(entries, { op: 'article:class-3', column: 'alias' })
  const named = nameOf(stored, order)
  assert.equal(named.page, 'home')
  assert.equal(named.field, 'name')
  assert.equal(named.location.op, 'article:class-3')
})
