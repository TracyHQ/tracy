// The code a place gets in a pass is not its plain code (ticket #586, review 6 U1). The marker writer takes a new code
// on every ask, so a pass in which the page writer's copy check sent a field back numbers every later field otherwise
// than the plain build. A probe that replaces the whole value carries no code, so it must be placed where the plain
// build stores the place itself (found by the place key's own plain code), never where the plain build stores the
// pass's code, which is another place's. The invented bakery build, with a code registry, on a site in memory.
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerText } from '../ai-quickstart/gate/marker-plan.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'

const probe = (id) => PROBE_CATALOGUE.find((p) => p.id === id)
const order = { pages: [{ id: 'home', blocks: [{ id: 'home-b1', block: 'block-1' }] }] }
const FIELDS = ['lead', 'count', 'note', 'tail']
const OP = (field) => 'contract:store:module-' + field

/** Codes in the order asked, as the marker registry gives them: AAA, AAB, ... */
const codeOf = (n) => 'AA' + String.fromCharCode(65 + n)

/**
 * The invented build. Each field is asked once; the copy check sends `lead` back whenever its value is not the plain
 * marker, and the writer asks again, which takes a new code: every later field then gets a code one further on than in
 * the plain build. Each field is stored by its own operation.
 */
function buildOf() {
  return (options) => {
    let n = 0
    const values = {}
    for (const key of FIELDS) {
      const f = { page: 'home', key: 'home-b1/' + key, kind: 'heading', limit: 60 }
      let value = options.textOf({ ...f, code: codeOf(n++) })
      if (key === 'lead' && value !== markerText({ code: codeOf(n - 1) })) {
        // The copy check sends the field back: asked again, with a new code.
        value = options.textOf({ ...f, code: codeOf(n++), rewrite: true, problems: ['copy_check'] })
      }
      values[key] = value
    }
    const writePlan = {
      ops: FIELDS.map((key) => ({
        key: OP(key),
        values: [
          {
            value: values[key],
            entry: 'home.home-b1.' + key,
            loc: { entity: 'module-' + key, column: 'content', slot: 'module-' + key + '.0' }
          }
        ]
      }))
    }
    return Promise.resolve({ writePlan, order, gaps: [] })
  }
}

/** A site that stores what it is sent; `refuse(op, value)` makes it stop at that operation. */
function siteOf(refuse = () => false) {
  let last = null
  return {
    reset: async () => {},
    write: async (built) => {
      last = built
      for (const op of built.writePlan.ops)
        for (const v of op.values)
          if (refuse(op.key, v.value))
            return {
              report: {
                status: 'stopped',
                code: 'redo_failed',
                details: { op: op.key, cause: 'contract_failed' }
              }
            }
      return { report: { status: 'done' }, record: {} }
    },
    pages: async () => [{ pageType: 'home', url: 'http://bakery.invalid/' }],
    fetch: async () => ({
      status: 200,
      html:
        '<html><body>' +
        (last?.writePlan.ops ?? []).map((o) => '<h2>' + o.values[0].value + '</h2>').join('') +
        '</body></html>'
    })
  }
}

// `lead` is first and takes the first probe, `count` second and takes the second: one pass, rotated by position.
const PROBES = [probe('tag'), probe('number-zero')]

test('U1: a whole value probe after a sent-back field is found where the plain build stores its own place', async () => {
  const result = await writeSafety({
    build: buildOf(),
    site: siteOf(),
    probes: PROBES,
    limits: { ...LIMITS, passes: 1, steps: 0 }
  })
  const row = result.ledger.find((r) => r.place === 'writer:home/home-b1/count' && r.probe === 'number-zero')
  assert.ok(row, JSON.stringify(result.ledger))
  // The site holds "0" exactly at the place's own slot: written, not `not_written`.
  assert.equal(row.status, 'written', JSON.stringify(row))
  assert.equal(row.reached, true)
  // And the sent-back field is a build refusal of its own, named alone.
  assert.ok(
    result.findings.some(
      (f) =>
        f.place === 'writer:home/home-b1/lead' &&
        f.kind === 'refused_by_build' &&
        f.evidence === 'named_alone'
    )
  )
})

test('U1: a stop whose operation stores exactly one probed place names that place, with no site step', async () => {
  // The site refuses "0" in the `count` operation only.
  const site = siteOf((op, value) => op === OP('count') && value === '0')
  const result = await writeSafety({
    build: buildOf(),
    site,
    probes: PROBES,
    limits: { ...LIMITS, passes: 1, steps: 0 }
  })
  const refused = result.findings.filter((f) => f.kind === 'door_refused')
  assert.equal(refused.length, 1, JSON.stringify(result.findings))
  assert.equal(refused[0].place, 'writer:home/home-b1/count')
  assert.equal(refused[0].probe, 'number-zero')
  assert.equal(refused[0].evidence, 'named_alone')
  assert.equal(refused[0].field, 'count')
  assert.equal(result.findings.filter((f) => f.kind === 'stop_not_traced').length, 0)
  assert.equal(result.steps, 0)
})
