/**
 * The write door answers with design drift (ADR 0023, "Addendum 30/09"): after a write that can
 * change the site's look went through, the page it touched is measured against the design the site
 * wears, and the findings ride on the `ok: true` answer — `warnings` + `next`, the LENGTH_RATIO shape
 * (ADR 0022). Never a refusal, never ok:false, never a blocked write.
 *
 *   node --test packages/tools/tracy-site-tools/test/design-drift.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DRIFT_BUDGET_MS, lookWrite, withDesignDrift } from '../src/host/design-drift.mjs'
import { WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'

test('which writes are measured: the look surfaces always, a record only when it carries a literal colour or font', () => {
  // A style switch and the look surfaces of each CMS: always, on the home page.
  assert.deepEqual(lookWrite('theme.style', { style: 'apple' }, 'wordpress'), {
    page: '/',
    why: 'theme.style'
  })
  // Global styles: known by what this conversation read of the post, or by the flag in its text.
  assert.equal(
    lookWrite('content.update', { kind: 'post', id: 9, fields: { post_content: '{}' } }, 'wordpress', {
      postType: 'wp_global_styles'
    })?.page,
    '/'
  )
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'post', id: 9, fields: { post_content: '{"isGlobalStylesUserThemeJSON":true}' } },
      'wordpress'
    )?.page,
    '/'
  )
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'post', id: 11, fields: { post_content: 'p{margin:0}' } },
      'wordpress',
      { postType: 'custom_css' }
    )?.page,
    '/'
  )
  assert.equal(
    lookWrite('content.update', { kind: 'templateStyle', id: 3, fields: { params: '{"x":1}' } }, 'joomla')
      ?.page,
    '/'
  )
  // A button made magenta in a page body: that page, by its id.
  const button =
    '<!-- wp:button {"style":{"color":{"background":"#ff00ff"}}} --><div class="wp-block-button"><a class="wp-block-button__link">Go</a></div><!-- /wp:button -->'
  assert.deepEqual(
    lookWrite('content.update', { kind: 'post', id: 42, fields: { post_content: button } }, 'wordpress'),
    {
      page: '/?p=42',
      why: 'a literal colour or font'
    }
  )
  // …or by its blocks (W2): the block markup sent is what is judged.
  assert.equal(
    lookWrite('content.update', { kind: 'post', id: 42, blocks: { 3: button } }, 'wordpress')?.page,
    '/?p=42'
  )
  // A header part with an inline style: every page shows it, so the home page.
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'templatePart', key: 'header', fields: { content: '<p style="color:rgb(1,2,3)">x</p>' } },
      'wordpress'
    )?.page,
    '/'
  )
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'article', id: 7, fields: { introtext: '<p style="font-family: Comic Sans MS">x</p>' } },
      'joomla'
    )?.page,
    '/index.php?option=com_content&view=article&id=7'
  )
  // A Joomla batch: one look item is enough.
  assert.equal(
    lookWrite(
      'content.batch',
      {
        items: [
          { kind: 'article', id: 1, fields: { title: 'Hi' } },
          { kind: 'module', id: 5, fields: { content: '<div style="background:#123456">' } }
        ]
      },
      'joomla'
    )?.page,
    '/'
  )
})

test('which writes are NOT measured: words, presets, pictures, installs, undo — nothing a literal colour rides on', () => {
  assert.equal(
    lookWrite('content.update', { kind: 'post', id: 42, fields: { post_title: 'New title' } }, 'wordpress'),
    null
  )
  // A preset colour is the theme's palette, which IS the system: it cannot drift.
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'post', id: 42, fields: { post_content: '<!-- wp:button {"backgroundColor":"primary"} /-->' } },
      'wordpress'
    ),
    null
  )
  // An anchor and an HTML entity are not colours.
  assert.equal(
    lookWrite(
      'content.update',
      { kind: 'post', id: 42, fields: { post_content: '<a href="#contact">x</a> &#123; <a href="#add">' } },
      'wordpress'
    ),
    null
  )
  for (const action of [
    'content.replace',
    'content.contract',
    'media.upload',
    'media.draw',
    'content.delete',
    'content.language',
    'apply.revert',
    'plugin.install',
    'theme.install',
    'theme.activate',
    'content.read'
  ])
    assert.equal(
      lookWrite(action, { operation: 'apply', changes: { 'hero.title': '#ff00ff' } }, 'wordpress'),
      null,
      action
    )
  assert.equal(
    lookWrite('content.update', { kind: 'option', key: 'blogname', fields: { value: 'Shop' } }, 'wordpress'),
    null
  )
})

const drifted = {
  checked: true,
  score: 97,
  page: '/?p=42',
  browser: 'site',
  findings: {
    baseline: false,
    warnings: [
      {
        code: 'OFF_PALETTE_COLOR',
        prop: 'background-color',
        value: 'rgb(255, 0, 255)',
        band: 'off',
        nearest: { token: '--accent', distance: 200 },
        count: 1,
        where: ['a.wp-block-button__link']
      }
    ],
    existing: 0,
    next: 'Drifted from the design system: rgb(255, 0, 255) on a.wp-block-button__link is off the palette — write var(--accent) if that is the colour meant. Fix what is real, then check again.'
  }
}

test('a look write with drift: still ok:true, the warning and the score ride on it, and next says what drifted', async () => {
  const answer = { ok: true, kind: 'post', id: 42, applyId: 'wp-1', next: WRITE_RECEIPT_NEXT }
  let asked = null
  const out = await withDesignDrift({
    answer,
    write: { page: '/?p=42', why: 'a literal colour or font' },
    measure: async (page) => {
      asked = page
      return drifted
    }
  })
  assert.equal(asked, '/?p=42')
  assert.equal(out.ok, true)
  assert.equal(out.designCheck, 'measured')
  assert.equal(out.designScore, 97)
  assert.equal(out.designPage, '/?p=42')
  assert.equal(out.warnings.length, 1)
  assert.equal(out.warnings[0].code, 'OFF_PALETTE_COLOR')
  assert.match(out.next, /^Written\. Drifted from the design system: rgb\(255, 0, 255\)/)
  assert.match(out.next, /apply\.revert/)
})

test('LENGTH_RATIO already on the answer: both kinds of warning stay, and both sentences reach next', async () => {
  const answer = {
    ok: true,
    applyId: 'c-1',
    warnings: [{ code: 'LENGTH_RATIO', slot: 'hero.title', ratio: 2, sample: 20, value: 40 }],
    next: "Written. Outside the quickstart's length band: hero.title."
  }
  const out = await withDesignDrift({
    answer,
    write: { page: '/', why: 'theme.style' },
    measure: async () => drifted
  })
  assert.deepEqual(
    out.warnings.map((w) => w.code),
    ['LENGTH_RATIO', 'OFF_PALETTE_COLOR']
  )
  assert.match(out.next, /length band/)
  assert.match(out.next, /Drifted from the design system/)
})

test('nothing new drifted: measured, the score and existing count ride along, next stays the receipt', async () => {
  const answer = { ok: true, id: 42, next: WRITE_RECEIPT_NEXT }
  const out = await withDesignDrift({
    answer,
    write: { page: '/', why: 'theme.style' },
    measure: async () => ({ ...drifted, findings: { baseline: true, warnings: [], existing: 2, next: null } })
  })
  assert.equal(out.designCheck, 'measured')
  assert.equal(out.designExisting, 2)
  assert.equal(out.warnings, undefined)
  assert.equal(out.next, WRITE_RECEIPT_NEXT)
})

test('no design bound, no browser: still ok:true, designCheck "skipped" and why — the write is not touched otherwise', async () => {
  const answer = { ok: true, id: 42, next: WRITE_RECEIPT_NEXT }
  for (const why of [
    'this site wears no design system the catalogue can name',
    'no browser in this site container, and none in dsh'
  ]) {
    const out = await withDesignDrift({
      answer,
      write: { page: '/', why: 'theme.style' },
      measure: async () => ({ checked: false, why })
    })
    assert.equal(out.ok, true)
    assert.equal(out.designCheck, 'skipped')
    assert.equal(out.designWhy, why)
    assert.equal(out.next, WRITE_RECEIPT_NEXT)
    assert.equal(out.warnings, undefined)
  }
})

test('a measure past the budget: skipped with the budget named, never waited on', async () => {
  const answer = { ok: true, id: 42 }
  const started = Date.now()
  const out = await withDesignDrift({
    answer,
    write: { page: '/', why: 'theme.style' },
    budgetMs: 30,
    measure: () => new Promise((r) => setTimeout(() => r(drifted), 5_000).unref())
  })
  assert.ok(Date.now() - started < 1_000)
  assert.equal(out.designCheck, 'skipped')
  assert.match(out.designWhy, /30 ms/)
  assert.ok(DRIFT_BUDGET_MS <= 15_000)
})

test('a measure that throws: skipped, the write stays ok', async () => {
  const out = await withDesignDrift({
    answer: { ok: true },
    write: { page: '/', why: 'theme.style' },
    measure: async () => {
      throw new Error('exec died')
    }
  })
  assert.equal(out.ok, true)
  assert.equal(out.designCheck, 'skipped')
  assert.match(out.designWhy, /exec died/)
})

test('a refused or unknown write, or no look write, is never measured', async () => {
  let calls = 0
  const measure = async () => {
    calls += 1
    return drifted
  }
  const refused = { ok: false, code: 'BODY_SHRINK' }
  assert.equal(await withDesignDrift({ answer: refused, write: { page: '/', why: 'x' }, measure }), refused)
  const ok = { ok: true }
  assert.equal(await withDesignDrift({ answer: ok, write: null, measure }), ok)
  assert.equal(calls, 0)
})

test('judged from the probe: the last report counts as the baseline only when it is the same page', async () => {
  const { driftOfProbe } = await import('../src/host/design-drift.mjs')
  const design = { id: 'apple', source: 'catalog', tokens: { '--bg': '#ffffff', '--accent': '#0071e3' } }
  const probe = {
    href: 'http://127.0.0.1/?p=42',
    seen: 3,
    samples: [
      { prop: 'background-color', value: 'rgb(255, 0, 255)', count: 1, where: ['a.wp-block-button__link'] },
      { prop: 'color', value: 'rgb(120, 120, 120)', count: 2, where: ['hr'] }
    ]
  }
  const beforeHere = {
    url: 'http://s.tracy.test:8080/?p=42',
    colors: { offenders: [{ prop: 'color', value: 'rgb(120, 120, 120)', band: 'off', count: 2 }] },
    fonts: { offenders: [] }
  }
  const same = driftOfProbe({ design, page: '/?p=42', probe, browser: 'site', before: beforeHere })
  assert.equal(same.measured.checked, true)
  assert.equal(same.measured.findings.baseline, true)
  assert.deepEqual(
    same.measured.findings.warnings.map((w) => w.value),
    ['rgb(255, 0, 255)']
  )
  assert.equal(same.report.url, 'http://127.0.0.1/?p=42')
  const other = driftOfProbe({ design, page: '/?p=42', probe, before: { ...beforeHere, url: 'http://s/' } })
  assert.equal(other.measured.findings.baseline, false)
  assert.equal(other.measured.findings.warnings.length, 2)
})

test('a revert to the page as it was before any write is not new: the first report of the page is a baseline beside the last', async () => {
  const { driftOfProbe, pageOrigins } = await import('../src/host/design-drift.mjs')
  const design = { id: 'business', source: 'catalog', tokens: { '--bg': '#ffffff', '--accent': '#0071e3' } }
  const coral = { prop: 'color', value: 'rgb(240, 134, 90)', count: 1, where: ['h1.tb-hero__title'] }
  const pink = { ...coral, value: 'rgb(255, 0, 170)' }
  const probe = (/** @type {any[]} */ samples) => ({ href: 'http://127.0.0.1/', seen: 1, samples })
  const reportOf = (/** @type {any[]} */ samples, url = 'http://s.tracy.test/') => ({
    url,
    colors: { offenders: samples.map((x) => ({ ...x, band: 'off' })) },
    fonts: { offenders: [] }
  })
  const origins = pageOrigins()
  // The build's own report of the home page is on disk when the first look write is measured.
  const shipped = reportOf([coral])
  const first = origins.origin('s1|site', 'http://127.0.0.1/', shipped)
  assert.equal(first, shipped)
  const madePink = driftOfProbe({ design, page: '/', probe: probe([pink]), before: shipped, origin: first })
  assert.deepEqual(
    madePink.measured.findings.warnings.map((w) => w.value),
    ['rgb(255, 0, 170)']
  )
  // Later measures of the page keep the first report, whatever the last one was.
  const again = origins.origin('s1|site', 'http://127.0.0.1/', madePink.report)
  assert.equal(again, shipped)
  const reverted = driftOfProbe({
    design,
    page: '/',
    probe: probe([coral]),
    before: madePink.report,
    origin: again
  })
  assert.deepEqual(reverted.measured.findings.warnings, [])
  assert.equal(reverted.measured.findings.existing, 1)
  // Another page, or a first report of another page: no origin — the last measure alone decides.
  assert.equal(origins.origin('s1|site', 'http://127.0.0.1/?p=4', shipped), null)
  assert.equal(origins.origin('s1|site', 'http://127.0.0.1/?p=4', reportOf([], 'http://s/?p=4')), null)
  assert.equal(origins.origin('s2|site', 'http://127.0.0.1/', null), null)
})

// ── The second road: a look edited OUTSIDE tracy_site (a file tool, bash, EmDash's rebuild) ─────────
// Measured 30/09 on the stand (dfinwp1): asked for a magenta hero button, the agent tried a block
// attribute through tracy_site (no paint: the button block skips serialising colours), undid it, and
// made the change with the file tool in the theme's sections.css — a road the write door never sees.

test('an edit outside tracy_site marks the look when it writes a stylesheet, a theme.json or a token file — or rebuilds EmDash', async () => {
  const { lookEdit } = await import('../src/host/design-drift.mjs')
  const ok = { isError: false }
  const css = '/site/dfinwp1/.webroot/wp-content/themes/wp-tracy-business/assets/css/sections.css'
  assert.equal(lookEdit('edit', { file_path: css, old_string: 'a', new_string: 'b' }, ok), css)
  assert.equal(
    lookEdit('write', { file_path: '/site/x/.webroot/wp-content/themes/t/theme.json', content: '{}' }, ok),
    '/site/x/.webroot/wp-content/themes/t/theme.json'
  )
  assert.equal(lookEdit('bash', { command: `sed -i 's/#da5a2a/#ff00ff/' ${css}` }, ok), css)
  assert.equal(
    lookEdit('bash', { command: 'cd templates/tpl_tracy && php tools/t4-scss.php' }, ok),
    'tools/t4-scss.php'
  )
  assert.equal(
    lookEdit(
      'tracy_site_build_emdash',
      { action: 'request', operation: 'site.rebuild' },
      { isError: false, value: { ok: true } }
    ),
    'site.rebuild'
  )
  // dsh may hand the arguments over as the JSON text the model wrote.
  assert.equal(lookEdit('bash', JSON.stringify({ command: `cat >> ${css} <<'EOF'\na{}\nEOF` }), ok), css)
  // Reading, a failed edit, a PHP template, a rebuild that failed: nothing to measure.
  assert.equal(lookEdit('read', { file_path: css }, ok), null)
  assert.equal(lookEdit('bash', { command: `grep -n button ${css} 2>&1 | head` }, ok), null)
  assert.equal(lookEdit('bash', { command: `cat ${css} > /dev/null` }, ok), null)
  // Measured 30/09 (final stand acceptance): a `>` inside a quoted sed expression and a compiler
  // that is only READ are not writes (the full table: test/shell-look-write.test.mjs).
  assert.equal(
    lookEdit('bash', { command: `grep -rn x /app/src --include=*.css | sed 's/:.*var(/ -> var(/'` }, ok),
    null
  )
  assert.equal(lookEdit('bash', { command: 'sed -n 1,30p tools/t4-scss.php' }, ok), null)
  assert.equal(
    lookEdit('edit', { file_path: css, old_string: 'a', new_string: 'b' }, { isError: true }),
    null
  )
  assert.equal(
    lookEdit('edit', { file_path: '/site/x/.webroot/wp-content/themes/t/functions.php' }, ok),
    null
  )
  assert.equal(
    lookEdit(
      'tracy_site_build_emdash',
      { action: 'request', operation: 'site.rebuild' },
      { isError: false, value: { ok: false } }
    ),
    null
  )
})

test('the notice after such an edit: the drift and its next when something new drifted, one line when nothing did, the reason when skipped', async () => {
  const { driftNotice } = await import('../src/host/design-drift.mjs')
  const bad = driftNotice(drifted, 'sections.css')
  assert.match(bad.text, /^Design check after your look edit \(sections\.css\), page \/\?p=42: score 97\./)
  assert.match(
    bad.text,
    /OFF_PALETTE_COLOR background-color rgb\(255, 0, 255\) ×1 on a\.wp-block-button__link \(nearest --accent\)/
  )
  assert.match(bad.text, /Drifted from the design system/)
  assert.match(bad.summary, /1 new/)
  const clean = driftNotice(
    { ...drifted, findings: { baseline: true, warnings: [], existing: 3, next: null } },
    'sections.css'
  )
  assert.match(clean.text, /no new drift; 3 older finding\(s\) on the page are not from this edit/)
  const skipped = driftNotice(
    { checked: false, why: 'no browser in this site container, and none in dsh' },
    'site.rebuild'
  )
  assert.match(
    skipped.text,
    /not measured \(no browser in this site container, and none in dsh\): run tracy_design_check/
  )
})
