// The demo corpus builds from what a template release ships (ticket #585): the one shipped AI quickstart kit and the
// contract files released beside it. Counts only; no site is reached, and no demo text is copied into this file.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadKit } from '../built-site-check/inputs.mjs'
import { corpusInputOf, demoCorpus, demoScan } from '../ai-quickstart/rendered-scan.mjs'
import { releaseFolderOf } from '../ai-quickstart/rendered-scan/released-sources.mjs'
import { emptiedPages } from './fixtures/rendered-scan/rowing.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const KIT = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11')
const kit = loadKit(KIT)
const corpus = demoCorpus(corpusInputOf(kit))

test('the shipped kit finds its release by its own mapping template, and every source gives something', () => {
  assert.ok(releaseFolderOf(kit.mapping.template), 'one release folder')
  const s = corpus.sources
  for (const k of ['demoBaseline', 'contentMap', 'fixedTexts', 'companyNames', 'languageKeep', 'blankSite'])
    assert.ok(s[k] > 0, `${k}: ${s[k]}`)
  assert.equal(s.demo, true)
  const baseline = JSON.parse(
    readFileSync(path.join(releaseFolderOf(kit.mapping.template).dir, 'demo-baseline.json'))
  )
  assert.equal(corpus.blockKeys.size, new Set([...baseline.texts, ...baseline.labels]).size)
  assert.ok(corpus.segments.size > 100, `${corpus.segments.size} sentences`)
  assert.ok(corpus.pictures.files.size > 50, `${corpus.pictures.files.size} pictures`)
  assert.ok(corpus.pictures.shas.size > 0)
  assert.ok(corpus.phrases.size > 0 && corpus.emails.size > 0 && corpus.phones.size > 0)
})

test('a page holding one released demo sentence is caught; an invented customer page is not', async () => {
  const sentence = [...corpus.segments.values()].find((s) => s.split(' ').length >= 8)
  const found = await demoScan({ pages: [{ path: '/', status: 200, html: `<p>${sentence}</p>` }], kit })
  assert.ok(found.some((f) => f.kind === 'demo_text'))
  assert.deepEqual(await demoScan({ pages: emptiedPages(), kit }), [])
})
