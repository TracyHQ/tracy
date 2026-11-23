// tools/personalize.mjs, a rewrite rule with `"unwritten": "empty"` never keeps another company's entry (TCH #1013, L4).
// Measured 11/10/2026 on dev (g65, Tracy Business 1.7.13, FULL, Vietnamese, a bakery): /careers kept the demo construction
// company's vacancies ("Kỹ sư dự toán", "luân phiên 15/15"); the build said "vacancies/estimator-take-off-and-budgets:
// nothing in the answer fitted the entry" and the template's words stood in the site's language. Product owner's decision:
// each entry is asked for the customer's trade, asked again with the reason its answer was not used, and when it is still
// not this business's, the fields the rule names are EMPTIED (as `facts` empties another company's claims) and the report
// says so, never another industry's job.
// The model here is disobedient on purpose and stays so on every retry: it hands back another job of the demo company, or
// answers under the wrong keys, or answers nothing usable. Written against its own tiny seed, so the kit and every
// template carry the same file.
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

/** Four demo roles of a construction company, each with its English root and its Vietnamese edition. */
const ROLES = {
  estimator: {
    en: { title: 'Estimator (take-off and budgets)', type: 'Full-time · 15/15 rotation' },
    vi: { title: 'Kỹ sư dự toán (bóc tách khối lượng)', type: 'Toàn thời gian · luân phiên 15/15' }
  },
  engineer: {
    en: { title: 'Structural engineer (steel / concrete)', type: 'Full-time · site office' },
    vi: { title: 'Kỹ sư kết cấu (thép / bê tông)', type: 'Toàn thời gian · văn phòng công trường' }
  },
  foreman: {
    en: { title: 'Steel erection foreman', type: 'Full-time · 30/30 rotation' },
    vi: { title: 'Giám sát lắp dựng kết cấu thép', type: 'Toàn thời gian · luân phiên 30/30' }
  },
  manager: {
    en: { title: 'Client relationship manager', type: 'Full-time · head office' },
    vi: { title: 'Quản lý quan hệ khách hàng', type: 'Toàn thời gian · trụ sở chính' }
  }
}
const vacancy = (slug, locale) => ({
  slug,
  locale,
  data: { ...ROLES[slug][locale], city: 'Lipetsk SEZ', pay: 'from RUB 220,000', sort: 0 }
})
const seed = {
  defaultLocale: 'en',
  content: {
    site: [{ slug: 'site', locale: 'en', data: { brand_name: 'NORTHGATE' } }],
    vacancies: Object.keys(ROLES).flatMap((slug) => [vacancy(slug, 'en'), vacancy(slug, 'vi')])
  }
}
const map = {
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  facts: [
    { collection: 'vacancies', field: 'city', why: 'a place' },
    { collection: 'vacancies', field: 'pay', why: 'a salary' }
  ],
  rewrite: [
    {
      collection: 'vacancies',
      brief: 'one open role at this business',
      fields: ['title', 'type'],
      decides: ['title'],
      unwritten: 'empty'
    }
  ]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-trade-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

/** Which demo role an asked entry is, from the demo words it carries (the slug never reaches the model). */
const roleOf = (asked) => {
  const words = [asked.example?.title, asked.example?.type, asked.given?.title]
  return (
    Object.keys(ROLES).find((slug) =>
      words.some((w) => w === ROLES[slug].en.title || w === ROLES[slug].en.type)
    ) ?? null
  )
}

/**
 * A disobedient model, the same on every ask: the estimator comes back as ANOTHER demo role in Vietnamese (the engineer's,
 * a construction job), the engineer under keys nobody asked for, the foreman as nothing usable; only the manager is
 * written for the bakery. Labels come back as `vi:<label>`.
 */
async function disobedientModel() {
  const asked = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages.at(-1).content)
    const system = body.messages[0].content
    let answer = {}
    if (user.labels)
      answer = Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${String(v)}`]))
    else if (Array.isArray(user.entries)) {
      asked.push({ system, entries: user.entries.map((e) => ({ ...e, role: roleOf(e) })) })
      answer = Object.fromEntries(
        user.entries.map((e) => {
          const role = roleOf(e)
          if (role === 'estimator') return [e.key, { ...ROLES.engineer.vi }]
          if (role === 'engineer') return [e.key, { job_title: 'Thợ làm bánh', kind: 'Bán thời gian' }]
          if (role === 'foreman') return [e.key, 'không']
          return [e.key, { title: 'Thợ làm bánh mì', type: 'Toàn thời gian · ca sáng' }]
        })
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
      {
        cwd: ROOT,
        env: { ...process.env, OPENROUTER_API_KEY: '', DEEPSEEK_API_KEY: '', ...env },
        maxBuffer: 64 * 1024 * 1024
      },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

/** Every demo word a vacancy may not keep: each role's title and its trade-specific type, in every edition. */
const DEMO_WORDS = Object.values(ROLES).flatMap((r) => [r.en.title, r.en.type, r.vi.title, r.vi.type])

test('a Vietnamese bakery whose model hands back construction jobs: those vacancies are emptied, never kept, and said', async () => {
  const mock = createMockEmdash()
  mock.state.addEntry('site', 'site', 'en', seed.content.site[0].data)
  for (const e of seed.content.vacancies.filter((x) => x.locale === 'en'))
    mock.state.addEntry('vacancies', e.slug, 'en', e.data)
  const url = await mock.listen()
  const model = await disobedientModel()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-trade-'))
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
        '--no-images',
        '--answers-json',
        JSON.stringify({
          name: 'Tamarind Bakery',
          about: 'A family bakery in Hanoi baking bread and cakes every morning.',
          languages: ['vi']
        })
      ],
      { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr.slice(-2000))
    const live = (slug) =>
      [...mock.state.entries.values()].find((e) => e.collection === 'vacancies' && e.slug === slug)

    // The role the model wrote for the bakery is the model's.
    assert.equal(live('manager').live.title, 'Thợ làm bánh mì')
    // The three it never wrote keep NO word of the construction company, in any edition.
    for (const slug of ['estimator', 'engineer', 'foreman']) {
      const e = live(slug)
      assert.equal(e.status, 'published', `${slug} stays on the site (the template's structure is kept)`)
      for (const f of ['title', 'type', 'city', 'pay'])
        assert.ok(
          !DEMO_WORDS.some((w) => String(e.live[f]).toLowerCase().includes(w.toLowerCase())) &&
            !/15\/15|30\/30|lipetsk|RUB/i.test(String(e.live[f])),
          `${slug}.${f} keeps another company's words: ${JSON.stringify(e.live[f])}`
        )
      assert.equal(e.live.title, '', `${slug}.title is emptied, not invented`)
      assert.equal(e.live.type, '', `${slug}.type is emptied, not invented`)
    }

    // Asked again, the model is told why its answer was not used, for each entry it failed.
    const retried = (role) =>
      model.asked.flatMap((a) => a.entries.filter((e) => e.role === role && typeof e.rejected === 'string'))
    for (const role of ['estimator', 'engineer', 'foreman'])
      assert.ok(retried(role).length > 0, `${role} was asked again with the reason`)
    assert.match(
      retried('estimator')[0].rejected,
      /demo company/i,
      'another demo role is named as the demo company’s'
    )
    assert.match(retried('engineer')[0].rejected, /title/, 'a missing key is named')
    assert.ok(
      model.asked.some((a) => /"rejected"/.test(a.system)),
      'the system prompt says what "rejected" means'
    )
    for (const a of model.asked)
      for (const e of a.entries)
        assert.ok(
          !String(e.rejected ?? '').match(/estimator|engineer|foreman|manager/),
          'a reason never names the demo entry’s slug'
        )

    // The report says what was emptied, and does not count it as the template's words kept.
    const emptied = report.rewritten.emptied ?? []
    assert.deepEqual(
      emptied.map((x) => x.entry).sort(),
      ['vacancies/engineer/en', 'vacancies/estimator/en', 'vacancies/foreman/en'],
      JSON.stringify(report.rewritten)
    )
    for (const x of emptied) {
      assert.deepEqual([...x.fields].sort(), ['title', 'type'])
      assert.match(x.why, /emptied/)
    }
    assert.ok(
      !report.rewritten.skipped.some((x) =>
        /vacancies\/(estimator|engineer|foreman)(\/|$|\.)/.test(String(x.entry ?? ''))
      ),
      `an emptied entry is not reported as keeping the template's words: ${JSON.stringify(report.rewritten.skipped)}`
    )
  } finally {
    await mock.close()
    model.close()
  }
})
