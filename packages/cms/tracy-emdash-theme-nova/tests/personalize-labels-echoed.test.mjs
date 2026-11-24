// tools/personalize.mjs, a label the model hands back in the template's words (TCH #1013, LANG-2, g63). On g62-biz-emd-full
// (Tracy Business 1.7.10, a bakery written in Vietnamese) the contact page's branch lines read "Lipetsk SEZ, 6 Tekhnologichesky
// proezd" and "Fabrication yard, Zavolzhye IP" in English, where g61 read "Khu kinh tế đặc biệt Lipetsk" and "Xưởng chế tạo": language-allow
// the labels question was asked, the model returned those two lines unchanged (it read them as an address to keep), and an
// unchanged answer was dropped without a word. A line of words that comes back unchanged is asked again, alone with the
// others like it and then one at a time; one still unchanged is named in the report. On g63-biz-emd-full (1.7.11) the same
// lines came back HALF translated, "7/22 Derbenevskaya emb., tầng 8" and "Khu xưởng Fabrication, Zavolzhye IP": an answer
// that keeps a common word of the template's language ("emb.", "Fabrication" before "yard") is unchanged too (g64). On
// g64-biz-emd-full (1.7.12) /contact still read "Vorsino Industrial Park, lô 12" (a capitalised address taken for a name:
// "Industrial Park" are words, only "Vorsino" is a name) and "7/22 Derbenevskaya emb., tầng 8" (the street's name before
// the abbreviation counted as an English word, so a good answer was asked again alone and a worse one replaced it). Written
// against its own tiny seed, so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const contact = {
  title: 'Contact',
  hq_address_1: 'Vorsino Industrial Park, plot 12',
  branches_title: 'Branches',
  branches: [
    { city: 'Moscow', address: '7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55' },
    { city: 'Nizhny Novgorod', address: 'Fabrication yard, Zavolzhye IP · +7 831 371 91 08' }
  ]
}
const seed = {
  defaultLocale: 'en',
  content: { contact: [{ slug: 'contact', locale: 'en', data: contact }] },
  menus: []
}
const map = { identity: [], labels: [{ collection: 'contact', slug: 'contact' }] }
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-echo-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

/** What an obedient model writes in Vietnamese; any other label as `vi:<label>`. */
const VI = {
  Contact: 'Liên hệ',
  Branches: 'Chi nhánh',
  'Vorsino Industrial Park, plot 12': 'Khu công nghiệp Vorsino, lô 12',
  '7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55':
    '7/22 bờ kè Derbenevskaya, tầng 8 · +7 495 382 14 55',
  'Fabrication yard, Zavolzhye IP · +7 831 371 91 08':
    'Xưởng chế tạo, khu công nghiệp Zavolzhye · +7 831 371 91 08'
}
/** What the g63 model wrote: the words around the names half translated, a common word of English left in each. */
const HALF = {
  '7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55':
    '7/22 Derbenevskaya emb., tầng 8 · +7 495 382 14 55',
  'Fabrication yard, Zavolzhye IP · +7 831 371 91 08':
    'Khu xưởng Fabrication, Zavolzhye IP · +7 831 371 91 08'
}

/**
 * A DISOBEDIENT model: it translates every label but hands back every line with a phone number in it unchanged (an address
 * to keep, as it reads it) for the first `stubborn` questions that hold such a line, half translated (g63) for the next
 * `half`, and drops one key outright. A line in `script` gets its scripted answers in turn instead, the last one again.
 */
async function modelServer({ stubborn, half = 0, script = {} }) {
  const asked = []
  /** How many times each scripted line was asked: its answers are given in that order, the last one again and again. */
  const turns = new Map()
  let echoes = 0
  let halves = 0
  let labelAsks = 0
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    let answer = {}
    if (user.labels) {
      labelAsks += 1
      const lines = Object.entries(user.labels)
      const address = lines.some(([, v]) => v.includes(' · +'))
      const echo = address && echoes < stubborn
      if (echo) echoes += 1
      const partly = address && !echo && halves < half
      if (partly) halves += 1
      answer = Object.fromEntries(
        lines
          .filter(([, v]) => v !== 'Branches' || labelAsks > 1)
          .map(([k, v]) => [
            k,
            script[v]
              ? script[v][Math.min(turns.set(v, (turns.get(v) ?? -1) + 1).get(v), script[v].length - 1)]
              : echo && v.includes(' · +')
                ? v
                : partly && HALF[v]
                  ? HALF[v]
                  : (VI[v] ?? `vi:${v}`)
          ])
      )
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, asked, close: () => server.close() }
}

function run(args, env) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

async function build(stubborn, half = 0, script = {}) {
  const mock = createMockEmdash()
  mock.state.addEntry('contact', 'contact', 'en', contact)
  const url = await mock.listen()
  const model = await modelServer({ stubborn, half, script })
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-echo-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    const r = await run(
      [
        '--seed',
        SEED_DIR,
        '--site',
        url,
        '--token-file',
        path.join(dir, 'token'),
        '--receipts',
        path.join(dir, 'receipts.json'),
        '--json',
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', about: 'A bakery in Hanoi.', languages: ['vi'] }),
        '--no-images'
      ],
      { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const live = [...mock.state.entries.values()].find((e) => e.collection === 'contact').live
    return { report, live, asked: model.asked.filter((a) => a.user.labels) }
  } finally {
    await mock.close()
    model.close()
  }
}

test('a line of words the model hands back unchanged is asked again, and a key it dropped is asked again', async () => {
  const { live, asked } = await build(1)
  assert.equal(live.branches[1].address, VI['Fabrication yard, Zavolzhye IP · +7 831 371 91 08'])
  assert.equal(live.branches[0].address, VI['7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55'])
  assert.equal(live.branches_title, 'Chi nhánh', 'a key the model left out is asked again')
  assert.ok(asked.length >= 2, 'the unchanged lines were asked again')
  assert.match(asked[1].system, /unchanged/)
  assert.ok(!('title' in asked[1].user.labels), 'a label already translated is not asked again')
})

test('a line still unchanged after the retry and one at a time is named in the report, never dropped silently', async () => {
  const { report, live, asked } = await build(99)
  assert.equal(live.branches[1].address, 'Fabrication yard, Zavolzhye IP · +7 831 371 91 08')
  assert.equal(live.title, 'Liên hệ')
  // The first question, the retry of both lines together, then each line alone.
  assert.equal(asked.length, 4)
  const note = (report.skipped ?? []).find((s) => s.rule.startsWith('labels (en)'))
  assert.ok(note, JSON.stringify(report.skipped))
  assert.match(note.why, /2 label\(s\).*Vietnamese/)
  assert.match(note.why, /Fabrication yard/)
})

test('g63: a line handed back half translated, a common word of English left in it, is asked again like an unchanged one', async () => {
  const { live, asked } = await build(0, 1)
  assert.equal(live.branches[0].address, VI['7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55'])
  assert.equal(live.branches[1].address, VI['Fabrication yard, Zavolzhye IP · +7 831 371 91 08'])
  assert.ok(asked.length >= 2, 'the half-translated lines were asked again')
  assert.match(asked[1].system, /unchanged/)
  assert.deepEqual(
    Object.values(asked[1].user.labels).sort(),
    [...Object.keys(HALF), 'Branches'].sort(),
    'only the two lines that kept English words, and the key the model left out'
  )
})

test('g63: a line still half translated after the retry and one at a time is named in the report, never left in silence', async () => {
  const { report, live, asked } = await build(0, 99)
  assert.equal(live.branches[1].address, HALF['Fabrication yard, Zavolzhye IP · +7 831 371 91 08'])
  assert.equal(asked.length, 4, 'the first question, the two lines together, then each alone')
  const note = (report.skipped ?? []).find((s) => s.rule.startsWith('labels (en)'))
  assert.ok(note, JSON.stringify(report.skipped))
  assert.match(note.why, /2 label\(s\).*Vietnamese/)
})

test('g64: a capitalised address whose common nouns come back in English ("Industrial Park") is asked again', async () => {
  const { live, asked } = await build(0, 0, {
    'Vorsino Industrial Park, plot 12': ['Vorsino Industrial Park, lô 12', 'Khu công nghiệp Vorsino, lô 12']
  })
  assert.equal(live.hq_address_1, 'Khu công nghiệp Vorsino, lô 12')
  assert.ok(
    asked.slice(1).some((a) => Object.values(a.user.labels).includes('Vorsino Industrial Park, plot 12')),
    'the line was asked again'
  )
})

test('g64: a capitalised address the model keeps half English on every question is named in the report', async () => {
  const { report, live } = await build(0, 0, {
    'Vorsino Industrial Park, plot 12': ['Vorsino Industrial Park, lô 12']
  })
  assert.equal(live.hq_address_1, 'Vorsino Industrial Park, lô 12')
  const note = (report.skipped ?? []).find((s) => s.rule.startsWith('labels (en)'))
  assert.ok(note, JSON.stringify(report.skipped))
  assert.match(note.why, /Vorsino Industrial Park, plot 12/)
})

test('g64: a name before an abbreviation is a name; a good answer is never replaced by a worse one', async () => {
  const moscow = '7/22 Derbenevskaya emb., 8th floor · +7 495 382 14 55'
  const { report, live } = await build(0, 0, {
    // Half English, then right, then (were it asked alone again) half English once more.
    [moscow]: [HALF[moscow], VI[moscow], HALF[moscow]]
  })
  assert.equal(live.branches[0].address, VI[moscow])
  const note = (report.skipped ?? []).find((s) => s.rule.startsWith('labels (en)'))
  assert.ok(!note || !note.why.includes('Derbenevskaya'), JSON.stringify(report.skipped))
})
