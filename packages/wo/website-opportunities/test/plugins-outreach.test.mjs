import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEMO_TEMPLATES,
  OUTREACH_LANGUAGES,
  checkOutreachTemplate,
  readOutreachTemplates
} from '../src/plugins/outreach.js'
import { outreachMessage } from '../src/outreach.js'
import { MESSAGE_LANGUAGES } from '../src/message-language.js'

const EN = {
  greeting: 'Hello {place} team,',
  body: 'I made a free demo website for {place}: {url}',
  expiry: 'Have a look. The demo is available until {expires}.',
  kept: 'Have a look at the demo.',
  subject: 'A demo website for {place}'
}

test('outreach/en: the English demo template comes from its folder and drafts the same message as before', () => {
  assert.deepEqual({ ...DEMO_TEMPLATES.en }, EN)
  assert.deepEqual(
    outreachMessage({
      place: 'Corner Cafe',
      url: 'https://demo.example/c',
      expiresAt: '2026-11-30T00:00:00Z',
      signature: 'Sam',
      language: 'en'
    }),
    {
      auto: 'Hello Corner Cafe team,\n\nI made a free demo website for Corner Cafe: https://demo.example/c\n\nHave a look. The demo is available until November 30, 2026.\n\nSam',
      local: null,
      english:
        'Hello Corner Cafe team,\n\nI made a free demo website for Corner Cafe: https://demo.example/c\n\nHave a look. The demo is available until November 30, 2026.\n\nSam',
      subject: 'A demo website for Corner Cafe'
    }
  )
})

test('the built-in file and the folders together give the twelve languages a message is drafted in', () => {
  const twelve = ['de', 'en', 'es', 'fr', 'id', 'it', 'ja', 'ko', 'nl', 'th', 'vi', 'zh']
  assert.deepEqual([...OUTREACH_LANGUAGES].sort(), twelve)
  assert.deepEqual([...MESSAGE_LANGUAGES].sort(), twelve)
})

test('a new language folder is read next to the built-in languages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wo-outreach-'))
  await mkdir(join(dir, 'en'))
  await writeFile(join(dir, 'en', 'demo.json'), JSON.stringify(EN))
  await mkdir(join(dir, 'pt'))
  const pt = { ...EN, greeting: 'Ol\u00e1, equipe {place},' }
  await writeFile(join(dir, 'pt', 'demo.json'), JSON.stringify(pt))
  const all = readOutreachTemplates({ builtInFile: null, dirs: [dir] })
  assert.deepEqual(Object.keys(all), ['en', 'pt'])
  assert.equal(all.pt.demo.greeting, 'Ol\u00e1, equipe {place},')
})

test('a language defined twice, or no English, is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wo-outreach-'))
  await mkdir(join(dir, 'de'))
  await writeFile(join(dir, 'de', 'demo.json'), JSON.stringify(EN))
  assert.throws(() => readOutreachTemplates({ dirs: [dir] }), /de are defined twice/)
  assert.throws(() => readOutreachTemplates({ builtInFile: null, dirs: [dir] }), /English/)
})

test('checkOutreachTemplate: every key, the placeholders a line needs, a known kind and a language code', () => {
  assert.throws(
    () => checkOutreachTemplate('en', 'demo', { ...EN, body: 'No link here' }),
    /body must contain \{url\}/
  )
  assert.throws(
    () => checkOutreachTemplate('en', 'demo', { ...EN, expiry: 'Soon.' }),
    /expiry must contain \{expires\}/
  )
  assert.throws(() => checkOutreachTemplate('en', 'demo', { ...EN, kept: '' }), /kept is missing/)
  assert.throws(() => checkOutreachTemplate('en', 'demo', { ...EN, footer: 'x' }), /unknown keys footer/)
  assert.throws(() => checkOutreachTemplate('en', 'reminder', EN), /kinds are demo/)
  assert.throws(() => checkOutreachTemplate('English', 'demo', EN), /not a language code/)
})
