/**
 * The layout gaps E2 of PR 2 found by eye on fleet01 after PR 1 (14/10/2026), judged on probe data cut
 * from real Add site previews under Moxie (`fixtures/preview-detectors/<kind>.json`, preview-check.mjs
 * PREVIEW_DATA=1, no script as the frame runs):
 * - squeezed-container (LAYOUT-1): JA Sensei Joomla's hero container, 1296 px wide on the template's
 *   page, 603 px wearing Moxie;
 * - button-overlap (LAYOUT-1): JA Symphony Joomla's Tickets / Rspv pills wrapped onto two rows;
 * - shrunk-block (LAYOUT-2): a large link, banner or card the system shrank, beyond the buttons
 *   button-size reads;
 * - see-through-header (HEADER-1): JA Social II Joomla's fixed header with no ground;
 * - layout-drift (LAYOUT-3): JA Kinetic WordPress and Joomla's footer newsletter row, one line on the
 *   template's page, wrapped under each system (Akemi, 14/10/2026).
 * Each fails its broken samples and passes clean ones. No exemption list.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'

const KINDS = ['squeezed-container', 'button-overlap', 'shrunk-block', 'see-through-header', 'layout-drift']
const fixture = (/** @type {string} */ kind) =>
  JSON.parse(readFileSync(new URL(`./fixtures/preview-detectors/${kind}.json`, import.meta.url), 'utf8'))
const run = async (/** @type {string} */ kind, /** @type {any} */ s) => {
  const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
  return m.detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' },
    systemColours: s.systemColours,
    scheme: 'light'
  })
}

for (const kind of KINDS)
  test(`${kind}: fails on every broken sample of a real preview, passes on a clean one`, async () => {
    const f = fixture(kind)
    assert.ok(f.broken.length && f.clean.length, 'both kinds of sample')
    for (const s of f.broken) {
      const r = await run(kind, s)
      assert.ok(r.count > 0, `broken: ${s.source}`)
      assert.equal(r.count, r.findings.length)
      for (const x of r.findings) assert.ok(String(x.at ?? '').trim(), 'each finding says where')
    }
    for (const s of f.clean) assert.equal((await run(kind, s)).count, 0, `clean: ${s.source}`)
  })

test("squeezed-container: JA Sensei's hero container lost more than half its width", async () => {
  for (const s of fixture('squeezed-container').broken.filter((x) => /ja-sensei/.test(x.source))) {
    const r = await run('squeezed-container', s)
    assert.ok(
      r.findings.some((x) => /squeezed from 1296 to 603px wide/.test(x.why)),
      s.source
    )
  }
})

test('squeezed-container: a width kept, a narrow block', async () => {
  const { squeezed } = await import('../scripts/preview-detectors/squeezed-container.mjs')
  assert.match(squeezed({ w: 603 }, { w: 1296 }), /1296 to 603/)
  assert.equal(squeezed({ w: 1100 }, { w: 1296 }), null, 'kept most of its width')
  assert.equal(squeezed({ w: 200 }, { w: 500 }), null, 'never a wide block')
})

test('button-overlap: a wrap with no gap, an overlap, a row that already wrapped', async () => {
  const { collides } = await import('../scripts/preview-detectors/button-overlap.mjs')
  const row = { a: { x: 0, y: 0, w: 76, h: 40 }, b: { x: 84, y: 0, w: 63, h: 40 } }
  const stacked = { a: { x: 0, y: 0, w: 90, h: 37 }, b: { x: 15, y: 37, w: 75, h: 37 } }
  assert.match(collides(stacked, row), /wrapped onto two rows with 0px/)
  assert.equal(collides(stacked, stacked), null, 'the template stacks them too')
  const spaced = { a: { x: 0, y: 0, w: 90, h: 37 }, b: { x: 0, y: 49, w: 75, h: 37 } }
  assert.equal(collides(spaced, row), null, 'wrapped with room between them')
  const over = { a: { x: 0, y: 0, w: 90, h: 37 }, b: { x: 40, y: 10, w: 75, h: 37 } }
  assert.match(collides(over, row), /overlap by/)
})

test('shrunk-block: a banner reduced to a pill, a block that kept its height', async () => {
  const { shrank } = await import('../scripts/preview-detectors/shrunk-block.mjs')
  const was = { w: 1260, h: 186, radius: 0 }
  assert.match(shrank({ w: 1164, h: 56, radius: 28 }, was), /1260×186 to 1164×56px, rounded into a pill/)
  assert.equal(shrank({ w: 1260, h: 150, radius: 0 }, was), null)
  assert.equal(shrank({ w: 100, h: 20 }, { w: 200, h: 60 }), null, 'never large')
})

test('shrunk-block: a low strip blown up into a tall band, a padded section the rhythm changed', async () => {
  const { grew } = await import('../scripts/preview-detectors/shrunk-block.mjs')
  // JA Kinetic Joomla's logo strip under Moxie (14/10/2026)
  assert.match(grew({ w: 1440, h: 290 }, { w: 1440, h: 90 }), /grew from 1440×90 to 1440×290px/)
  assert.equal(grew({ w: 1440, h: 120 }, { w: 1440, h: 90 }), null, 'a little taller')
  assert.equal(grew({ w: 1440, h: 600 }, { w: 1440, h: 400 }), null, 'a section the template pads')
  assert.equal(grew({ w: 300, h: 300 }, { w: 300, h: 60 }), null, 'never a narrow block')
})

test('see-through-header: a fixed header with no ground counts, one with its fill does not', async () => {
  const { detect } = await import('../scripts/preview-detectors/see-through-header.mjs')
  const h = (/** @type {number} */ ground) => ({
    path: 'header:1',
    at: 'header',
    position: 'fixed',
    w: 1440,
    h: 98,
    ground,
    text: 'Site'
  })
  const r = detect({ worn: { data: [h(0)] }, plain: { data: [h(1)] } })
  assert.equal(r.count, 1)
  assert.equal(r.findings[0].by, 'system')
  assert.equal(detect({ worn: { data: [h(1)] }, plain: { data: [h(1)] } }).count, 0)
})

test('each layout kind has its registry line, its rule in the check, a severity with a fix, and loads', async () => {
  const ids = RULES.map((r) => r.id)
  for (const kind of KINDS) {
    const k = PREVIEW_KINDS[kind]
    assert.ok(k?.rule && k.what && k.fix, kind)
    assert.ok(BUILT_SITE_RULES.includes(k.rule), `${kind}: ${k.rule} in BUILT_SITE_RULES`)
    assert.ok(ids.includes(k.rule), `${kind}: ${k.rule} is a rule of the check`)
    const s = DS_RULE_SEVERITY[k.rule]
    assert.ok(s && ['must-fix', 'worth-fixing'].includes(s.group) && String(s.fix ?? '').trim(), k.rule)
    assert.ok(
      DETECTORS.some((d) => d.kind === kind),
      `${kind} is loaded by index.mjs`
    )
    const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
    assert.doesNotThrow(() => new Function(`return ${m.probe}`), kind)
  }
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(DS_RULE_SEVERITY['LAYOUT-1'].group, 'must-fix')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(DS_RULE_SEVERITY['LAYOUT-2'].group, 'must-fix')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(DS_RULE_SEVERITY['HEADER-1'].group, 'worth-fixing')
  // test-quality: contract Akemi's rule (14/10/2026): a system that breaks the template's layout holds Publish
  assert.equal(DS_RULE_SEVERITY['LAYOUT-3'].group, 'must-fix')
})

test("layout-drift: JA Kinetic's footer row wrapped under three systems on both CMSs, one line once fixed", async () => {
  const f = fixture('layout-drift')
  for (const cms of ['wp7', 'j6']) {
    const broken = f.broken.filter((/** @type {any} */ x) => x.source.includes(`ja-kinetic/${cms}`))
    const systems = new Set(broken.map((/** @type {any} */ x) => x.source.split(' ')[1]))
    assert.ok(systems.size >= 3, `${cms}: three systems or more`)
    for (const s of broken) {
      const r = await run('layout-drift', s)
      assert.ok(
        r.findings.some((/** @type {any} */ x) => /wraps onto 2|went from 130×45 to 130×3\dpx/.test(x.why)),
        s.source
      )
    }
  }
})

test('layout-drift: a wrap, a new line, an order, a column count, a slide, a control resized', async () => {
  const { drifted, linesOf, slid } = await import('../scripts/preview-detectors/layout-drift.mjs')
  const k = (/** @type {number} */ x, /** @type {number} */ y, w = 100, h = 40) => ({ x, y, w, h })
  const row = { w: 1176, kids: [k(0, 0, 900, 48), k(916, 1, 260, 45)] }
  assert.deepEqual(linesOf(row.kids), { count: 1, line: [0, 0] })
  // the form dropped under the description and went left (JA Kinetic's footer)
  assert.match(
    drifted({ w: 1176, kids: [k(0, 0, 1176, 48), k(0, 58, 706, 45)] }, row),
    /one line .* wraps onto 2/
  )
  assert.equal(drifted(row, row), null, 'the same row')
  // a narrower container (the system's width): the form keeps to the right edge, the text to the left
  assert.equal(drifted({ w: 980, kids: [k(0, 0, 704, 48), k(720, 1, 260, 45)] }, row), null)
  // the two children swapped sides
  assert.match(drifted({ w: 1176, kids: [k(276, 0, 900, 48), k(0, 1, 260, 45)] }, row), /changed order/)
  // a grid of four went to three
  const grid = (/** @type {number} */ cols) => ({
    grid: true,
    cols,
    w: 1200,
    kids: [k(0, 0), k(300, 0), k(600, 0)]
  })
  assert.match(drifted(grid(3), grid(4)), /4 columns .* 3 wearing/)
  // a child slid along its row past max(24 px, 15% of the row)
  const three = { w: 600, kids: [k(0, 0), k(250, 0), k(500, 0)] }
  assert.equal(drifted({ w: 600, kids: [k(0, 0), k(330, 0), k(500, 0)] }, three), null, '80 px is within 90')
  assert.match(
    drifted({ w: 600, kids: [k(0, 0), k(350, 0), k(500, 0)] }, three),
    /child 2 moved 100px .*tolerance 90px/
  )
  assert.equal(slid(k(10, 0), k(0, 0), 600, 600), 10)
  // a form's button went flat beside its field (Moxie's 7 px button padding on JA Kinetic Joomla)
  const form = { form: true, w: 1176, kids: [k(916, 1, 260, 45), k(1046, 1, 130, 45)] }
  assert.match(
    drifted({ ...form, kids: [k(916, 1, 260, 45), k(1046, 7, 130, 33)] }, form),
    /130×45 to 130×33px/
  )
  assert.equal(drifted({ ...form, kids: [k(916, 1, 260, 45), k(1046, 2, 130, 43)] }, form), null, 'two px')
  assert.equal(drifted({ w: 1176, kids: [k(0, 0)] }, row), null, 'another number of children is not judged')
  // a line of words (Tracy Base EmDash's post meta) re-wraps in another face: not a drift; a row with a
  // control in it (the footer newsletter row) still is
  const meta = { w: 300, words: true, kids: [k(0, 0, 120, 20), k(0, 24, 160, 20), k(0, 48, 110, 20)] }
  assert.equal(
    drifted({ ...meta, kids: [k(0, 0, 110, 20), k(126, 0, 150, 20), k(0, 24, 100, 20)] }, meta),
    null
  )
  assert.match(
    drifted(
      { w: 300, kids: [k(0, 0, 110, 20), k(126, 0, 150, 20), k(0, 24, 100, 20)] },
      { ...meta, words: undefined }
    ),
    /3 lines .* 2 wearing/
  )
})

// Tracy Apple Joomla's post meta (16/10/2026): "By Lawrence" follows a 24 px avatar in a wrapping meta line, which
// re-wraps in another face like the words it is (3 lines on the template's card, 2 in Moxie's); a picture taller
// than a line still keeps a row from being a line of words, and a hidden one never counts.
test('layout-drift: an avatar beside the words keeps a line of words; a picture or a shown control does not', async () => {
  const { wordlessShown, INLINE_PICTURE_PX } = await import('../scripts/preview-detectors/layout-drift.mjs')
  const el = (/** @type {string} */ tag, /** @type {number} */ height, display = 'inline') => ({
    tag,
    display,
    matches: (/** @type {string} */ sel) => sel.split(',').some((s) => s.trim() === tag),
    getBoundingClientRect: () => ({ height })
  })
  const style = (/** @type {any} */ e) => ({ display: e.display })
  assert.equal(wordlessShown(el('img', 24), style), false)
  assert.equal(wordlessShown(el('img', INLINE_PICTURE_PX), style), false)
  assert.equal(wordlessShown(el('img', 120), style), true)
  assert.equal(wordlessShown(el('button', 20), style), true)
  assert.equal(wordlessShown(el('img', 120, 'none'), style), false)
})
