// FULL keeps the template's Terms and Privacy, the demo company's name swapped for the customer's (TCH #1013, Akemi's
// decision 2 of 12/10/2026), with Tracy Business's REAL seed. Until 1.7.12 a `rewrite` rule had the model write both legal
// pages anew for the business; the decision is that their text stays the template's (translated when the root is written
// in another language, as before), the address, the e-mail address and the law included, and only the demo company's
// name (`demoCompanyNames`, renamed by the `replace` rules) changes, so no "Northgate" is left in them.
// The model here is DISOBEDIENT: it rewrites every entry and every body it is shown, the legal pages included, so a run
// that still hands the legal pages to the model shows the model's words instead of the template's.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const SEED = path.join(ROOT, 'seed')
const seed = JSON.parse(readFileSync(path.join(SEED, 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(SEED, 'personalize.json'), 'utf8'))
const NAME = 'Golden Crust'
const DEMO_NAME = /Northgate|NORTHGATE|Норткейт/
const LEGAL = ['terms', 'privacy']

/** The template's value with the demo company's name swapped, as the `replace` rules swap it. */
function renamed(value) {
  const rules = map.replace.map((r) => ({
    find: r.find,
    with: r.with.replaceAll('{NAME}', NAME.toUpperCase()).replaceAll('{name}', NAME)
  }))
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'string' ? rules.reduce((s, r) => s.split(r.find).join(r.with), v) : v
    )
  )
}

const legalOf = (locale) =>
  Object.fromEntries(
    LEGAL.map((slug) => [
      slug,
      seed.content.pages.find((e) => e.slug === slug && (e.locale ?? 'en') === locale).data
    ])
  )

/** A model that rewrites whatever it is shown: entries, bodies part by part, copy fields; labels as `vi:<label>`. */
async function modelServer() {
  const asked = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    let answer = {}
    if (user.labels) answer = Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${v}`]))
    else if (Array.isArray(user.entries))
      answer = Object.fromEntries(
        user.entries.map((e, n) => [
          e.key,
          Object.fromEntries(
            Object.entries(e.example).map(([k, v]) => [
              k,
              Array.isArray(v)
                ? v.map((_, i) => `Model words ${String(n)}.${k}.${String(i)}`)
                : `Model words ${String(n)}.${k}`
            ])
          )
        ])
      )
    else if (Array.isArray(user.parts))
      answer = { body: user.parts.map((_, i) => `Model part ${String(i + 1)}`) }
    else if (Array.isArray(user.fields))
      answer = Object.fromEntries(user.fields.map((f) => [f.key, `Model copy ${f.key}`]))
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, asked, close: () => server.close() }
}

async function run(answers) {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows)
      mock.state.addEntry(collection, e.slug, e.locale ?? 'en', structuredClone(e.data ?? {}))
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'personalize-legal-'))
    writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
    const args = [
      TOOL,
      '--seed',
      SEED,
      '--site',
      url,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'receipts.json'),
      '--answers-json',
      JSON.stringify(answers),
      '--no-images',
      '--json'
    ]
    const env = {
      PATH: process.env.PATH ?? '',
      TRACY_MODEL_URL: model.url,
      TRACY_MODEL_KEY: 'k-test',
      TRACY_MODEL_NAME: 'm-test'
    }
    const r = await new Promise((resolve) =>
      execFile('node', args, { cwd: ROOT, env, maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) =>
        resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    )
    const report = JSON.parse(r.stdout)
    const live = Object.fromEntries(
      LEGAL.map((slug) => [
        slug,
        [...mock.state.entries.values()].find(
          (e) => e.collection === 'pages' && e.slug === slug && e.locale === (seed.defaultLocale ?? 'en')
        ).live
      ])
    )
    return { report, live, asked: model.asked, stderr: r.stderr }
  } finally {
    await mock.close()
    model.close()
  }
}

test('FULL in English: Terms and Privacy keep the template’s text, only the demo company’s name swapped', async () => {
  const { report, live, stderr } = await run({
    name: NAME,
    about: 'A family bakery in Hanoi.',
    languages: ['en']
  })
  assert.deepEqual(report.errors, [], stderr)
  const demo = legalOf('en')
  for (const slug of LEGAL) {
    assert.deepEqual(
      live[slug].content,
      renamed(demo[slug].content),
      `${slug}: the body is the template’s, renamed`
    )
    assert.equal(live[slug].lede, renamed(demo[slug].lede), `${slug}: the lede is the template’s, renamed`)
    assert.doesNotMatch(
      JSON.stringify([live[slug].content, live[slug].lede]),
      DEMO_NAME,
      `${slug}: no demo name left`
    )
    assert.match(
      JSON.stringify([live[slug].content, live[slug].lede]),
      new RegExp(NAME),
      `${slug}: the customer’s name is in it`
    )
  }
})

test('FULL in Vietnamese: Terms and Privacy are the template’s Vietnamese edition, only the name swapped', async () => {
  const { report, live, stderr } = await run({
    name: NAME,
    about: 'A family bakery in Hanoi.',
    languages: ['vi']
  })
  assert.deepEqual(report.errors, [], stderr)
  const demo = legalOf('vi')
  for (const slug of LEGAL) {
    assert.deepEqual(
      live[slug].content,
      renamed(demo[slug].content),
      `${slug}: the body is the template’s vi edition`
    )
    assert.equal(live[slug].lede, renamed(demo[slug].lede), `${slug}: the lede is the template’s vi edition`)
    assert.doesNotMatch(
      JSON.stringify([live[slug].content, live[slug].lede]),
      DEMO_NAME,
      `${slug}: no demo name left`
    )
  }
  // Kept on purpose, not a failure of the model: the report does not say the model wrote nothing for them.
  const said = JSON.stringify(report.rewritten?.skipped ?? [])
  assert.doesNotMatch(said, /pages\/(?:terms|privacy)/, said)
})
