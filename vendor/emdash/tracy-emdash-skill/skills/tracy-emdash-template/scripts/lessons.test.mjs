// The lessons ledger: the catalog holds its own format (every record cites a line that still says what
// it cites, every detector is used and every pointer resolves), and each detector has one fixture where
// the trap is present (unresolved) and one where it is not (clear). Skill-level: runs from the skill
// folder, not inside a template (`npm run test:docs`).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { citedLine, DETECTORS, LEDGER, loadLedger, PHASES, scan } from './lessons.mjs'

const SKILL = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const CLI = path.join(SKILL, 'scripts', 'lessons.mjs')

describe('lessons ledger — the catalog', () => {
  const ledger = loadLedger()
  it('records: ids ascending and unique, one kind each, bounded symptom, a cite that still holds', () => {
    const ids = ledger.map((r) => r.id)
    assert.deepEqual(ids, [...ids].sort(), 'ascending')
    assert.equal(new Set(ids).size, ids.length, 'unique')
    for (const r of ledger) {
      assert.match(r.id, /^E-\d{3}$/)
      assert.deepEqual(
        Object.keys(r),
        ['id', 'area', ...(r.when ? ['when'] : []), 'phase', 'sym', 'fix', 'ref', 'cite'],
        `${r.id}: keys in order; a detector record also names the phase that establishes what it checks`
      )
      if (r.when) assert.ok(DETECTORS[r.when], `${r.id}: detector ${r.when} exists`)
      assert.ok(PHASES.includes(r.phase), `${r.id}: phase ${r.phase}`)
      assert.ok(r.sym.length <= 100, `${r.id}: sym ≤ 100 characters`)
      const c = citedLine(r)
      assert.ok(c.ok, `${r.id}: ${c.why}`)
    }
  })
  it('every detector is used by a lesson, and a detector lesson points at the reference that holds its rule', () => {
    for (const d of Object.keys(DETECTORS))
      assert.ok(ledger.some((r) => r.when === d), `detector ${d} has no lesson`)
    for (const r of ledger.filter((x) => x.when)) {
      const [file, heading] = r.fix.split('#')
      assert.match(file, /^references\/[\w./-]+\.md$/, `${r.id}: fix is a reference`)
      const text = readFileSync(path.join(SKILL, file), 'utf8')
      if (heading) assert.ok(text.split('\n').some((l) => /^#+ /.test(l) && l.includes(heading)), `${r.id}: heading ${heading}`)
    }
  })
  it('references/lessons.md states the same phase for each detector as its records', () => {
    const md = readFileSync(path.join(SKILL, 'references', 'lessons.md'), 'utf8')
    for (const r of ledger.filter((x) => x.when)) {
      const row = md.split('\n').find((l) => l.startsWith(`| \`${r.when}\` |`))
      assert.ok(row, `lessons.md has a row for ${r.when}`)
      assert.ok(row.includes(`| ${r.phase} | `) && row.includes(r.id), `${r.when}: ${r.phase}, ${r.id} in "${row}"`)
    }
  })
  it('a moved line is caught: a cite checked against the wrong line fails', () => {
    const r = { ...ledger[0], ref: ledger[0].ref.replace(/:(\d+)$/, (_, n) => `:${Number(n) + 1}`) }
    assert.equal(citedLine(r).ok, false)
  })
})

// A template where no trap is present. Each detector case then breaks exactly one file.
const CLEAN = {
  'package.json': '{"name":"t","private":true}\n',
  'astro.config.mjs':
    "// prefixDefaultLocale: true is wrong here, see SKILL.md\nexport default { i18n: { defaultLocale: 'en', locales: ['en', 'ru'] } }\n",
  'src/layouts/Base.astro': "---\nimport '../styles/global.css'\n---\n<slot />\n",
  'src/components/Icon.astro': '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>\n',
  'src/styles/global.css': '@import "tailwindcss";\n',
  'seed/seed.json': JSON.stringify({ content: { pages: [{ data: { title: 'Home' } }] } }),
  'qa.contract.json': JSON.stringify({ distribution: { include: ['Dockerfile', 'tools/', 'src', 'seed'] } }),
  Dockerfile:
    'FROM node:24 AS build\nARG TRACY_CONTENT_API_SCALARS=1\nENV TRACY_CONTENT_API_SCALARS=$TRACY_CONTENT_API_SCALARS\nFROM node:24\nARG TRACY_CONTENT_API_SCALARS=1\nENV TRACY_CONTENT_API_SCALARS=$TRACY_CONTENT_API_SCALARS\n',
  'tools/docker-entrypoint.sh': '#!/bin/sh\n',
  'tools/personalize.mjs': '// the kit tool\n',
  'seed/questions.json': JSON.stringify({
    schemaVersion: 'tracy-questions/v1',
    languages: ['en'],
    questions: [{ id: 'name', label: { en: 'Business name' } }]
  }),
  'seed/personalize.json': JSON.stringify({
    schemaVersion: 'tracy-personalize/v1',
    identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{name}' }]
  })
}
// detector → the change that plants its trap (null deletes the file)
const TRAPS = {
  'astro-i18n-prefix': {
    'astro.config.mjs': "export default { i18n: { defaultLocale: 'en', locales: ['en'], routing: { prefixDefaultLocale: true } } }\n"
  },
  'astro-i18n-fallback': {
    'astro.config.mjs': "export default { i18n: { defaultLocale: 'en', locales: ['en', 'ru'], fallback: { ru: 'en' } } }\n"
  },
  'global-css-once': { 'src/pages/admin-ish.astro': "---\nimport '../styles/global.css?inline'\n---\n" },
  'seed-media': {
    'seed/seed.json': JSON.stringify({ content: { pages: [{ data: { image: { $media: { url: 'https://x/a.jpg' } } } }] } })
  },
  'dockerfile-in-dist': { 'qa.contract.json': JSON.stringify({ distribution: { include: ['src', 'seed'] } }) },
  'dockerfile-content-api': {
    Dockerfile: 'FROM node:24 AS build\nENV TRACY_CONTENT_API_SCALARS=1\nFROM node:24\nENV OTHER=1\n'
  },
  'pack-forbidden': { 'PACK/data/data.db': 'sqlite', 'PACK/seed/x.token': 'secret' },
  'icon-font': { 'src/components/Icon.astro': '<i class="fa-solid fa-phone"></i>\n' },
  'personalize-placeholder': { 'seed/personalize.json': JSON.stringify({ identity: [{ value: '__THE DEMO BRAND' }] }) }
}

function build(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lessons-'))
  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue
    mkdirSync(path.join(dir, path.dirname(name)), { recursive: true })
    writeFileSync(path.join(dir, name), body)
  }
  mkdirSync(path.join(dir, 'PACK', 'tools'), { recursive: true })
  for (const f of ['Dockerfile', 'tools/docker-entrypoint.sh'])
    if (!existsSync(path.join(dir, 'PACK', f))) writeFileSync(path.join(dir, 'PACK', f), 'x\n')
  return dir
}

describe('lessons scan — one positive and one negative fixture per detector', () => {
  it('every detector has a trap fixture', () => assert.deepEqual(Object.keys(TRAPS).sort(), Object.keys(DETECTORS).sort()))
  for (const [detector, trap] of Object.entries(TRAPS)) {
    it(`${detector}: clear on the clean template, unresolved with the trap planted`, () => {
      const clean = build(CLEAN),
        dirty = build({ ...CLEAN, ...trap })
      try {
        const ids = loadLedger().filter((r) => r.when === detector).map((r) => r.id)
        const a = scan(clean, { pack: path.join(clean, 'PACK') })
        for (const id of ids) assert.ok(a.clear.some((r) => r.id === id), `${id} clear on the clean fixture: ${JSON.stringify([...a.unresolved, ...a.unknown, ...a.notChecked].find((r) => r.id === id))}`)
        const b = scan(dirty, { pack: path.join(dirty, 'PACK') })
        for (const id of ids) assert.ok(b.unresolved.some((r) => r.id === id), `${id} unresolved with the trap`)
        assert.deepEqual(
          b.unresolved.filter((r) => r.when !== detector).map((r) => r.id),
          [],
          'the trap trips only its own detector'
        )
      } finally {
        rmSync(clean, { recursive: true, force: true })
        rmSync(dirty, { recursive: true, force: true })
      }
    })
  }
  it('an absent input is "not checked", never clear; an unreadable one is unknown', () => {
    const dir = build({ ...CLEAN, 'seed/seed.json': null, 'seed/personalize.json': null })
    try {
      const r = scan(dir)
      const notChecked = r.notChecked.map((x) => x.when)
      for (const d of ['seed-media', 'personalize-placeholder', 'pack-forbidden']) assert.ok(notChecked.includes(d), d)
      writeFileSync(path.join(dir, 'seed/seed.json'), '{ not json')
      assert.ok(scan(dir).unknown.some((x) => x.when === 'seed-media'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('lessons scan --phase — a detector runs once its phase is behind', () => {
  it('a new-template.sh starter scanned before P1, P2 and P3 exits 0; the same detectors fire before the phase after theirs', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'lessons-starter-'))
    const starter = path.join(base, 'starter')
    try {
      const made = spawnSync('bash', [path.join(SKILL, 'scripts', 'new-template.sh'), starter, '@tracy/emdash-theme-x', 'tracy-x'], { encoding: 'utf8' })
      assert.equal(made.status, 0, made.stderr)
      const run = (phase) => spawnSync(process.execPath, [CLI, 'scan', starter, ...(phase ? ['--phase', phase] : [])], { encoding: 'utf8' })
      for (const phase of ['P0', 'P1', 'P2', 'P3']) {
        const r = run(phase)
        assert.equal(r.status, 0, `before ${phase}: ${r.stderr}`)
      }
      // the layout (E-003, P3) and the personalization map (E-009, P4.5) are the starter's open work
      let r = run('P3')
      assert.match(r.stdout, /^E-003 · /m, 'P3 lists its own detector lessons as reminders')
      r = run('P4')
      assert.equal(r.status, 1)
      assert.match(r.stderr, /^unresolved E-003: /m)
      assert.doesNotMatch(r.stderr, /unresolved E-009/, 'personalization is P4.5 work')
      r = run('P5')
      assert.match(r.stderr, /^unresolved E-009: /m)
      assert.equal(run(null).status, 1, 'no --phase runs every detector')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('lessons CLI — exit codes and output', () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  it('scan: 0 clean, 1 unresolved (its line first), 2 unknown or usage; --phase filters the read records; show', () => {
    const clean = build(CLEAN),
      dirty = build({ ...CLEAN, ...TRAPS['seed-media'] })
    try {
      const ledger = loadLedger()
      let r = run(['scan', clean, '--pack', path.join(clean, 'PACK')])
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stderr, /^lessons scan: unresolved=0 clear=9 not-checked=0 unknown=0 read=\d+$/m, 'no --phase: every detector')
      r = run(['scan', clean, '--pack', path.join(clean, 'PACK'), '--phase', 'P4'])
      assert.equal(r.status, 0, r.stderr)
      assert.deepEqual(
        r.stdout.trim().split('\n').map((l) => l.split(' · ')[0]),
        ledger.filter((x) => x.phase === 'P4').map((x) => x.id)
      )
      const before = ledger.filter((x) => x.when && PHASES.indexOf(x.phase) < PHASES.indexOf('P4')).length
      assert.match(r.stderr, new RegExp(`^lessons scan: unresolved=0 clear=${before} not-checked=0 unknown=0 read=\\d+ later=\\d+ \\(before P4\\)$`, 'm'))
      r = run(['scan', dirty])
      assert.equal(r.status, 1)
      assert.match(r.stdout.split('\n')[0], /^E-004 · .* · references\/content-model\.md$/)
      assert.match(r.stderr, /unresolved E-004: \$media at \/content\/pages\[0\]\/data\/image/)
      assert.match(r.stderr, /not checked E-007: no --pack/)
      writeFileSync(path.join(dirty, 'seed/seed.json'), '{')
      assert.equal(run(['scan', dirty]).status, 2, 'a detector that cannot decide wins over a finding')
      assert.equal(run(['scan']).status, 2)
      assert.equal(run(['scan', clean, '--phase', 'P9']).status, 2)
      assert.equal(run(['scan', path.join(clean, 'src')]).status, 2, 'not a template folder')
      r = run(['show', 'E-021'])
      assert.equal(r.status, 0)
      assert.match(r.stdout, /SKILL\.md:\d+: .*entry\.data\.id/)
      assert.equal(run(['show', 'E-999']).status, 2)
    } finally {
      rmSync(clean, { recursive: true, force: true })
      rmSync(dirty, { recursive: true, force: true })
    }
  })
  it('the ledger the CLI reads is references/lessons.jsonl', () => assert.equal(LEDGER, path.join(SKILL, 'references', 'lessons.jsonl')))
})
