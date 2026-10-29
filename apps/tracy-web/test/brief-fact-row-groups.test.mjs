// COO decision (spec TracyHQ/tracy#189, items 14 and 15): a fact row group under an offering card ("LEVEL / All ages", "WHERE
// / Across town") is shown complete or taken off, on every page that renders it. A row shows a real label and a real value,
// or the row goes; a group with no row left goes; the removal reaches every rendered instance (the list page, the offering's
// own page, a home card); and the final check refuses any empty fact frame a visitor still sees (an icon-only box is empty).
// Two made-up trades: a pottery studio and a dental clinic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withHonestyPins } from '../src/sites/brief-engines/copy-pin-priority.js'
import { emptyFrameSelectors } from '../src/sites/brief-engines/empty-frames.js'
import { planRecordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'
import { writeOutsideMap } from '../src/sites/brief-engines/joomla-outside-map.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const TRADES = [
  {
    trade: 'pottery studio',
    list: '/courses',
    item: 'wheel-throwing',
    box: 'course-meta',
    title: 'Wheel throwing'
  },
  {
    trade: 'dental clinic',
    list: '/treatments',
    item: 'whitening',
    box: 'treatment-facts',
    title: 'Whitening'
  }
]

/** A card of a list or an offering page: its title, its words, and a fact box whose rows print empty. */
const card = (t, rows) =>
  `<article class="card-layout"><div class="item-inner"><h2><a href="/index.php${t.list}/${t.item}">${t.title}</a></h2>` +
  `<p>Friendly sessions for every visitor.</p><div class="${t.box}"><div class="info-inner"><div class="row">` +
  `${'<div class="col"><div class="item-info"><div class="item-inner"> </div></div></div>'.repeat(rows)}` +
  '</div></div></div></div></article>'
const page = (body, head = '') =>
  `<html><head>${head}</head><body><main id="content">${body}</main></body></html>`

/** The fact slots of one offering card: two rows of a label and a value, in a JSON list of the article's parameters. */
const factSlots = (entity) =>
  [0, 1].flatMap((row) =>
    ['label', 'value'].map((field) => ({
      key: `${entity}.${row}-${field}`,
      entity,
      column: 'attribs',
      type: 'text',
      role: 'offering.schedule',
      sample: field === 'label' ? 'MONDAY' : '9:00 AM',
      maxCharacters: 40,
      jsonPath: ['facts', `facts${row}`, field],
      group: { id: `${entity}.offering`, item: 0, kind: 'service' }
    }))
  )

for (const t of TRADES) {
  test(`${t.trade}: the head block hides the empty fact box on the offering's own page, not only on the kept list`, async () => {
    const read = []
    const writes = []
    const html = {
      '/': page(`<a href="/index.php${t.list}">${t.title}</a>`),
      [`/index.php${t.list}`]: page(card(t, 2)),
      [`/index.php${t.list}/${t.item}`]: page(`<section id="detail">${card(t, 1)}</section>`)
    }
    await writeOutsideMap({
      siteKey: 'fictional',
      applyId: 'facts',
      headOnly: true,
      plan: {
        outside: {},
        pages: [
          { path: '/', decision: 'keep' },
          { path: t.list, decision: 'keep' }
        ]
      },
      contentMap: { slots: [] },
      note: () => {},
      reader: {
        text: async (path) => {
          read.push(path)
          if (!(path in html)) throw new Error('HTTP 404')
          return html[path]
        }
      },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return {
            ok: true,
            items: params.kind === 'templateStyle' ? [{ id: 1, params: { snippet_close_head: '' } }] : []
          }
        if (action === 'content.update') writes.push(params.fields)
        return { ok: true }
      }
    })
    assert.ok(
      read.includes(`/index.php${t.list}/${t.item}`),
      'the offering page the kept list links to is read'
    )
    const head = writes.map((w) => JSON.parse(w.params).snippet_close_head).join('\n')
    for (const path of [`/index.php${t.list}`, `/index.php${t.list}/${t.item}`])
      for (const selector of emptyFrameSelectors(html[path]))
        assert.ok(head.includes(selector), `${path}: ${selector} is hidden by the head block`)
  })

  test(`${t.trade}: the final check refuses an empty fact frame a visitor sees, and passes once the head block hides it`, async () => {
    const body = card(t, 2)
    const check = (html) =>
      runLeftoverCheck({
        readPage: async (path) => (path === '/' ? { status: 200, html } : { status: 404, html: '' }),
        check: () => ({ pass: true, findings: [], counts: {} }),
        contentMap: { slots: [] },
        brief: {}
      })
    const plain = await check(page(body))
    assert.deepEqual(
      plain.findings.filter((f) => f.kind === 'empty-frame'),
      [],
      'a site with no frame net (a plain demo build) is not judged'
    )
    // The build's head block is there, but written from another layout: it misses this one.
    const shown = await check(
      page(body, '<style data-tracy-leftovers>#elsewhere{display:none !important}</style>')
    )
    assert.equal(shown.pass, false)
    assert.ok(
      shown.findings.some((f) => f.kind === 'empty-frame' && f.page === '/' && f.found.includes(t.box)),
      JSON.stringify(shown.findings)
    )
    const css = `${emptyFrameSelectors(page(body)).join(',\n')}{display:none !important}`
    const hidden = await check(page(body, `<style data-tracy-leftovers>${css}</style>`))
    assert.deepEqual(
      hidden.findings.filter((f) => f.kind === 'empty-frame'),
      []
    )
    assert.equal(hidden.pass, true, JSON.stringify(hidden.findings))
  })

  test(`${t.trade}: a fact row is emptied whole when one of its cells is refused, never a label without its value`, async () => {
    const entity = 'article-41'
    const slots = factSlots(entity)
    const attribs = {
      facts: {
        facts0: { label: 'LEVEL', value: 'All ages' },
        facts1: { label: 'WHERE', value: 'Across town' }
      }
    }
    const made = await planRecordSteps({
      siteKey: 'fictional',
      ctx: { siteKey: 'fictional', email: 'owner@example.test', note() {} },
      woContent: { sitePlanFor: async () => ({ honesty: { blanks: [], hide: [], records: [] } }) },
      // The site refused the second row's value: its label must not stand alone.
      extraBlanks: [slots[3]],
      slots,
      apply: async ({ action, params }) =>
        action === 'content.get' && params.kind === 'article'
          ? { ok: true, item: { id: 41, attribs: JSON.stringify(attribs) } }
          : { ok: true, items: [] }
    })
    const written = JSON.parse(made.steps.find((s) => s.kind === 'article').fields.attribs)
    assert.deepEqual(written.facts.facts1, { label: '', value: '' })
    assert.deepEqual(written.facts.facts0, { label: 'LEVEL', value: 'All ages' })
  })

  test(`${t.trade}: the plan's sourced fact rows win over the contract's empty pins (the rows are written, not emptied)`, () => {
    const slots = factSlots('article-52')
    const contentMap = { slots }
    const pins = Object.fromEntries(slots.map((s) => [s.key, '']))
    const sources = Object.fromEntries(slots.map((s) => [s.key, 'placeholder']))
    const values = {
      'article-52.0-label': { value: 'LEVEL', reason: 'brief-fact-row' },
      'article-52.0-value': { value: 'All ages', reason: 'brief-fact-row' }
    }
    const out = withHonestyPins({ pins, sources, roles: {} }, contentMap, {
      values,
      blanks: [slots[2], slots[3]],
      records: []
    })
    assert.equal(out.pins['article-52.0-label'], 'LEVEL')
    assert.equal(out.pins['article-52.0-value'], 'All ages')
    assert.equal('article-52.1-label' in out.pins, false)
  })
}
