/**
 * BRAND-1, BRAND-2, BRAND-3 of the Template Design System Readiness check (ADR 0031 revision 02/11/2026):
 * is the template ready for the brand step, which paints a site in the customer's own colours and, inside
 * the bands the slot contract keeps, hands only the accent role to the brand accent. The case that asked for
 * them: JA Boxing's hero, call-to-action band and video card kept the template's red #f44141 under a brand
 * accent (02/11/2026). Worth-fixing, so a template not yet graded for brand mode never holds Publish.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { checkRelease, RULES } from '../src/lib/template-design-system-readiness/index.js'
import { dsSeverityOf, summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'

/** A minimal ustar tar.gz of `files` (path -> text). */
function tarGz(/** @type {Record<string, string>} */ files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

/** A Joomla release of JA Boxing 1.0.8 (contract joomla-ja-boxing-modes) whose template stylesheet is `css`. */
function boxing(/** @type {string} */ css, /** @type {Record<string, string>} */ more = {}) {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Boxing',
    version: '1.0.8',
    cms: '6.0.3',
    template: 'ja_boxing',
    install: {
      webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  /** @type {Record<string, Buffer>} */
  const all = {
    'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
    'd.sql.gz': gzipSync('CREATE TABLE `#__modules` (`id` int NOT NULL);'),
    'w.tar.gz': tarGz({ 'templates/ja_boxing/css/template.css': css, ...more })
  }
  const tag = 'quickstart/ja-boxing/j6'
  return {
    tag,
    where: `memory:${tag}`,
    names: async () => Object.keys(all).sort(),
    read: async (/** @type {string} */ name) => (name in all ? all[name] : null)
  }
}

const run = async (/** @type {string} */ css, /** @type {Record<string, string>} */ more = {}) =>
  (await checkRelease(boxing(css, more), { only: ['BRAND-1', 'BRAND-2', 'BRAND-3'] })).results

const of = (/** @type {any[]} */ results, /** @type {string} */ id) => results.find((r) => r.id === id)

test('the three rules are registered for Joomla and worth-fixing', () => {
  for (const id of ['BRAND-1', 'BRAND-2', 'BRAND-3']) {
    const rule = RULES.find((r) => r.id === id)
    assert.ok(rule, id)
    assert.deepEqual(rule.platforms, ['joomla'])
    assert.equal(dsSeverityOf(id).group, 'worth-fixing', id)
  }
  assert.equal(RULES.find((r) => r.id === 'BRAND-2')?.owner, 'template')
})

test('BRAND-1/2 pass when the kept bands read the accent through the slot', async () => {
  const r = await run(
    '.t4-hero .btn{background-color:var(--ds-c-accent, #f44141)}.acm-cta a{color:var(--ds-c-accent-text, #f44141)}'
  )
  assert.equal(of(r, 'BRAND-1').status, 'pass')
  assert.equal(of(r, 'BRAND-2').status, 'pass')
})

test('BRAND-1 fails on a literal accent in a kept band the contract does not paint, and names it', async () => {
  const r = await run('.t4-hero .hero-desc a{color:#F44141}.page-title{color:#f44141}')
  const b1 = of(r, 'BRAND-1')
  assert.equal(b1.status, 'fail')
  assert.deepEqual(b1.details, ['.t4-hero .hero-desc a { color: #f44141 } in css/template.css'])
  assert.match(b1.fix, /"paint"/)
})

test('BRAND-1 passes a literal the contract already hands to the brand accent (bands.<band>.paint)', async () => {
  // the base contract paints `.hero-title span` of .t4-hero with the accent role
  const r = await run('.t4-hero .hero-title span{color:#f44141}')
  assert.equal(of(r, 'BRAND-1').status, 'pass')
})

test('a right-to-left mirror of a block sheet is counted once, through its left-to-right sheet', async () => {
  const rule = '.acm-cta .x{border-color:#f44141}'
  const r = await run('', {
    'templates/ja_boxing/acm/cta/css/style.css': rule,
    'templates/ja_boxing/acm/cta/css/rtl/style.css': rule
  })
  assert.deepEqual(of(r, 'BRAND-1').details, [
    '.acm-cta .x { border-color: #f44141 } in acm/cta/css/style.css'
  ])
})

test('a band kept whole (keepWhole) is not graded', async () => {
  const r = await run('.features-item .title{color:#f44141}')
  assert.equal(of(r, 'BRAND-1').status, 'pass')
})

test('BRAND-2 fails on the accent in a gradient or an inline picture of a kept band', async () => {
  const r = await run(
    '.acm-cta .bg{background-image:linear-gradient(90deg,#f44141,#000)}.t4-hero i{background:url("data:image/svg+xml,%3Csvg fill=%23f44141/%3E")}'
  )
  const b2 = of(r, 'BRAND-2')
  assert.equal(b2.status, 'fail')
  assert.equal(b2.details.length, 2)
  assert.equal(of(r, 'BRAND-1').status, 'pass')
})

test('BRAND-3 is live-only with the brand-mode measuring command, and counts in neither number', async () => {
  const results = await run('')
  const b3 = of(results, 'BRAND-3')
  assert.equal(b3.status, 'live-only')
  assert.match(
    b3.fix,
    /flow\.mjs --cms joomla --template joomla-ja-boxing-modes .* brand:121111--a78f45 brand:121111--042515/
  )
  const s = summarizeDsReadiness({ results })
  assert.equal(s.total, 2)
  assert.equal(s.passed, 2)
  assert.equal(s.mustFix.length, 0)
  assert.deepEqual(s.unmeasured, [])
})

test('a failing BRAND-1 shows on the step as worth-fixing, never must-fix', async () => {
  const s = summarizeDsReadiness({ results: await run('.acm-cta .x{border-color:#f44141}') })
  assert.deepEqual(
    s.worthFixing.map((x) => x.rule),
    ['BRAND-1']
  )
  assert.equal(s.mustFix.length, 0)
  assert.equal(s.grade, 'B')
})
