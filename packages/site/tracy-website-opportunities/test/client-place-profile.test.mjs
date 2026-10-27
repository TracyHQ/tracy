/**
 * The Place profile block of Details: blocks that hold data, the seven coverage states kept apart, grey rows only for the
 * important targets, and Google-style quotations the demo may not use still readable by the seller.
 * Bundles the real component with React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-place-profile.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-place-profile-'))
  const outfile = path.join(outDir, 'place-profile.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { PlaceProfileBlock } from './place-profile-block.tsx'
        export { placeProfileView } from './place-profile-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const fact = (id, value) => ({ id, value, evidenceRefs: [] })
const doc = (over = {}) => ({
  schema: 'website-opportunities/place-profile',
  business: { id: 'b1' },
  offerings: [],
  people: [],
  faqs: [],
  quotes: [],
  media: [],
  claims: { statistics: [], recognitions: [], relationships: [] },
  coverage: [],
  ...over
})
const draw = (profile, failed = false) =>
  lib.renderToStaticMarkup(lib.createElement(lib.PlaceProfileBlock, { t, profile, failed }))

test('offerings keep variants and the price exactly as printed; people, faqs and claims show when they hold data', () => {
  const html = draw(
    doc({
      offerings: [
        fact('o1', {
          kind: 'dish',
          name: 'Pho bo',
          section: 'Soups',
          variants: [
            { size: 'Large', price: { kind: 'exact', raw: '75.000đ', conditions: 'dine in' } },
            { price: { kind: 'unknown', raw: '' } }
          ]
        })
      ],
      people: [fact('p1', { name: 'Ba Hoa', role: 'Owner', relationship: 'owner' })],
      faqs: [fact('f1', { question: 'Do you deliver?', answer: 'Yes, nearby.' })],
      claims: {
        statistics: [fact('s1', { amount: 20, label: 'Years open', scope: 'business' })],
        recognitions: [fact('r1', { kind: 'award', name: 'Best pho', issuer: 'City Guide' })],
        relationships: []
      }
    })
  )
  assert.match(html, /Pho bo/)
  assert.match(html, /Large · 75\.000đ · dine in/)
  assert.match(html, /Ba Hoa/)
  assert.match(html, /Do you deliver\?/)
  assert.match(html, /Years open<\/span><span[^>]*> · 20</)
  assert.match(html, /Best pho/)
})

test('a block with no data is left out, never drawn empty', () => {
  const html = draw(doc())
  for (const key of ['pp.offerings', 'pp.people', 'pp.claims', 'pp.faqs', 'pp.quotes', 'pp.photoLinks'])
    assert.doesNotMatch(html, new RegExp(`\\[${key.replace('.', '\\.')}\\]`), key)
})

test('a review is shown to the seller with its kind and author, and no label says the demo leaves it out (product owner, 26/10/2026)', () => {
  const html = draw(
    doc({
      quotes: [
        // A profile frozen before 26/10/2026 may still carry the old restriction: it no longer means anything.
        fact('q1', {
          kind: 'review',
          text: 'Food really good.',
          author: 'A. Reader',
          restrictions: ['not-on-demo']
        }),
        fact('q2', { kind: 'tagline', text: 'Since 1999', restrictions: [] })
      ]
    })
  )
  assert.match(html, /Food really good\./)
  assert.match(html, /\[pp\.quote\.review\] · A\. Reader</)
  assert.match(html, /Since 1999/)
  assert.doesNotMatch(html, /pp\.notOnDemo/)
})

test('media relations name what a photo is linked to', () => {
  const html = draw(
    doc({
      offerings: [fact('o1', { kind: 'dish', name: 'Pho bo', variants: [] })],
      media: [
        fact('m1', { kind: 'image', relations: [{ entityId: 'o1', relation: 'depicts', evidenceRefs: [] }] }),
        fact('m2', { kind: 'image', relations: [{ entityId: 'b1', relation: 'logo-of', evidenceRefs: [] }] }),
        fact('m3', { kind: 'image', relations: [] })
      ]
    })
  )
  assert.match(
    html,
    /\[pp\.relation\.line\{&quot;relation&quot;:&quot;\[pp\.relation\.depicts\]&quot;,&quot;target&quot;:&quot;Pho bo&quot;\}\]/
  )
  assert.match(html, /pp\.relation\.business/)
  assert.equal((html.match(/pp\.relation\.line/g) ?? []).length, 2)
})

test('every one of the seven coverage states keeps its own label and tone', () => {
  const rows = [
    ['hours', 'found'],
    ['phone', 'partial'],
    ['media', 'searched_not_found'],
    ['people', 'not_researched'],
    ['brand', 'blocked'],
    ['menu', 'failed'],
    ['prices', 'not_applicable']
  ].map(([target, status]) => ({ target, status, sourceRefs: [] }))
  const html = draw(doc({ coverage: rows }))
  for (const [, status] of rows.map((r) => [r.target, r.status]))
    assert.match(html, new RegExp(`data-status="${status}"`), status)
  for (const status of ['partial', 'not_researched', 'blocked', 'failed'])
    assert.match(html, new RegExp(`tracy-wo-warn tracy-wo-small">\\[pp\\.status\\.${status}\\]`), status)
  for (const status of ['searched_not_found', 'not_applicable'])
    assert.match(html, new RegExp(`tracy-wo-muted tracy-wo-small">\\[pp\\.status\\.${status}\\]`), status)
})

test('a grey row shows only for the important targets; a yellow row always shows', () => {
  const html = draw(
    doc({
      coverage: [
        { target: 'media', status: 'searched_not_found', sourceRefs: [] },
        { target: 'events', status: 'searched_not_found', sourceRefs: [] },
        { target: 'claims.recognitions', status: 'not_applicable', sourceRefs: [] },
        { target: 'events', status: 'not_researched', sourceRefs: [] },
        { target: 'people', status: 'failed', sourceRefs: [] }
      ]
    })
  )
  assert.match(html, /pp\.target\.media/)
  assert.doesNotMatch(html, /pp\.target\.claims\.recognitions/)
  assert.equal((html.match(/pp\.target\.events/g) ?? []).length, 1)
  assert.match(html, /pp\.target\.people/)
})

test('not loaded yet: nothing; loading failed: an alert; not a profile: nothing', () => {
  assert.equal(draw(null), '')
  assert.equal(draw({ nope: true }), '')
  assert.match(draw(null, true), /role="alert">\[pp\.failed\]/)
})
