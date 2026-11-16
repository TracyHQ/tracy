// tools/personalize.mjs, rich text and bounded rows (TracyHQ/tracy, JA Restaurant EmDash 1.0.2, measured 16/11/2026 on dev):
//  - a `copy` rule on a rich-text (portable text) field was never asked: `writeCopy` read only string fields, so the home
//    welcome kept the demo's "Since 1982 … 4 5th Avenue at St. Marks Place" on a trattoria in Da Nang, and the report said
//    nothing. It is asked as its text and written back as blocks, keeping what the view draws from them: a block that is one
//    link (a button) is left out of the rewrite, a link or an emphasis inside a sentence is a placeholder pair the answer
//    keeps (`{mark_a}…{mark_a_end}`);
//  - a link never carries the demo's facts onto the customer's words: rewritten, a link that leads out of the site (a map,
//    a phone, another site) stays only on the demo's own words, and new words in its place are plain text; a link into the
//    site keeps its address;
//  - the template's words translated for a root written in another language (a copy field or a rewrite body the model did
//    not write) kept no link and no emphasis: each block was flattened to one span;
//  - a `blocks` rule wrote rows of any length: the slideshow title ran to five lines in a box that cuts what overflows. A rule
//    may bound a field of its rows in characters (`maxCharacters`), the number the template's contract measured.
// Written against its own tiny seed, so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { rewriteBlock, writeCopy } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const span = (key, text, marks = []) => ({ _type: 'span', _key: key, text, marks })
const intro = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [{ _type: 'link', _key: 'l1', href: 'https://maps.example/?q=4+Demo+Street' }],
    children: [
      span('s1', 'Since 1982 we have cooked at '),
      span('s2', '4 Demo Street', ['l1']),
      span('s3', ' for the whole neighbourhood.')
    ]
  },
  {
    _type: 'block',
    _key: 'b2',
    style: 'normal',
    markDefs: [{ _type: 'link', _key: 'l2', href: '#our-team' }],
    children: [span('s4', 'Meet Our Team', ['l2'])]
  },
  {
    _type: 'block',
    _key: 'b3',
    style: 'normal',
    markDefs: [{ _type: 'link', _key: 'l3', href: '/menu' }],
    children: [span('s5', 'See '), span('s6', 'our menu', ['l3']), span('s7', ' before you come.')]
  }
]
const body = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    markDefs: [],
    children: [
      span('p1a', 'Greet every table.', ['strong']),
      span('p1b', ' A quick hello tells guests they are seen.')
    ]
  }
]
const seed = {
  defaultLocale: 'en',
  content: {
    hero: [
      {
        slug: 'welcome',
        locale: 'en',
        data: { title: 'Welcome', intro, slides: [{ slide_title: 'The best bar in Demo Town' }] }
      }
    ],
    posts: [{ slug: 'habits', locale: 'en', data: { title: 'Four habits', body } }]
  }
}
const map = {
  copy: [
    { collection: 'hero', slug: 'welcome', field: 'intro', brief: 'two sentences of welcome', maxWords: 40 }
  ],
  blocks: [
    {
      collection: 'hero',
      slug: 'welcome',
      field: 'slides',
      itemFields: ['slide_title'],
      brief: 'a short welcome over a picture',
      maxCharacters: { slide_title: 30 }
    }
  ],
  rewrite: [{ collection: 'posts', brief: 'a short note', fields: ['title'], body: 'body', bodyWords: 40 }]
}
const seedEntries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.map((e) => ({ collection, slug: e.slug, locale: e.locale, data: e.data }))
)
const facts = { name: 'Trattoria Lume', about: 'An Italian trattoria in Da Nang.', sector: 'restaurant' }
const model = { url: 'http://model.test/v1/chat', key: 'k', model: 'm' }
const textOf = (blocks) => blocks.flatMap((b) => (b.children ?? []).map((c) => c.text)).join('')
const linked = (block) => block.children.filter((c) => c.marks.length > 0).map((c) => [c.text, c.marks])
/** A stand-in for the model's door that answers `answer(user)`, and keeps what it was asked. */
const door =
  (answer, asked = []) =>
  async (_url, init) => {
    const messages = JSON.parse(init.body).messages
    const user = JSON.parse(messages.at(-1).content)
    asked.push({ system: messages[0].content, user })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer(user)) } }] }))
  }
const KEY = 'hero.welcome.intro'
const write = (answer, asked) =>
  writeCopy({
    model,
    map,
    facts,
    locale: 'en',
    seedEntries,
    fetchImpl: door(() => ({ [KEY]: answer }), asked)
  })

test('a rich-text copy field is asked, its button stays, and a map link never goes with new words', async () => {
  const asked = []
  const out = await write(
    'Fresh pasta every day at {mark_a}our table{mark_a_end}.\n\nBook {mark_a}a table{mark_a_end} for tonight.',
    asked
  )
  const field = asked.flatMap((a) => a.user.fields ?? []).find((f) => f.key === KEY)
  assert.ok(field, 'the field is asked')
  assert.equal(
    field.example,
    'Since 1982 we have cooked at {mark_a}4 Demo Street{mark_a_end} for the whole neighbourhood.\n\n' +
      'See {mark_a}our menu{mark_a_end} before you come.'
  )
  const blocks = out[KEY]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.equal(textOf([blocks[0]]), 'Fresh pasta every day at our table.')
  assert.deepEqual(
    linked(blocks[0]),
    [],
    '"our table" is plain text: the map of the demo address is not its link'
  )
  assert.deepEqual(blocks[0].markDefs, [], 'the demo address leaves the block')
  assert.deepEqual(blocks[1], intro[1], 'the button block stays as it is')
  assert.deepEqual(linked(blocks[2]), [['a table', ['l3']]], 'a link into the site keeps its address')
  assert.deepEqual(blocks[2].markDefs, intro[2].markDefs)
})

test('a link out of the site stays on the demo words it was written for', async () => {
  const out = await write(
    'Find us at {mark_a}4 Demo Street{mark_a_end}, pasta every day.\n\nSee {mark_a}our menu{mark_a_end} first.'
  )
  assert.ok(Array.isArray(out[KEY]), 'written back as blocks')
  assert.deepEqual(linked(out[KEY][0]), [['4 Demo Street', ['l1']]])
  assert.deepEqual(out[KEY][0].markDefs, intro[0].markDefs)
})

test('an answer that drops a link of the field, or invents one, is not taken', async () => {
  for (const answer of [
    'Fresh pasta every day.\n\nSee {mark_a}our menu{mark_a_end} first.',
    'Fresh {mark_a}pasta{mark_a_end} every day {mark_b}here{mark_b_end}.\n\nSee {mark_a}our menu{mark_a_end}.',
    'Fresh pasta {mark_a}every day.\n\nSee {mark_a}our menu{mark_a_end}.'
  ]) {
    const out = await write(answer)
    assert.equal(out[KEY], undefined, answer)
  }
})

test('a row field over its bound is not taken, one within it is, and the model is told the bound', async () => {
  const rule = map.blocks[0]
  const rows = [{ slide_title: 'The best bar in Demo Town' }, { slide_title: 'The best bar in Demo Town' }]
  const asked = []
  const fetchImpl = door(
    () => ({
      rows: [
        { slide_title: 'Benvenuti at Trattoria Lume, handmade pasta by the river' },
        { slide_title: 'Benvenuti at \nTrattoria Lume' }
      ]
    }),
    asked
  )
  const out = await rewriteBlock({ model, rule, facts, locale: 'en', rows, fetchImpl })
  assert.equal(
    out.rows[0].slide_title,
    rows[0].slide_title,
    'too long: the row keeps its words, to be asked again'
  )
  assert.equal(out.rows[1].slide_title, 'Benvenuti at \nTrattoria Lume', 'a line break counts as one space')
  assert.match(asked[0].system, /slide_title is at most 30 characters/)
})

/** A model that writes nothing and translates every text it is handed by putting "VI " before it. */
async function translatingModel() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    let user = null
    try {
      user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages.at(-1).content)
    } catch {
      user = null
    }
    const answer =
      user?.labels && typeof user.labels === 'object'
        ? Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `VI ${String(v)}`]))
        : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
}

test('a root written in another language: the template’s rich text is translated with its links, emphasis and button', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-rich-'))
  writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed))
  writeFileSync(path.join(dir, 'personalize.json'), JSON.stringify(map))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, structuredClone(e.data))
  const site = await mock.listen()
  const modelDoor = await translatingModel()
  try {
    const result = await new Promise((resolve) => {
      execFile(
        'node',
        [
          TOOL,
          '--answers-json',
          JSON.stringify({ ...facts, languages: ['vi'] }),
          '--site',
          site,
          '--seed',
          dir,
          '--token-file',
          path.join(dir, 'token'),
          '--receipts',
          path.join(dir, 'r.json'),
          '--json',
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            OPENROUTER_API_KEY: '',
            DEEPSEEK_API_KEY: '',
            TRACY_SEED_TEXT_PROVIDER: '',
            TRACY_MODEL_URL: modelDoor.url,
            TRACY_MODEL_KEY: 'k-test',
            TRACY_MODEL_NAME: 'm-test'
          }
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    })
    assert.ok([0, 3].includes(Number(result.code)), `${result.code}: ${result.stderr.slice(-400)}`)
    const live = (collection, slug) =>
      [...mock.state.entries.values()].find(
        (e) => e.collection === collection && e.slug === slug && e.locale === 'en'
      ).live
    const hero = live('hero', 'welcome').intro
    assert.match(textOf([hero[0]]), /^VI Since 1982/, 'the welcome is translated')
    assert.deepEqual(hero[0].markDefs, intro[0].markDefs, 'translated words keep their link')
    assert.deepEqual(linked(hero[0]), [['4 Demo Street', ['l1']]], 'the linked words keep their mark')
    assert.deepEqual(hero[1], intro[1], 'the button block stays as it is')
    const post = live('posts', 'habits').body
    assert.match(textOf(post), /^VI /, 'the body is translated')
    assert.deepEqual(
      post[0].children.filter((c) => c.marks.includes('strong')).map((c) => c.text),
      ['Greet every table.'],
      'the emphasis stays on its words'
    )
  } finally {
    modelDoor.close()
    await mock.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
