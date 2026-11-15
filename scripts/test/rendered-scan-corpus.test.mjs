// The demo corpus of a template version (ticket #585): built from whichever sources the caller has, independent of the
// mapping, with design pictures and interface words set apart. Invented template only.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { corpusInputOf, demoCorpus } from '../ai-quickstart/rendered-scan.mjs'
import { normalise, segmentsOf } from '../ai-quickstart/rendered-scan/normalise.mjs'
import { corpusInput, DEMO, demoBaseline, demoContentMap, kit } from './fixtures/rendered-scan/rowing.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('every input is optional, and the corpus records which sources it had', () => {
  const none = demoCorpus()
  assert.deepEqual(none.sources, { demo: false })
  const only = demoCorpus({ companyNames: [DEMO.company] })
  assert.deepEqual(only.sources, { companyNames: 1, demo: true })
  const all = demoCorpus(corpusInput())
  for (const k of [
    'demoBaseline',
    'contentMap',
    'companyNames',
    'interfaceTexts',
    'blankSite',
    'languageKeep'
  ])
    assert.ok(all.sources[k] > 0, k)
})

test('the corpus does not depend on the mapping: the same demo sources give the same demo words with or without it', () => {
  const withMapping = demoCorpus(corpusInput())
  const without = demoCorpus({ ...corpusInput(), kit: { contentMap: kit().contentMap } })
  assert.deepEqual([...without.segments.keys()], [...withMapping.segments.keys()])
  assert.deepEqual([...without.blockKeys], [...withMapping.blockKeys])
})

test('pictures are kept by path and by sha256, minus the files the mapping declares as design', () => {
  const c = demoCorpus(corpusInput())
  assert.deepEqual([...c.pictures.files].sort(), [DEMO.baselinePicture, DEMO.picture])
  assert.deepEqual([...c.design].sort(), [DEMO.designLine, DEMO.designStore])
  assert.equal(c.pictures.shas.size, 1)
  const noKit = demoCorpus({ demoBaseline: demoBaseline(), contentMap: demoContentMap() })
  assert.ok(noKit.pictures.files.has(DEMO.designLine), 'without the kit nothing is declared design')
})

test('interface words leave the demo sentences: a language string kept, the blank site words, those given', () => {
  const c = demoCorpus(corpusInput())
  assert.ok(!c.segments.has(normalise(DEMO.memberLine)))
  assert.ok(c.interface.has('send message') && c.interface.has('read more'))
  assert.ok(c.segments.has(segmentsOf(DEMO.sentence)[0]))
})

test('the content map markers and markup are read as breaks, character references decoded', () => {
  assert.deepEqual(segmentsOf('Row with us((br/))every single morning at dawn'), [
    'every single morning at dawn'
  ])
  assert.equal(normalise('Tide &amp; <b>Time</b>  ((span))WAIT((/span))'), 'tide & time wait')
  assert.equal(normalise('ﬁne rowing'), 'fine rowing', 'NFKC')
})

test('a caller may put a source on the kit itself, and it wins over a released file', () => {
  const input = corpusInputOf(
    { ...kit(), demoBaseline: demoBaseline(), demoContentMap: demoContentMap() },
    {
      released: () => ({ demoBaseline: { texts: ['other'] }, companyNames: ['Released Name'] })
    }
  )
  assert.deepEqual(input.demoBaseline, demoBaseline())
  assert.deepEqual(input.contentMap, demoContentMap())
  assert.deepEqual(input.companyNames, ['Released Name'])
})

test('the module names no template: no template slug or name is written in its code', () => {
  const files = [
    path.join(ROOT, 'scripts/ai-quickstart/rendered-scan.mjs'),
    ...readdirSync(path.join(ROOT, 'scripts/ai-quickstart/rendered-scan')).map((f) =>
      path.join(ROOT, 'scripts/ai-quickstart/rendered-scan', f)
    )
  ]
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /boxing|ja[-_]/i, file)
})
