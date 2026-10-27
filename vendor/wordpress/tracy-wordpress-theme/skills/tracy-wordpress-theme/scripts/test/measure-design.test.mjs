import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const cli = join(root, 'scripts/measure-design.mjs')
const fixtureDesign = () => {
  const variants = ['desktop', 'mobile'].flatMap((size) => ['light', 'dark'].map((mode) => ({ id: `${size}-${mode}`, mode, width: size === 'desktop' ? 1440 : 390, height: size === 'desktop' ? 900 : 844 })))
  const rules = [
    ['heading', 'typography', 'h1', { fontSize: '40px', fontWeight: '700' }],
    ['colors', 'color', 'body', { color: '#ffffff' }],
    ['spacing', 'layout', 'main', { paddingLeft: '16px' }],
    ['button', 'component', 'button', { borderRadius: '12px' }]
  ].map(([id, category, selector, styles]) => ({ id, category, selector, styles: Object.fromEntries(variants.map((v) => [v.id, styles])) }))
  return {
    schemaVersion: 1, id: 'example', revision: 1,
    source: { reference: 'https://example.test/style-guide', inspiration: 'example', version: '1', capturedAt: '2026-01-01T00:00:00Z' },
    theme: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' },
    variants, tokens: Object.fromEntries(variants.map((v) => [v.id, { '--space': '16px' }])), rules,
    coverage: [{ selector: 'h1', properties: ['fontSize', 'fontWeight'] }],
    pages: ['home', 'about'].map((id) => ({ id, url: `https://example.test/${id}`, expectedUrl: `https://example.test/${id}`, identity: 'main', rules: rules.map((r) => r.id), requiredRules: ['heading'] })),
    pilotPages: ['home'], exceptions: [], pending: []
  }
}
const html = (body, failMode = false, lateNavigation = '') => `<!doctype html><html><head><style>
html[data-theme=dark] { color-scheme: dark } .agree { font-size: 18px } .vary { color: black } html[data-theme=dark] .vary { color: white } .page-two .vary { color: blue }
</style>${failMode ? '<script>document.documentElement.setAttribute("data-theme", "light")</script>' : ''}${lateNavigation}</head><body><main>${body}</main></body></html>`

async function fixture(t, configure = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'measure-design-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname
    if (pathname === '/redirect/') {
      res.writeHead(302, { Location: '/one/' }).end()
      return
    }
    if (pathname === '/delayed/') {
      res.end(html('<h1>Title</h1><p class="agree">A</p><i class="vary">x</i>', false, '<script>setTimeout(() => location.replace("/other/"), 50)</script>'))
      return
    }
    const body = pathname === '/one/' ? '<h1>Title</h1><p class="agree">A</p><p class="agree">B</p><i class="vary">x</i>' : '<div class="page-two"><h1>Title</h1><p class="agree">C</p><i class="vary">x</i></div>'
    res.end(html(body, pathname === '/two/'))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.address().port}`
  const contract = fixtureDesign()
  contract.pages.forEach((p, i) => {
    p.url = `${origin}/${i ? 'two' : 'one'}/`
    p.expectedUrl = p.url
  })
  configure(contract, origin)
  const spec = join(dir, 'spec')
  mkdirSync(spec)
  writeFileSync(join(spec, 'design-contract.json'), JSON.stringify(contract))
  const plan = (rules) => {
    const file = join(dir, 'rules.json')
    writeFileSync(file, JSON.stringify({ rules }))
    return file
  }
  const run = (rules, out = join(dir, 'out')) => new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, '--spec', spec, '--source-site', origin, '--plan', plan(rules), '--out', out], { encoding: 'utf8' })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
  return { dir, spec, contract, run, origin }
}

test('measures per-property agreement, records disagreement/missing/mode failure, and validates candidate', async (t) => {
  const f = await fixture(t)
  const result = await f.run([
    { id: 'agreement', category: 'typography', selector: '.agree', pages: ['home'], properties: ['font-size'] },
    { id: 'disagreement', category: 'color', selector: '.vary', pages: ['home', 'about'], properties: ['color'] },
    { id: 'missing', category: 'layout', selector: '.absent', pages: ['home'], properties: ['margin'] },
    { id: 'wrong-mode', category: 'component', selector: '.agree', pages: ['about'], properties: ['font-size'] }
  ])
  assert.equal(result.status, 0, result.stderr)
  const out = join(f.dir, 'out')
  const observations = JSON.parse(readFileSync(join(out, 'observations.json')))
  const candidate = JSON.parse(readFileSync(join(out, 'design-contract.candidate.json')))
  const agree = observations.rules.find((r) => r.id === 'agreement')
  assert.equal(agree.results['desktop-light']['font-size'].status, 'measured')
  assert.equal(agree.results['desktop-light']['font-size'].value, '18px')
  assert.equal(observations.rules.find((r) => r.id === 'disagreement').results['desktop-light'].color.status, 'unmeasured')
  assert.deepEqual([...new Set(observations.rules.find((r) => r.id === 'disagreement').results['desktop-light'].color.values.map((x) => x.value))], ['rgb(0, 0, 0)', 'rgb(0, 0, 255)'])
  assert.match(JSON.stringify(observations.rules.find((r) => r.id === 'missing').results['desktop-light'].margin.reason), /no matching visible elements/)
  assert.match(observations.pages.find((p) => p.page === 'about' && p.variant === 'desktop-dark').reason, /mode/i)
  assert.ok(candidate.rules.some((r) => r.id === 'agreement'))
  assert.ok(!candidate.rules.some((r) => r.id === 'disagreement'))
  assert.equal(readFileSync(join(f.spec, 'design-contract.json'), 'utf8'), JSON.stringify(f.contract))
})

test('rejects duplicate rule ids, unknown pages and empty properties', async (t) => {
  const f = await fixture(t)
  for (const rules of [
    [{ id: 'x', category: 'color', selector: 'p', pages: ['home'], properties: ['color'] }, { id: 'x', category: 'color', selector: 'p', pages: ['home'], properties: ['color'] }],
    [{ id: 'x', category: 'color', selector: 'p', pages: ['unknown'], properties: ['color'] }],
    [{ id: 'x', category: 'color', selector: 'p', pages: ['home'], properties: [] }],
    [{ id: 'heading', category: 'typography', selector: '.different-selector', pages: ['home'], properties: ['font-size'] }]
  ]) assert.notEqual((await f.run(rules)).status, 0)
})

test('leaves an existing rule unchanged when a referencing contract page was not planned', async (t) => {
  const f = await fixture(t)
  const original = structuredClone(f.contract.rules.find((r) => r.id === 'heading'))
  const result = await f.run([{ id: 'heading', category: 'typography', selector: 'h1', pages: ['home'], properties: ['fontSize'] }])
  assert.equal(result.status, 0, result.stderr)
  const out = join(f.dir, 'out')
  const candidate = JSON.parse(readFileSync(join(out, 'design-contract.candidate.json')))
  const observations = JSON.parse(readFileSync(join(out, 'observations.json')))
  assert.deepEqual(candidate.rules.find((r) => r.id === 'heading'), original)
  assert.deepEqual(observations.rules.find((r) => r.id === 'heading').candidateUpdate.pagesOutsidePlan, ['about'])
  assert.match(observations.rules.find((r) => r.id === 'heading').candidateUpdate.reason, /about/)
})

test('writes a candidate and exits successfully when pending design notes remain', async (t) => {
  const f = await fixture(t, (contract) => { contract.pending.push('no component rule could be read from the T4 sheets') })
  const result = await f.run([{ id: 'partial-type', category: 'typography', selector: '.agree', pages: ['home'], properties: ['font-size'] }])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /validation not yet valid: pending: no component rule could be read from the T4 sheets/)
  const observations = JSON.parse(readFileSync(join(f.dir, 'out/observations.json')))
  assert.deepEqual(observations.validation, {
    valid: false,
    error: 'Resolve pending design decisions before validation',
    notYetValid: true,
    pending: ['no component rule could be read from the T4 sheets'],
    missingCategories: []
  })
  assert.ok(JSON.parse(readFileSync(join(f.dir, 'out/design-contract.candidate.json'))))
})

test('writes an invalid candidate but fails when validation finds an unrelated contract error', async (t) => {
  const f = await fixture(t, (contract) => { delete contract.tokens['desktop-light'] })
  const result = await f.run([{ id: 'partial-type', category: 'typography', selector: '.agree', pages: ['home'], properties: ['font-size'] }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /candidate failed design-contract validation/)
  assert.ok(JSON.parse(readFileSync(join(f.dir, 'out/design-contract.candidate.json'))))
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'out/observations.json'))).validation.valid, false)
})

test('records redirect and missing identity selector as unmeasured page variants', async (t) => {
  const f = await fixture(t, (contract, origin) => {
    contract.pages[0].url = `${origin}/redirect/`
    contract.pages[0].expectedUrl = contract.pages[0].url
    contract.pages[1].identity = '.missing-identity'
  })
  const result = await f.run([{ id: 'probe-type', category: 'typography', selector: '.agree', pages: ['home', 'about'], properties: ['font-size'] }])
  assert.equal(result.status, 0, result.stderr)
  const observations = JSON.parse(readFileSync(join(f.dir, 'out/observations.json')))
  const redirected = observations.pages.find((p) => p.page === 'home' && p.variant === 'desktop-light')
  const missingIdentity = observations.pages.find((p) => p.page === 'about' && p.variant === 'desktop-light')
  assert.match(redirected.reason, /redirected to .*\/one\//)
  assert.match(missingIdentity.reason, /identity selector not found: \.missing-identity/)
  assert.equal(observations.rules[0].results['desktop-light']['font-size'].status, 'unmeasured')
})

test('records delayed client-side navigation before capture as unmeasured', async (t) => {
  const f = await fixture(t, (contract, origin) => {
    contract.pages[0].url = `${origin}/delayed/`
    contract.pages[0].expectedUrl = contract.pages[0].url
  })
  const result = await f.run([{ id: 'late-type', category: 'typography', selector: '.agree', pages: ['home'], properties: ['font-size'] }])
  assert.equal(result.status, 0, result.stderr)
  const observations = JSON.parse(readFileSync(join(f.dir, 'out/observations.json')))
  const pageCase = observations.pages.find((p) => p.page === 'home' && p.variant === 'desktop-light')
  assert.equal(pageCase.probe.url, `${f.origin}/other/`)
  assert.match(pageCase.reason, /navigated to .*\/other\/ before capture/)
  assert.equal(observations.rules[0].results['desktop-light']['font-size'].status, 'unmeasured')
})
