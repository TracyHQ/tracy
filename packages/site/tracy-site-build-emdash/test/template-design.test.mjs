import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readDesign, writeDesign } from '@tracy/site-build-core/design-record'
import { paletteOf } from '@tracy/site-build-core/design-check'
import { recordTemplateLook, templateTokens } from '../src/host/template-design.mjs'

const cms = new URL('../../../cms/', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, cms), 'utf8')
const business = {
  css: read('tracy-emdash-theme-business/src/styles/tokens.css'),
  fonts: read('tracy-emdash-theme-business/src/fonts.json')
}

test('a template sheet resolves to values: var() chains followed, light before dark', () => {
  const tokens = templateTokens(business.css, business.fonts)
  assert.ok(tokens)
  assert.equal(tokens['--color-forest'], '#14483a')
  // --color-link is var(--color-forest) in the light block; the dark block re-points it later and loses.
  assert.equal(tokens['--color-link'], '#14483a')
  for (const [name, value] of Object.entries(tokens)) {
    assert.doesNotMatch(value, /var\(/, `${name} still names a variable`)
    assert.notEqual(value, 'initial', `${name} is Tailwind's reset, not a colour`)
  }
})

test("an Astro font variable resolves through the template's fonts.json to the family it loads", () => {
  const tokens = templateTokens(business.css, business.fonts)
  assert.match(tokens['--font-sans'], /^"Archivo", system-ui/)
  const { fonts } = paletteOf(tokens)
  assert.ok(fonts.some((f) => f.family === 'archivo' || f.family === 'Archivo'))
})

test('every template Tracy ships resolves to a palette the check can judge by', () => {
  for (const t of ['base', 'business', 'saas']) {
    let fonts = '[]'
    try {
      fonts = read(`tracy-emdash-theme-${t}/src/fonts.json`)
    } catch {}
    const tokens = templateTokens(read(`tracy-emdash-theme-${t}/src/styles/tokens.css`), fonts)
    const palette = paletteOf(tokens)
    assert.ok(palette.colors.length >= 8, `${t}: ${palette.colors.length} colours`)
  }
})

test('a sheet that declares nothing answers null, not an empty palette', () => {
  assert.equal(templateTokens('/* nothing */', '[]'), null)
  assert.equal(templateTokens('', 'not json'), null)
})

test("a done check turns 'the template's own look' into the template's named look, read from the site", async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  writeDesign(root, {
    schemaVersion: 'tracy-site-design/v1',
    id: null,
    source: 'template',
    name: null,
    bound: false,
    platform: 'emdash',
    manifestDesign: null,
    tokens: null,
    tokensFrom: null,
    writtenAt: 'x',
    wroteBy: 'build:j1',
    allow: [{ prop: 'color', value: 'rgb(1, 2, 3)' }]
  })
  const read = async (file) => (file.endsWith('tokens.css') ? business.css : business.fonts)
  const record = await recordTemplateLook(root, {
    template: { id: 'tracy-business', label: 'Tracy Business', version: '1.5.1' },
    read,
    wroteBy: 'build:j1'
  })
  assert.equal(record?.source, 'quickstart')
  assert.equal(record?.id, 'tracy-business')
  assert.equal(record?.name, 'Tracy Business')
  assert.equal(record?.bound, true)
  assert.equal(record?.tokensFrom, 'site:/app/src/styles/tokens.css')
  assert.deepEqual(record?.allow, [{ prop: 'color', value: 'rgb(1, 2, 3)' }])
  assert.deepEqual(readDesign(root), record)
})

test('a catalogue or brand binding is left alone, and a site that cannot be read keeps its record', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  const base = {
    schemaVersion: 'tracy-site-design/v1',
    platform: 'emdash',
    manifestDesign: null,
    tokens: null,
    tokensFrom: null,
    writtenAt: 'x',
    wroteBy: 'b'
  }
  writeDesign(root, { ...base, id: 'apple', source: 'catalog', name: 'Apple', bound: true })
  const template = { id: 'tracy-business', label: 'Tracy Business', version: '1.5.1' }
  assert.equal(
    await recordTemplateLook(root, { template, read: async () => business.css, wroteBy: 'b' }),
    null
  )
  assert.equal(readDesign(root)?.id, 'apple')

  writeDesign(root, { ...base, id: null, source: 'template', name: null, bound: false })
  const failing = async () => {
    throw new Error('no container')
  }
  assert.equal(await recordTemplateLook(root, { template, read: failing, wroteBy: 'b' }), null)
  assert.equal(readDesign(root)?.source, 'template')
  assert.equal(
    await recordTemplateLook(root, { template: null, read: async () => business.css, wroteBy: 'b' }),
    null
  )
})

test('the check stage names the look from the site container, and its answer stays the same', async () => {
  const { lookRecording } = await import('../src/host/stages.mjs')
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(path.join(root, 'template'))
  writeFileSync(
    path.join(root, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', label: 'Tracy Business', version: '1.5.1' })
  )
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '))
    const file = args.at(-1)
    if (args.includes('node')) return { code: 0, stdout: '<!doctype html><html lang="en"><head>', stderr: '' }
    return { code: 0, stdout: file.endsWith('.css') ? business.css : business.fonts, stderr: '' }
  }
  const stage = async () => {
    writeDesign(root, {
      schemaVersion: 'tracy-site-design/v1',
      id: null,
      source: 'template',
      name: null,
      bound: false,
      platform: 'emdash',
      manifestDesign: null,
      tokens: null,
      tokensFrom: null,
      writtenAt: 'x',
      wroteBy: 'b'
    })
    return { status: 'done', detail: 'up' }
  }
  const answer = await lookRecording(
    { root, run, env: {} },
    stage
  )({ job: 'j9', targetSiteKey: 'granite.localhost' })
  assert.deepEqual(answer, { status: 'done', detail: 'up' })
  assert.deepEqual(
    calls.map((c) => c.split(' ').slice(0, 5).join(' ')),
    [
      'docker exec granite-web-1 cat /app/src/styles/tokens.css',
      'docker exec granite-web-1 cat /app/src/fonts.json',
      'docker exec granite-web-1 node -e'
    ]
  )
  const record = readDesign(root)
  assert.equal(record?.source, 'quickstart')
  assert.equal(record?.wroteBy, 'build:j9')

  const failed = await lookRecording(
    { root, run: async () => assert.fail('no read on a failed check'), env: {} },
    async () => ({ status: 'failed', detail: 'down' })
  )({ job: 'j9' })
  assert.equal(failed.status, 'failed')
})

test('a template that opens dark is measured by its dark values: the blocks the rendered <html> matches win (SaaS, 29/09)', () => {
  const css = read('tracy-emdash-theme-saas/src/styles/tokens.css')
  const fonts = read('tracy-emdash-theme-saas/src/fonts.json')
  const dark = templateTokens(css, fonts, { 'data-style': 'terminal', 'data-theme': 'dark' })
  assert.equal(dark?.['--k-muted'], '#5f6b66')
  const blueprint = templateTokens(css, fonts, { 'data-style': 'blueprint', 'data-theme': 'light' })
  assert.notEqual(blueprint?.['--k-muted'], '#5f6b66')
})

test('the rendered <html> attributes are read off the page itself', async () => {
  const { htmlAttributes } = await import('../src/host/template-design.mjs')
  assert.deepEqual(
    htmlAttributes('<!doctype html><html lang="en" data-style="terminal" data-theme="dark"><head>'),
    {
      lang: 'en',
      'data-style': 'terminal',
      'data-theme': 'dark'
    }
  )
  assert.deepEqual(htmlAttributes('no html here'), {})
})

// ADR 0023, "Addendum 29/09 (afternoon)": tracy-web owns the record, and an EmDash look's values exist
// only in the site — so the build sends tracy-web the NAMED look, once, and never the unnamed
// `template` record first (a site that could not be read would otherwise overwrite the original).
test('the check stage sends tracy-web one record: the named look read from the site, in the public shape', async () => {
  const { makeStages } = await import('../src/host/stages.mjs')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const page =
    '<!doctype html><html><head><meta name="generator" content="EmDash 0.37.0"></head><body>x</body></html>'
  const stagesAt = (root, sent) =>
    makeStages({
      root,
      ids: new Set(['apple']),
      run: async (_cmd, args) => {
        const file = args.at(-1)
        return { code: 0, stdout: file.endsWith('.css') ? business.css : business.fonts, stderr: '' }
      },
      copyHome: async () => ({ ok: false }),
      seeder: null,
      chrome: null,
      apply: async () => assert.fail('no apply on EmDash'),
      get: async () => ({ status: 200, text: async () => page }),
      wait: async () => {},
      doorOrigin: 'http://127.0.0.1:0',
      putDesign: async (siteKey, record) => {
        sent.push({ siteKey, record })
      }
    })
  const job = {
    job: 'j9',
    platform: 'emdash',
    inspiration: 'tracy-business',
    targetSiteKey: 'granite.localhost',
    targetUrl: 'http://granite.localhost:8080',
    designPlan: { workflow: 'template', design: null }
  }
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  mkdirSync(path.join(root, 'template'))
  writeFileSync(
    path.join(root, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', label: 'Tracy Business', version: '1.5.1' })
  )
  /** @type {any[]} */
  const sent = []
  assert.equal((await stagesAt(root, sent).check(job)).status, 'done')
  assert.equal(sent.length, 1, 'one PUT, the named look — not the unnamed template record first')
  assert.equal(sent[0].siteKey, 'granite.localhost')
  assert.deepEqual(Object.keys(sent[0].record).sort(), [
    'id',
    'manifestDesign',
    'name',
    'platform',
    'source',
    'tokens',
    'tokensFrom'
  ])
  assert.deepEqual(
    { id: sent[0].record.id, source: sent[0].record.source, name: sent[0].record.name },
    { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }
  )
  assert.equal(sent[0].record.tokens['--color-forest'], '#14483a')
  assert.deepEqual(sent[0].record.tokens, readDesign(root)?.tokens)

  // No template beside the build: what the folder says (the template's own look, unnamed) is sent.
  const bare = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  const plain = []
  await stagesAt(bare, plain).check(job)
  assert.deepEqual(
    plain.map((p) => [p.record.source, p.record.id]),
    [['template', null]]
  )
})

test('a template beside the build whose look cannot be read sends nothing and says so', async () => {
  const { makeStages } = await import('../src/host/stages.mjs')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const page =
    '<!doctype html><html><head><meta name="generator" content="EmDash 0.37.0"></head><body>x</body></html>'
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  mkdirSync(path.join(root, 'template'))
  writeFileSync(
    path.join(root, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', label: 'Tracy Business', version: '1.5.1' })
  )
  /** @type {any[]} */
  const sent = []
  /** @type {string[]} */
  const lines = []
  const stages = makeStages({
    root,
    ids: new Set(['apple']),
    // The site's container does not answer: every `cat` of its files fails.
    run: async () => ({ code: 1, stdout: '', stderr: 'No such container' }),
    copyHome: async () => ({ ok: false }),
    seeder: null,
    chrome: null,
    apply: async () => assert.fail('no apply on EmDash'),
    get: async () => ({ status: 200, text: async () => page }),
    wait: async () => {},
    doorOrigin: 'http://127.0.0.1:0',
    putDesign: async (siteKey, record) => {
      sent.push({ siteKey, record })
    },
    warn: (line) => lines.push(line)
  })
  const job = {
    job: 'j10',
    platform: 'emdash',
    inspiration: 'tracy-business',
    targetSiteKey: 'granite.localhost',
    targetUrl: 'http://granite.localhost:8080',
    designPlan: { workflow: 'template', design: null }
  }
  assert.equal((await stages.check(job)).status, 'done', 'the build is not failed by it')
  assert.deepEqual(sent, [], 'the unnamed record does not replace the one tracy-web holds')
  assert.ok(
    lines.some((line) => line.startsWith('[site-design] template look not read')),
    lines.join('\n')
  )
})

test("a site created from a quickstart without a card (record 'none') still gets its template's look — SaaS, final E2E 30/09", async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  writeDesign(root, {
    schemaVersion: 'tracy-site-design/v1',
    id: null,
    source: 'none',
    name: null,
    bound: false,
    platform: 'emdash',
    manifestDesign: null,
    tokens: null,
    tokensFrom: null,
    writtenAt: 'x',
    wroteBy: 'build:j1'
  })
  const saas = {
    css: read('tracy-emdash-theme-saas/src/styles/tokens.css'),
    fonts: read('tracy-emdash-theme-saas/src/fonts.json')
  }
  const record = await recordTemplateLook(root, {
    template: { id: 'tracy-saas', label: 'Tracy SaaS', version: '1.2.0' },
    read: async (file) => (file.endsWith('.css') ? saas.css : saas.fonts),
    home: async () => '<html lang="en" data-style="terminal" data-theme="dark">',
    wroteBy: 'build:j1'
  })
  assert.equal(record?.source, 'quickstart')
  assert.equal(record?.id, 'tracy-saas')
  assert.equal(record?.tokens?.['--k-muted'], '#5f6b66')
})

test('a site with no template copy beside it is named from the artifact.json its own code carries', async () => {
  const { templateOf } = await import('../src/host/stages.mjs')
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-design-'))
  const artifact = JSON.stringify({ templateId: 'tracy-saas', label: 'Tracy SaaS', version: '1.2.0' })
  assert.deepEqual(await templateOf(root, async (file) => (file === '/app/artifact.json' ? artifact : '')), {
    id: 'tracy-saas',
    label: 'Tracy SaaS',
    version: '1.2.0'
  })
  assert.equal(
    await templateOf(root, async () => {
      throw new Error('no container')
    }),
    null
  )
})
