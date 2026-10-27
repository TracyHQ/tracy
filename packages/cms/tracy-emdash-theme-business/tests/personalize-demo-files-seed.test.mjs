// DEMO FILE LINKS with Tracy Business's REAL seed (TCH #1013, g61). Measured 10/10/2026 on g60-biz-emd-full (1.7.8, a bakery,
// Vietnamese): the hero's "Tải hồ sơ công ty (PDF)" still opened the demo company's brochure. The seed holds the button's
// link empty and `seed/media-map.json` says the importer fills it with the PDF; Apply ran this tool from the tracy-web image,
// which carried seed.json, personalize.json and questions.json but not media-map.json, so no file link was found, silently.
// Here: the importer's PDF on every entry the media map names, a FULL Vietnamese run, with and without the media map.
// The model is scripted to answer the copy with a download label every time: the link is the tool's, never the model's.
// BLANK (name only, g62, measured 11/10/2026 on g61-biz-emd-blank): the rule is FULL's alone. A blank site is the demo with the
// name swapped, so its hero keeps "Download company profile (PDF)" and its file; 1.7.9 re-pointed it to "Talk to our sales
// team" → /contact on every run.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const mediaMap = JSON.parse(readFileSync(path.join(SEED, 'media-map.json'), 'utf8'))
const PDF = '/_emdash/api/media/file/corporate-2026.pdf'

/** The site as the importer leaves it: the seed, with each document of the media map on the field it names. */
function site() {
  const mock = createMockEmdash()
  const items = Array.isArray(mediaMap.items) ? mediaMap.items : mediaMap
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) {
      const data = structuredClone(e.data ?? {})
      for (const item of items)
        if (!String(item.mime ?? 'image/').startsWith('image/'))
          for (const t of item.targets ?? [])
            if (
              t.collection === collection &&
              t.slug === e.slug &&
              (t.locale ?? 'en') === (e.locale ?? 'en') &&
              /^\w+$/.test(t.path)
            )
              data[t.path] = PDF
      mock.state.addEntry(collection, e.slug, e.locale ?? 'en', data)
    }
  return mock
}

/** A model that answers every copy field with a download promise, and every other question with something plausible. */
async function modelServer() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    let answer = {}
    if (user.labels) answer = Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${v}`]))
    else if (Array.isArray(user.parts)) answer = { body: user.parts.map((_, i) => `Phần ${String(i + 1)}`) }
    else if (Array.isArray(user.fields))
      answer = Object.fromEntries(user.fields.map((f) => [f.key, 'Tải hồ sơ công ty (PDF)']))
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
}

const FULL = { name: 'Golden Crust', about: 'A family bakery in Hanoi.', languages: ['vi'] }

async function run(seedDir, answers = FULL) {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'personalize-demo-files-'))
    writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
    const args = [
      TOOL,
      '--seed',
      seedDir,
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
    const root = [...mock.state.entries.values()].find(
      (e) => e.collection === 'home' && e.slug === 'home' && e.locale === (seed.defaultLocale ?? 'en')
    )
    const siteRow = [...mock.state.entries.values()].find(
      (e) => e.collection === 'site' && e.slug === 'site' && e.locale === (seed.defaultLocale ?? 'en')
    )
    return { report, home: root.live, site: siteRow?.live, stderr: r.stderr }
  } finally {
    await mock.close()
    model.close()
  }
}

test('FULL in Vietnamese with the seed as released: the brochure button leads to the contact page', async () => {
  const { report, home, site, stderr } = await run(SEED)
  assert.deepEqual(report.errors, [], stderr)
  assert.equal(home.hero_cta2_url, '/contact', 'never the demo company’s brochure')
  assert.ok(!report.skipped.some((s) => s.rule === 'demo-files'))
  // K6 + facts (g62): the profiles stay, their links and the demo company's lines under them do not, end to end in Vietnamese.
  const demoSocial = seed.content.site.find((e) => e.slug === 'site' && (e.locale ?? 'en') === 'en').data
    .social
  assert.equal(site.social.length, demoSocial.length)
  for (const [i, row] of site.social.entries()) {
    assert.equal(row.text, '', `social[${i}].text`)
    assert.equal(row.url, '', `social[${i}].url`)
    assert.ok(row.name, `social[${i}].name kept`)
  }
})

test('the seed as the tracy-web image used to carry it (no media map): the report says the file links could not be told', async () => {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'personalize-image-seed-')), 'seed')
  mkdirSync(dir)
  for (const f of ['seed.json', 'personalize.json', 'questions.json'])
    copyFileSync(path.join(SEED, f), path.join(dir, f))
  copyFileSync(path.join(ROOT, 'template.config.json'), path.join(dir, '..', 'template.config.json'))
  const { report, home, stderr } = await run(dir)
  assert.deepEqual(report.errors, [], stderr)
  assert.equal(
    home.hero_cta2_url,
    PDF,
    'without the media map the link cannot be told (the image now carries it)'
  )
  assert.ok(
    report.skipped.some((s) => s.rule === 'demo-files' && /media-map\.json/.test(s.why)),
    JSON.stringify(report.skipped)
  )
})

test('BLANK (name only): the brochure button stays the demo’s, file and label, the name swapped (BLANK = demo)', async () => {
  const { report, home, stderr } = await run(SEED, { name: 'Golden Crust' })
  assert.deepEqual(report.errors, [], stderr)
  const demo = seed.content.home.find(
    (e) => e.slug === 'home' && (e.locale ?? 'en') === (seed.defaultLocale ?? 'en')
  ).data
  assert.equal(home.hero_cta2_url, PDF, 'a blank site keeps the demo’s file link')
  assert.equal(home.hero_cta2_label, demo.hero_cta2_label, 'and the demo’s label, never a contact label')
})

// B4 (measured 13/10/2026 on the local stand, a Vietnamese bakery with only Home ticked): the brochure button was moved to
// /contact, a page the customer had unticked, so the hero's "Liên hệ tiệm bánh" opened a 404. With no open contact page the
// button has no honest destination: it goes, label and link, like any button to a page the customer unticked.
test('FULL with the contact page unticked: the brochure button goes, never to a closed page', async () => {
  const { report, home, stderr } = await run(SEED, { ...FULL, hidePages: ['contact'] })
  assert.deepEqual(report.errors, [], stderr)
  assert.equal(home.hero_cta2_url, '', 'neither the demo’s brochure nor the unticked /contact')
  assert.equal(home.hero_cta2_label, '', 'a label with no link is not drawn')
})
