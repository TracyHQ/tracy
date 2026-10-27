import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chunkGroups, chunkPrompt, findingKey, findingRows, lensSample, buildLensWork, manifestId, MODEL_CHOICES, RECOMMENDED_MODEL, recommendedModelOf } from '../visual/lens-work.mjs'
import { machineNotes } from '../visual/report.mjs'
import { shotProjection } from '../visual/evidence.mjs'
import { checkLensWork, mergeChunks, mergeRun, planRun, readOpened, readTable } from '../visual/notes.mjs'
import { contractHash } from '../lib/canonical.mjs'

const NOTES = fileURLToPath(new URL('../visual/notes.mjs', import.meta.url))
const page = (id, layout, locale = 'en') => ({ id, layout, locale, path: `/${locale === 'en' ? '' : `${locale}/`}${id.replace(/^[a-z]{2}-/, '')}/`, variants: ['1440-light', '390-light'] })
const CONTRACT = {
  pages: [page('en-home', 'home'), page('en-about', 'page'), page('ru-about', 'page', 'ru'), page('en-team', 'page'), page('en-jobs', 'page'), page('en-news', 'page')],
  layouts: [
    { id: 'home', representative: 'en-home', pages: ['en-home'] },
    { id: 'page', representative: 'en-about', pages: ['en-about', 'ru-about', 'en-team', 'en-jobs', 'en-news'] }
  ],
  variants: [
    { id: '1440-light', width: 1440, theme: 'light' },
    { id: '390-light', width: 390, theme: 'light' }
  ],
  visual: {
    stages: [
      { id: 'light-desktop', variants: ['1440-light'] },
      { id: 'light-responsive', variants: ['390-light'] }
    ],
    shots: [
      { side: 'site', stages: ['light-desktop'], locales: ['en', 'ru'], consumers: ['layout', 'typography', 'color'] },
      { side: 'source', stages: ['light-desktop'], locales: ['en'], consumers: ['layout'] },
      { side: 'site', stages: ['light-responsive'], locales: ['en'], consumers: ['typography'] }
    ]
  }
}
const contract = CONTRACT
const row = (pg, what, { axis = '1440-light', stage = 'light-desktop', kind = 'parity-mismatch' } = {}) => ({ lens: `machine:${kind}`, page: pg, axis, stage, what })
const H1 = (size, where = '') => JSON.stringify({ element: `h1 "Title"${where}`, deltas: [{ property: 'font-size', expected: '40px', observed: size }] })

test('lens sample: the representative is read; a page whose findings the representative also has is not; a page with a finding of its own is', () => {
  const machine = [
    row('en-about', H1('52px')),
    // the same finding on another page of the layout, its own path in the text: covered
    row('en-team', H1('52px')),
    row('en-team', JSON.stringify({ href: '/team/' }), { kind: 'identity-mismatch' }),
    row('en-about', JSON.stringify({ href: '/about/' }), { kind: 'identity-mismatch' }),
    // the same element, another observed value: not covered
    row('en-jobs', H1('60px')),
    // a stage the sample is not for is not counted
    row('en-news', H1('70px'), { axis: '390-light', stage: 'light-responsive' })
  ]
  const s = lensSample(contract, 'light-desktop', machine)
  assert.deepEqual(s.errors, [])
  assert.deepEqual(s.representatives.map((r) => r.page).sort(), ['en-about', 'en-home', 'ru-about'], 'every locale on the representative route')
  assert.deepEqual(s.extras.map((x) => x.page), ['en-jobs'])
  assert.equal(s.extras[0].representative, 'en-about')
  assert.equal(s.extras[0].findings.length, 1)
  assert.deepEqual(lensSample(contract, 'light-responsive', machine).extras.map((x) => x.page), ['en-news'])
})

test('lens sample: the key is the whole finding — expected, observed, stage, variant and kind each make a finding the page\'s own', () => {
  const rep = row('en-about', H1('52px'))
  const cases = {
    observed: row('en-team', H1('53px')),
    expected: row('en-team', H1('52px').replace('"40px"', '"41px"')),
    element: row('en-team', H1('52px', ' .hero')),
    kind: row('en-team', H1('52px'), { kind: 'rule-mismatch' }),
    variant: row('en-team', H1('52px'), { axis: '1440-dark' }),
    stage: { ...row('en-team', H1('52px')), stage: 'dark-desktop' }
  }
  const t = contract.pages.find((p) => p.id === 'en-team')
  const a = contract.pages.find((p) => p.id === 'en-about')
  assert.equal(findingKey(row('en-team', H1('52px')), t), findingKey(rep, a), 'only the page itself is blanked')
  for (const [what, r] of Object.entries(cases)) assert.notEqual(findingKey(r, t), findingKey(rep, a), what)
  const s = lensSample(contract, 'light-desktop', [rep, cases.observed])
  assert.deepEqual(s.extras.map((x) => x.page), ['en-team'])
})

test('lens sample: findings that differ only past the 300 characters machine.json keeps are different — the sample reads the whole finding from visual.json', () => {
  const long = (label) => ({ kind: 'parity-mismatch', element: `p "${'x'.repeat(320)}${label}"`, deltas: [{ property: 'margin-top', expected: '24px', observed: '24.5px' }] })
  const pages = [
    { id: 'en-about', axes: [{ variant: '1440-light', stage: 'light-desktop', findings: [long(' about')] }] },
    { id: 'en-team', axes: [{ variant: '1440-light', stage: 'light-desktop', findings: [long(' team')] }] }
  ]
  const cut = machineNotes(pages, () => 'light-desktop')
  assert.equal(cut[0].what, cut[1].what, 'the machine.json cut hides the difference')
  const rows = findingRows(pages, () => 'light-desktop')
  assert.ok(rows[1].what.includes(' team'))
  assert.deepEqual(lensSample(contract, 'light-desktop', rows).extras.map((x) => x.page), ['en-team'])
})

test('lens sample: a finding on a page the contract does not have, or a page in no listed layout, is an error, not skipped', () => {
  const s = lensSample({ ...contract, pages: [...contract.pages, page('en-lost', 'gone')] }, 'light-desktop', [row('en-ghost', 'x')])
  assert.equal(s.errors.length, 2, s.errors.join('\n'))
  assert.match(s.errors.join('\n'), /en-ghost/)
  assert.match(s.errors.join('\n'), /en-lost is in layout gone/)
})

test('chunks: every group exactly once, deterministic, the spread never above the heaviest group; N above the group count gives one chunk a group', () => {
  let seed = 7
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  for (let round = 0; round < 50; round++) {
    const groups = Array.from({ length: 1 + Math.floor(rand() * 30) }, (_, i) => ({ key: `p${i}|1440-light`, weight: 1 + Math.floor(rand() * 12) }))
    for (const n of [1, 2, 3, 4, 7, 50]) {
      const cut = chunkGroups(groups, n)
      assert.equal(cut.length, Math.min(n, groups.length))
      const keys = cut.flatMap((c) => c.groups)
      assert.deepEqual([...keys].sort(), groups.map((g) => g.key).sort(), 'each group once')
      const w = cut.map((c) => c.weight)
      assert.ok(Math.max(...w) - Math.min(...w) <= Math.max(...groups.map((g) => g.weight)), `spread ${w}`)
      assert.deepEqual(chunkGroups([...groups].reverse(), n), cut, 'input order does not matter')
    }
  }
  for (const bad of [0, -1, 1.5, NaN]) assert.throws(() => chunkGroups([], bad), /positive integer/)
})

// ─── a run on disk: contract, visual.json with findings, index.json with tiles
function runFixture({ extraShot = true, untiled = false, jobsSource = true, sourceOpened = true, jobsFinding = null, sourceShotError = null, jobs = 'en-jobs' } = {}) {
  // `jobs` renames the page with its own finding — another locale moves it out of every shot's `locales`
  const contract = jobs === 'en-jobs' ? CONTRACT : { ...CONTRACT, pages: CONTRACT.pages.map((p) => (p.id === 'en-jobs' ? page(jobs, 'page', jobs.slice(0, 2)) : p)) }
  const root = mkdtempSync(path.join(tmpdir(), 'lens-work-'))
  const run = path.join(root, 'run')
  mkdirSync(path.join(run, 'notes'), { recursive: true })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  // the findings as visual.json holds them (the plan reads these, not machine.json's cut)
  const findings = { 'en-about': [H1('52px')], 'en-team': [H1('52px')], [jobs]: [jobsFinding ?? H1('60px')] }
  // pictures by (page, side): the axes record them as the producer does (relative to the run), and index.json is the projection of the axes
  const pics = new Map()
  const tiles = (name, n) =>
    Array.from({ length: n }, (_, i) => {
      const rel = `shots/${name}/${i}.png`
      mkdirSync(path.dirname(path.join(run, rel)), { recursive: true })
      writeFileSync(path.join(run, rel), `${name} ${i}`)
      return rel
    })
  const shoot = (pg, side, n, consumers) => {
    const name = `${pg}--1440-light${side === 'source' ? '--source' : ''}`
    pics.set(`${pg}|${side}`, { rel: `shots/${name}.png`, tiles: untiled && pg === jobs ? [] : tiles(name, n), consumers })
  }
  shoot('en-home', 'site', 6, ['layout', 'typography', 'color'])
  shoot('en-home', 'source', 5, ['layout'])
  shoot('en-about', 'site', 3, ['layout', 'typography', 'color'])
  shoot('en-about', 'source', 3, ['layout'])
  shoot('ru-about', 'site', 3, ['layout', 'typography', 'color'])
  if (extraShot) {
    shoot(jobs, 'site', 2, ['layout', 'color'])
    if (jobsSource) shoot(jobs, 'source', 2, ['layout'])
  }
  const axisOf = (p) => {
    const site = pics.get(`${p.id}|site`)
    const source = pics.get(`${p.id}|source`)
    const found = (findings[p.id] ?? []).map((f) => ({ kind: 'parity-mismatch', ...JSON.parse(f) }))
    return {
      variant: '1440-light', width: 1440, theme: 'light', layout: p.layout, components: [], accepted: [], scans: {}, measured: 'now', stage: 'light-desktop',
      coverage: { examined: 1, classified: 0, unclassified: [] }, menus: { measured: false, reason: 'the page declares no source to open its menus on (none)' },
      // `sourceMotion` is what a run records when it opened the source for the axis
      ...(sourceOpened ? { sourceMotion: {} } : {}), ...(sourceShotError && p.id === jobs ? { sourceShotError } : {}),
      screenshot: site ? site.rel : null, shotConsumers: site ? site.consumers : null, ...(site ? { tiles: site.tiles, tilesCoverPicture: true } : {}),
      ...(source ? { sourceScreenshot: source.rel, sourceConsumers: source.consumers, sourceTiles: source.tiles, sourceTilesCoverPicture: true } : {}),
      findings: found
    }
  }
  const pages = contract.pages.map((p) => {
    const axis = axisOf(p)
    return { id: p.id, hash: `sha256:${p.id}`, axes: [axis], findings: axis.findings.map((f) => ({ ...f, axis: axis.variant })) }
  })
  const total = pages.reduce((n, p) => n + p.findings.length, 0)
  const visual = {
    contract: contractFile,
    identity: { contractHash: contractHash(contract) },
    scope: { kind: 'full', plan: null },
    stages: [
      { id: 'light-desktop', status: total ? 'fail' : 'pass', variants: ['1440-light'], pages: pages.length, axes: pages.length, findings: total, reused: 0 },
      { id: 'light-responsive', status: 'not-run', variants: ['390-light'], pages: 0, axes: 0, findings: 0, reused: 0 }
    ],
    summary: { findings: total, pages: pages.length, axes: pages.length, reused: 0 },
    pages
  }
  writeFileSync(path.join(run, 'visual.json'), JSON.stringify(visual))
  const projected = shotProjection({ pages, out: path.resolve(run) })
  writeFileSync(path.join(run, 'index.json'), JSON.stringify(projected))
  const shots = projected.shots
  return { root, run, contractFile, shots }
}
const chunkNote = (m, a, { opened = null, rows = [], first = null } = {}) => {
  const files = opened ?? a.groups.flatMap((k) => m.groups.find((g) => g.key === k).tiles.map((t) => t.file))
  return [first ?? `Lens-work: ${m.id} chunk ${a.chunk}/${m.chunks}`, '', '## Opened', ...files.map((f) => `- ${f}`), '', '## Notes', '| Page | Axis | What | Where | Fix | Verify | Flag |', '|---|---|---|---|---|---|---|', ...rows, ''].join('\n')
}

test('lens work plan: representatives and the page with its own finding, cut into balanced self-contained chunks; the covered page is not read', () => {
  const fx = runFixture()
  try {
    const m = planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 3 })
    assert.deepEqual(m.groups.map((g) => [g.page, g.reason]), [['en-about', 'representative'], ['en-home', 'representative'], ['en-jobs', 'finding'], ['ru-about', 'representative']])
    assert.ok(!m.groups.some((g) => g.page === 'en-team'), 'a page whose findings the representative has is not read')
    assert.equal(m.tiles, 24)
    assert.equal(m.chunks, 3)
    assert.deepEqual(m.assignments.map((a) => a.tiles), [11, 6, 7])
    assert.ok(m.load.max - m.load.min <= m.load.maxGroup)
    // each group in one chunk, site and source together
    const keys = m.assignments.flatMap((a) => a.groups)
    assert.equal(new Set(keys).size, m.groups.length)
    assert.deepEqual(m.groups.find((g) => g.page === 'en-home').tiles.map((t) => t.side), ['site', 'site', 'site', 'site', 'site', 'site', 'source', 'source', 'source', 'source', 'source'])
    // the prompt carries everything: identity, brief, tiles, the finding that brought the page, the output
    const jobs = m.assignments.find((a) => a.groups.includes('en-jobs|1440-light'))
    const prompt = readFileSync(jobs.prompt, 'utf8')
    assert.ok(prompt.startsWith(`Lens-work: ${m.id} chunk ${jobs.chunk}/3\n`))
    for (const t of m.groups.find((g) => g.page === 'en-jobs').tiles) assert.ok(prompt.includes(`- ${t.file}`), t.file)
    assert.match(prompt, /Machine findings only this page has \(1, in full/)
    assert.match(prompt, /60px/)
    assert.ok(prompt.includes(jobs.output))
    assert.match(prompt, /nav wrapping/)
    // colour: only the pictures the contract gives that lens
    const c = planRun(fx.run, { stage: 'light-desktop', lens: 'color', chunks: 8 })
    assert.equal(c.chunks, 4, 'no more chunks than groups')
    assert.ok(c.groups.every((g) => g.tiles.every((t) => t.side === 'site')))
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work plan: the recommended model is in the manifest (and its id) and on the second line of every prompt; an older or odd manifest inherits', () => {
  const fx = runFixture()
  try {
    for (const lens of ['layout', 'color']) assert.ok(MODEL_CHOICES.includes(RECOMMENDED_MODEL[lens]), lens)
    const m = planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    assert.equal(m.recommendedModel, RECOMMENDED_MODEL.layout)
    for (const a of m.assignments) {
      const lines = readFileSync(a.prompt, 'utf8').split('\n')
      assert.equal(lines[0], `Lens-work: ${m.id} chunk ${a.chunk}/2`, 'the identity line stays first')
      assert.ok(lines[1].startsWith(`Model: ${RECOMMENDED_MODEL.layout} — `), lines[1])
      assert.match(lines[1], /§Model per role/)
    }
    // the recommendation is bound by the manifest id: an edit makes the manifest refused
    const file = path.join(fx.run, 'notes', 'lens-work', 'light-desktop--layout', 'manifest.json')
    const other = MODEL_CHOICES.find((x) => x !== m.recommendedModel)
    writeFileSync(file, JSON.stringify({ ...m, recommendedModel: other }))
    assert.match(checkLensWork(fx.run, 'light-desktop')[0].errors.join('\n'), /manifest edited or misplaced/)
    // a manifest planned before the field existed keeps its id, is checked as before, and inherits
    const { recommendedModel: _r, ...old } = m
    const legacy = { ...old, id: manifestId(old) }
    writeFileSync(file, JSON.stringify(legacy))
    assert.ok(!checkLensWork(fx.run, 'light-desktop')[0].errors.some((e) => /manifest edited/.test(e)))
    assert.equal(recommendedModelOf(legacy), 'inherit')
    assert.match(chunkPrompt(legacy, 1).split('\n')[1], /^Model: inherit — .*without `model`; a CLI fan-out passes that model by name \(`claude -p --model <dispatcher's model>`\), never a bare `claude -p`/)
    // a value outside the choices is never handed on as a model name
    for (const odd of ['opus', 'inherit; rm -rf /', '', null, 42]) {
      assert.equal(recommendedModelOf({ recommendedModel: odd }), 'inherit', String(odd))
      assert.match(chunkPrompt({ ...m, recommendedModel: odd }, 1).split('\n')[1], /^Model: inherit — /)
    }
    assert.equal(recommendedModelOf(null), 'inherit')
    assert.match(chunkPrompt({ ...m, recommendedModel: 'haiku' }, 1).split('\n')[1], /^Model: haiku — .*Agent tool `model: "haiku"`, or `claude -p --model haiku`/)
    // the layout lens runs on Sonnet (measured on Nova), and its line names the Opus pass of the final checkpoint
    assert.equal(RECOMMENDED_MODEL.layout, 'sonnet')
    assert.match(chunkPrompt({ ...m, recommendedModel: 'sonnet' }, 1).split('\n')[1], /^Model: sonnet — .*Agent tool `model: "sonnet"`.*final checkpoint before release one more pass .* Opus/)
    // the colour lens carries its own recommendation
    assert.equal(planRun(fx.run, { stage: 'light-desktop', lens: 'color', chunks: 1 }).recommendedModel, RECOMMENDED_MODEL.color)
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work plan CLI names the recommended model for the dispatcher; merge-chunks folds chunks of a manifest that carries it', () => {
  const fx = runFixture()
  try {
    const r = spawnSync(process.execPath, [NOTES, 'plan', fx.run, '--stage', 'light-desktop', '--lens', 'layout', '--chunks', '2'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.model, RECOMMENDED_MODEL.layout)
    const m = JSON.parse(readFileSync(path.join(fx.run, 'notes', 'lens-work', 'light-desktop--layout', 'manifest.json'), 'utf8'))
    assert.equal(m.recommendedModel, out.model)
    for (const a of m.assignments) writeFileSync(a.output, chunkNote(m, a))
    assert.equal(mergeChunks(fx.run, 'light-desktop', 'layout').chunks, 2)
    assert.deepEqual(checkLensWork(fx.run, 'light-desktop').map((w) => w.errors), [[]])
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work plan refuses: a selected page without pictures, another contract, a bad lens, stage or N — and the CLI says so', () => {
  const fx = runFixture({ extraShot: false })
  try {
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), /en-jobs 1440-light: no site picture for the layout lens \(findings its representative en-about does not have\)/)
    const other = { ...contract, pages: contract.pages.slice(0, 5) }
    const otherFile = path.join(fx.root, 'other.json')
    writeFileSync(otherFile, JSON.stringify(other))
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2, contractPath: otherFile }), /not the one the run measured/)
    const base = { runDir: fx.run, stage: 'light-desktop', lens: 'layout', chunks: 2, contract, visual: { identity: { contractHash: contractHash(contract) }, pages: [] }, index: { shots: [] }, files: {}, hashOf: () => 'h' }
    assert.throws(() => buildLensWork({ ...base, lens: 'typography' }), /lens must be one of layout, color/)
    assert.throws(() => buildLensWork({ ...base, stage: 'nope' }), /unknown stage nope/)
    assert.throws(() => buildLensWork({ ...base, chunks: 0 }), /positive integer/)
    assert.throws(() => buildLensWork({ ...base, index: { shots: [{ page: 'en-ghost', stage: 'light-desktop', side: 'site', consumers: ['layout'] }] } }), /en-ghost is not a page of the contract/)
    assert.throws(() => buildLensWork({ ...base, visual: { pages: [] } }), /names no contract hash/)
    for (const argv of [['--lens', 'layout', '--chunks', '0'], ['--lens', 'layout', '--chunks', 'two'], ['--lens', 'layout'], ['--lens', 'images', '--chunks', '1']]) {
      const r = spawnSync(process.execPath, [NOTES, 'plan', fx.run, '--stage', 'light-desktop', ...argv], { encoding: 'utf8' })
      assert.equal(r.status, 2, `${argv.join(' ')}: ${r.stderr}`)
    }
    const r = spawnSync(process.execPath, [NOTES, 'plan', fx.run, '--stage', 'light-desktop', '--lens', 'layout', '--chunks', '2'], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /en-jobs/)
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work refuses required pictures when the selected page has no axis listing them', () => {
  const fx = runFixture()
  try {
    const visual = JSON.parse(readFileSync(path.join(fx.run, 'visual.json'), 'utf8'))
    const contract = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
    contract.pages = contract.pages.map((p) => p.id === 'en-home' ? { ...p, sourceRendered: 'reference/en-home.html' } : p)
    writeFileSync(fx.contractFile, JSON.stringify(contract))
    visual.identity.contractHash = contractHash(contract)
    visual.pages.find((p) => p.id === 'en-home').axes = []
    visual.summary.axes -= 1
    visual.stages[0].axes -= 1
    visual.stages[0].pages -= 1
    writeFileSync(path.join(fx.run, 'visual.json'), JSON.stringify(visual))
    const index = JSON.parse(readFileSync(path.join(fx.run, 'index.json'), 'utf8'))
    index.shots = index.shots.filter((s) => s.page !== 'en-home')
    writeFileSync(path.join(fx.run, 'index.json'), JSON.stringify(index))
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), /en-home 1440-light: no site picture[\s\S]*en-home 1440-light: no source picture[\s\S]*no axis lists this required picture/)
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work requires all contract-listed variant pictures when only some axes exist', () => {
  const fx = runFixture()
  try {
    const visual = JSON.parse(readFileSync(path.join(fx.run, 'visual.json'), 'utf8'))
    const contract = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
    visual.pages.find((p) => p.id === 'en-home').axes = [visual.pages.find((p) => p.id === 'en-home').axes[0]]
    // Stage fixture normally has one variant; add a second stage variant and leave its axis and pictures absent.
    contract.visual.stages[0].variants.push('wide')
    contract.variants.push({ id: 'wide', width: 1920, theme: 'light' })
    contract.pages = contract.pages.map((p) => p.id === 'en-home' ? { ...p, variants: ['1440-light'] } : p)
    writeFileSync(fx.contractFile, JSON.stringify(contract))
    visual.identity.contractHash = contractHash(contract)
    writeFileSync(path.join(fx.run, 'visual.json'), JSON.stringify(visual))
    const index = JSON.parse(readFileSync(path.join(fx.run, 'index.json'), 'utf8'))
    index.shots = index.shots.filter((s) => s.page !== 'en-home' || s.variant !== 'wide')
    writeFileSync(path.join(fx.run, 'index.json'), JSON.stringify(index))
    assert.doesNotThrow(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), 'wide is in the stage, but en-home does not declare that axis')
  } finally { rmSync(fx.root, { recursive: true, force: true }) }
})

test('lens work does not require source pictures for pages without a declared source', () => {
  const fx = runFixture()
  try {
    const contract = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
    contract.pages = contract.pages.map((p) => p.id === 'en-home' ? { ...p, sourceRendered: null, sourceRoute: null } : p)
    writeFileSync(fx.contractFile, JSON.stringify(contract))
    const visual = JSON.parse(readFileSync(path.join(fx.run, 'visual.json'), 'utf8'))
    visual.identity.contractHash = contractHash(contract)
    const home = visual.pages.find((p) => p.id === 'en-home')
    home.axes = []
    visual.summary.axes -= 1
    visual.stages[0].axes -= 1
    visual.stages[0].pages -= 1
    writeFileSync(path.join(fx.run, 'visual.json'), JSON.stringify(visual))
    const index = JSON.parse(readFileSync(path.join(fx.run, 'index.json'), 'utf8'))
    index.shots = index.shots.filter((s) => s.page !== 'en-home')
    writeFileSync(path.join(fx.run, 'index.json'), JSON.stringify(index))
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), (e) => /no site picture/.test(e.message) && !/no source picture/.test(e.message))
  } finally { rmSync(fx.root, { recursive: true, force: true }) }
})

test('lens work plan refuses a shot with no tiles: the full-page picture does not stand in for them', () => {
  const fx = runFixture({ untiled: true })
  try {
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), /en-jobs 1440-light site: no tiles in index\.json[\s\S]*en-jobs 1440-light source: no tiles/)
    assert.ok(!readdirOk(path.join(fx.run, 'notes', 'lens-work', 'light-desktop--layout', 'manifest.json')), 'no manifest written')
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work plan: a page with its own finding in a locale no shot lists is still read — the plan asks for its pictures, and takes them when shot', () => {
  const bare = runFixture({ jobs: 'de-jobs', extraShot: false })
  try {
    assert.throws(() => planRun(bare.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), /de-jobs 1440-light: no site picture for the layout lens \(findings its representative en-about does not have\)[\s\S]*de-jobs 1440-light: no source picture/)
    assert.throws(() => planRun(bare.run, { stage: 'light-desktop', lens: 'color', chunks: 2 }), /de-jobs 1440-light: no site picture for the color lens/)
  } finally {
    rmSync(bare.root, { recursive: true, force: true })
  }
  const shot = runFixture({ jobs: 'de-jobs' })
  try {
    const m = planRun(shot.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    const g = m.groups.find((x) => x.page === 'de-jobs')
    assert.equal(g.reason, 'finding')
    assert.deepEqual(g.tiles.map((t) => t.side), ['site', 'site', 'source', 'source'])
  } finally {
    rmSync(shot.root, { recursive: true, force: true })
  }
})

test('lens work plan refuses a selected page whose source picture is missing when the run compared it with the source; no source opened, none wanted', () => {
  const fx = runFixture({ jobsSource: false, sourceShotError: 'Target closed' })
  try {
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 }), /en-jobs 1440-light: no source picture for the layout lens \(findings its representative en-about does not have\) — the run failed to shoot it \(Target closed\)/)
    assert.ok(!readdirOk(path.join(fx.run, 'notes', 'lens-work', 'light-desktop--layout', 'manifest.json')), 'no manifest written')
    // the colour lens gets no source picture from the contract: nothing to miss
    assert.equal(planRun(fx.run, { stage: 'light-desktop', lens: 'color', chunks: 2 }).groups.length, 4)
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
  const none = runFixture({ jobsSource: false, sourceOpened: false })
  try {
    const m = planRun(none.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    assert.deepEqual(m.groups.find((g) => g.page === 'en-jobs').tiles.map((t) => t.side), ['site', 'site'], 'a run that opened no source has no source picture to ask for')
  } finally {
    rmSync(none.root, { recursive: true, force: true })
  }
})

test('lens work plan: the findings that brought a page are in its prompt whole, past the 300 characters machine.json keeps', () => {
  const tail = 'the difference is here, past the cut'
  const fx = runFixture({ jobsFinding: JSON.stringify({ element: `p "${'x'.repeat(400)}"`, deltas: [{ property: 'margin-top', expected: '24px', observed: tail }] }) })
  try {
    const m = planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 1 })
    const prompt = readFileSync(m.assignments[0].prompt, 'utf8')
    assert.match(prompt, /Machine findings only this page has \(1, in full/)
    assert.ok(prompt.includes(tail), 'the whole finding, not the cut')
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work merge: every chunk back and whole → one lens note with every Opened and row; missing, empty, foreign, malformed, half-read or stale chunks are refused', () => {
  const fx = runFixture()
  try {
    const m = planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    const [a1, a2] = m.assignments
    writeFileSync(a1.output, chunkNote(m, a1, { rows: ['| en-home | 1440-light | hero column squeezed \\| left | hero | widen | 50/50 | |'] }))
    const refused = (re) => {
      assert.throws(() => mergeChunks(fx.run, 'light-desktop', 'layout'), re)
      assert.ok(!readdirOk(path.join(fx.run, 'notes', 'layout.md')), 'no lens note written')
    }
    refused(new RegExp(`chunk 2 \\(${a2.output.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\): not written`))
    writeFileSync(a2.output, '  \n')
    refused(/chunk 2 .*: empty/)
    writeFileSync(a2.output, chunkNote(m, a2, { first: `Lens-work: 0000000000000000 chunk 2/2` }))
    refused(/another manifest or chunk/)
    writeFileSync(a2.output, chunkNote(m, a2).replace('| Page | Axis | What | Where | Fix | Verify | Flag |', '| Page | What |'))
    refused(/no ## Notes table/)
    // a table readTable would read short: no separator (the first row taken for it), a row after a gap, a row with an unescaped |
    const row1 = '| en-about | 1440-light | cards out of line | grid | align | one row | |'
    writeFileSync(a2.output, chunkNote(m, a2, { rows: [row1] }).replace('|---|---|---|---|---|---|---|\n', ''))
    refused(/not followed by its \|---\| separator/)
    writeFileSync(a2.output, chunkNote(m, a2, { rows: [row1, '', '| en-about | 1440-light | footer gap | footer | tighten | 24px | |'] }))
    refused(/table row after the table ended/)
    writeFileSync(a2.output, chunkNote(m, a2, { rows: ['| en-about | 1440-light | left | right split | grid | align | one row | |'] }))
    refused(/row 1 has 8 cells, not 7/)
    writeFileSync(a2.output, chunkNote(m, a2, { rows: ['|  | 1440-light | cards | grid | align | one row | |'] }))
    refused(/row 1 has no Page or What/)
    const a2files = a2.groups.flatMap((k) => m.groups.find((g) => g.key === k).tiles.map((t) => t.file))
    writeFileSync(a2.output, chunkNote(m, a2, { opened: a2files.slice(1) }))
    refused(/chunk 2: 1 tile\(s\) not opened/)
    // a tile opened under another path with the same bytes was looked at
    const copy = path.join(fx.root, 'copy.png')
    writeFileSync(copy, readFileSync(a2files[0]))
    writeFileSync(a2.output, chunkNote(m, a2, { opened: [copy, ...a2files.slice(1)] }))
    const merged = mergeChunks(fx.run, 'light-desktop', 'layout')
    assert.equal(merged.notes, 1)
    const note = readFileSync(path.join(fx.run, 'notes', 'layout.md'), 'utf8')
    assert.ok(note.split('\n').includes(`Lens-work: ${m.id}`))
    assert.equal(readOpened(note).length, m.tiles)
    assert.equal(readTable(note, '## Notes')[0].what, 'hero column squeezed | left')
    assert.deepEqual(checkLensWork(fx.run, 'light-desktop').map((w) => w.errors), [[]])
    // the notes merge hears the lens: every tile it was given is opened
    const r = mergeRun(fx.run, 'light-desktop')
    assert.ok(r.lenses.includes('layout'))
    assert.equal(r.coverage.missing.filter((x) => x.lens === 'layout').length, 0)
    // a tile redrawn after the plan makes the whole lens stale
    writeFileSync(m.groups[0].tiles[0].file, 'redrawn')
    assert.match(checkLensWork(fx.run, 'light-desktop')[0].errors.join('\n'), /stale: tile .* changed since the plan/)
    const stale = mergeRun(fx.run, 'light-desktop')
    assert.ok(!stale.lenses.includes('layout'), 'a stale lens is not heard')
    assert.ok(stale.coverage.missing.some((x) => x.lens === 'layout'), 'its pictures count as not opened')
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('lens work merge: an older lens note cannot stand in for a chunk that never came back; merge-chunks does not overwrite a note it did not write; a plan never overwrites chunk output', () => {
  const fx = runFixture()
  try {
    const note = path.join(fx.run, 'notes', 'layout.md')
    const all = JSON.parse(readFileSync(path.join(fx.run, 'index.json'), 'utf8')).shots.filter((s) => s.consumers.includes('layout')).flatMap((s) => s.tiles)
    writeFileSync(note, ['# layout', '## Opened', ...all.map((f) => `- ${f}`), '## Notes', '| Page | Axis | What | Where | Fix | Verify | Flag |', '|---|---|---|---|---|---|---|', ''].join('\n'))
    const layoutMissing = (r) => r.coverage.missing.filter((x) => x.lens === 'layout').length
    assert.equal(layoutMissing(mergeRun(fx.run, 'light-desktop')), 0, 'before a plan, the single note is heard')
    const m = planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    const r = mergeRun(fx.run, 'light-desktop')
    assert.ok(!r.lenses.includes('layout'))
    assert.equal(layoutMissing(r), all.length, 'every layout picture counts as not opened')
    assert.match(r.lensWork[0].errors.join('\n'), /chunk 1 .*not written/)
    const cli = spawnSync(process.execPath, [NOTES, 'merge', fx.run, '--stage', 'light-desktop'], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    assert.match(readFileSync(path.join(fx.run, 'NOTES-light-desktop.md'), 'utf8'), /## Lens work not whole[\s\S]*layout: chunk 1/)
    for (const a of m.assignments) writeFileSync(a.output, chunkNote(m, a))
    assert.throws(() => mergeChunks(fx.run, 'light-desktop', 'layout'), /exists and was not merged from this manifest/)
    assert.throws(() => planRun(fx.run, { stage: 'light-desktop', lens: 'layout', chunks: 3 }), /already holds chunk output/)
    rmSync(note)
    mergeChunks(fx.run, 'light-desktop', 'layout')
    mergeChunks(fx.run, 'light-desktop', 'layout')
    const ok = spawnSync(process.execPath, [NOTES, 'merge', fx.run, '--stage', 'light-desktop'], { encoding: 'utf8' })
    assert.equal(JSON.parse(ok.stdout).lensWork.length, 0, ok.stdout)
    // a chunk changed after the merge: the merged note of the same manifest is stale until merged again
    const a1 = m.assignments[0]
    const added = '| en-about | 1440-light | cards out of line | grid | align | one row | |'
    writeFileSync(a1.output, chunkNote(m, a1, { rows: [added] }))
    const after = mergeRun(fx.run, 'light-desktop')
    assert.ok(!after.lenses.includes('layout'), 'the stale merged note is not heard')
    assert.match(after.lensWork[0].errors.join('\n'), /notes\/layout\.md differs from its chunks as they are now/)
    assert.equal(layoutMissing(after), all.length)
    mergeChunks(fx.run, 'light-desktop', 'layout')
    const again = mergeRun(fx.run, 'light-desktop')
    assert.ok(again.lenses.includes('layout'))
    assert.ok(again.todos.some((t) => t.lenses.includes('layout') && t.what === 'cards out of line'), 'the added row is a todo')
    // an edit to the merged note itself is caught the same way
    writeFileSync(note, readFileSync(note, 'utf8').replace('cards out of line', 'cards fine'))
    assert.match(checkLensWork(fx.run, 'light-desktop')[0].errors.join('\n'), /differs from its chunks/)
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
})

function readdirOk(file) {
  try {
    readFileSync(file)
    return true
  } catch {
    return false
  }
}
