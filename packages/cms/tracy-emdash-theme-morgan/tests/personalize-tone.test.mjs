// tools/personalize.mjs, the customer's tone of voice (TCH #1013, T15): the answer `tone` reaches the model as a field of
// its own beside the description — when there is no description too, on a root written in another language (with About
// blank and the template's own language, no demo copy is rewritten: ABOUT-3, K7) — and every prompt that carries it says it is the
// voice, not the subject. Written against its own tiny seed (as `personalize-journal.test.mjs` is), so the kit and every
// template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, TONE_RULES, toneLine } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const seed = {
  defaultLocale: 'en',
  content: {
    site: [{ slug: 'site', locale: 'en', data: { brand_name: 'DEMO WORKS' } }],
    pages: [{ slug: 'about', locale: 'en', data: { title: 'About Demo', lede: 'Demo builds things.' } }]
  }
}
const map = {
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  copy: [
    { collection: 'pages', slug: 'about', field: 'lede', brief: 'one line under the title', maxWords: 20 }
  ]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-tone-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

/** One run against a fresh site and a model that answers every field and keeps what it was asked. */
async function askedWith(answers) {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  const site = await mock.listen()
  const asked = []
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    const answer = Array.isArray(user.fields)
      ? Object.fromEntries(user.fields.map((f) => [f.key, 'A line.']))
      : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-tone-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    await new Promise((resolve) =>
      execFile(
        'node',
        [
          TOOL,
          '--seed',
          SEED_DIR,
          '--site',
          site,
          '--token-file',
          path.join(dir, 'token'),
          '--receipts',
          path.join(dir, 'receipts.json'),
          '--answers-json',
          JSON.stringify(answers),
          '--no-images',
          '--json'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            ...NO_MODEL,
            TRACY_MODEL_URL: modelUrl,
            TRACY_MODEL_KEY: 'k-test',
            TRACY_MODEL_NAME: 'm-test'
          }
        },
        resolve
      )
    )
    return asked.filter((a) => Array.isArray(a.user.fields))
  } finally {
    await mock.close()
    model.close()
  }
}

test('the tone is a fact of its own, and none when it was not given', () => {
  assert.equal(factsFrom({ name: 'N', tone: ' Warm ' }).tone, 'Warm')
  assert.equal('tone' in factsFrom({ name: 'N' }), false)
})

test('a tone with no description rewrites no demo copy: About blank changes the name alone (TCH #1013, ABOUT-3, K7)', async () => {
  assert.deepEqual(await askedWith({ name: 'Golden Crust', tone: 'Warm', languages: ['en'] }), [])
})

test('a tone with no description, on a root written in another language, writes no demo copy either: the template’s words are translated (g60)', async () => {
  // BLANK = the demo except the name swap, at every step (Akemi 10/10/2026): a root written in Vietnamese keeps the
  // template's words too, in Vietnamese (`demoWordsWork`), so nothing is written from the name and the tone alone.
  const asked = await askedWith({ name: 'Golden Crust', tone: 'Warm', languages: ['vi'] })
  assert.equal(asked.filter((a) => Array.isArray(a.user.fields)).length, 0, 'no copy prompt')
  assert.ok(
    asked.every((a) => a.user.labels !== undefined),
    'only translations are asked'
  )
  assert.ok(
    asked.every((a) => !/TONE OF VOICE/.test(a.system)),
    'a translation carries no voice: it says the template’s words'
  )
})

test('a description and a tone reach the copy prompt side by side', async () => {
  const asked = await askedWith({
    name: 'Golden Crust',
    about: 'A family bakery in Hanoi.',
    tone: 'Playful',
    languages: ['en']
  })
  assert.equal(asked[0].user.business.about, 'A family bakery in Hanoi.')
  assert.equal(asked[0].user.business.tone, 'Playful')
})

test('no tone: the prompt is as it was', async () => {
  const asked = await askedWith({
    name: 'Golden Crust',
    about: 'A family bakery in Hanoi.',
    languages: ['en']
  })
  assert.equal('tone' in asked[0].user.business, false)
  assert.doesNotMatch(asked[0].system, /TONE OF VOICE/)
  assert.match(
    asked[0].system,
    /Plain, specific, no exclamation marks/,
    'the house style when no tone was chosen'
  )
})

test('each of the three tones is defined: sentence length, word choice, punctuation, headlines, CTAs, what to avoid', () => {
  for (const id of ['plain', 'warm', 'bold']) {
    const rule = TONE_RULES[id]
    assert.match(
      rule,
      /Sentences of \d+ to \d+ words|sentences of \d+ to \d+ words/i,
      `${id}: sentence length`
    )
    assert.match(rule, /Headlines/, `${id}: headlines`)
    assert.match(rule, /CTAs/, `${id}: calls to action`)
    assert.match(rule, /exclamation/, `${id}: punctuation`)
    assert.match(rule, /Avoid/, `${id}: what to avoid`)
  }
  assert.ok(toneLine('Bold').includes(TONE_RULES.bold))
  assert.ok(toneLine('plain').includes(TONE_RULES.plain), 'the option id reads like its label')
  assert.match(
    toneLine('Playful'),
    /The tone: "Playful"/,
    'a tone outside the three is still binding, in its own words'
  )
  assert.equal(toneLine(''), '')
  assert.match(toneLine('Warm'), /headings, button labels and calls to action included/)
})

test('a chosen tone replaces the house style and the demo register, so Bold is not told to write Plain', async () => {
  const asked = await askedWith({
    name: 'Golden Crust',
    about: 'A family bakery.',
    tone: 'Bold',
    languages: ['en']
  })
  assert.ok(asked[0].system.includes(TONE_RULES.bold))
  assert.doesNotMatch(asked[0].system, /Plain, specific, no exclamation marks/)
  assert.doesNotMatch(asked[0].system, /LENGTH and REGISTER only/)
})

// A Name left blank keeps the template's (TCH #1013, 13/10/2026): Tracy sends no name, and a description must still be
// written. Measured on the local stand: Tracy Business with About answered and Name blank kept every demo line, because the
// copy lanes waited for a name ("no name in the answers: nothing to write about").
test('a description with no name is written: the copy prompt carries the business and no name', async () => {
  const asked = await askedWith({ about: 'A family bakery in Hanoi.', languages: ['en'] })
  assert.ok(asked.length > 0, 'the copy is asked for')
  assert.equal(asked[0].user.business.about, 'A family bakery in Hanoi.')
  assert.equal(asked[0].user.business.name ?? null, null, 'no name is made up for the business')
})
