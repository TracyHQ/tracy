/**
 * REG-PR-1134-ds-contracts-batch6: the eleven JA Joomla j6 quickstarts of batch 6 each carry a slot
 * contract, and only the measured ones are offered:
 *   - JA Purity IV, JA Spark (T4 Bootstrap 5 starters): their headings and light surfaces follow a
 *     worn system through --headings-color and --tpl-base-* (templateVars), restored to the
 *     template's own values inside a kept band; Spark's white .bg-white cards are a kept band;
 *   - JA Mono (T3): its dark footer and dark/highlight cards are kept bands;
 *   - the other eight are not offered, each with a readyNote naming what still fails.
 * S1 reads the contracts; S2 builds the Moxie module sheet for Purity IV and Spark; S3 restores
 * JA Purity IV's release, tokenizes it and wears four systems (pass-joomla.mjs). S3 needs Docker,
 * the fleet's Joomla image, Chrome and read access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { contractBase, loadContract, loadProfile } = await import(join(LIB, 'src/library.mjs'))
const { joomlaSlot } = await import(join(LIB, 'src/joomla.mjs'))
const c = checks()

// S1: every template of the batch has a contract; ready only where measured
const READY = ['ja-purity-iv', 'ja-spark', 'ja-mono']
// JA Rights, JA Stark and JA Titan were made ready in round 2 (REG-PR-1134-ds-contracts-r2b)
const ALL = [
  'ja-lawfirm',
  'ja-magz-ii',
  'ja-mason',
  'ja-mono',
  'ja-purity-iv',
  'ja-restaurant',
  'ja-spark',
  'ja-teline-v'
]
// round 2 (batch r2a, 11/10/2026) re-measured these four and offers them: their contracts and
// readyNotes now belong to REG-PR-1134-ds-contracts-r2a
// JA Restaurant was made ready from its tokenized 1.0.4 build (ds-remeasure-4, 11/10/2026): its
// contract and readyNote now belong to REG-PR-1134-ds-contracts-r2d and REG-PR-1134-ds-remeasure-4
const MOVED = ['ja-lawfirm', 'ja-magz-ii', 'ja-mason', 'ja-teline-v', 'ja-restaurant']
// A ready template re-measured since round 1 names that later measure instead (JA Spark: its 1.0.1
// release build, ds-remeasure-5); the folder must be on disk.
const laterEvidence = (slug, note) =>
  [...String(note).matchAll(/tasks\/evidence\/ds-remeasure-[^\s),;]+/g)]
    .map((m) => m[0].replace(/[.:]$/, ''))
    .some((d) => d.includes(slug) && existsSync(join(ROOT, d)))
const k = {}
for (const slug of ALL.filter((s) => !MOVED.includes(s))) {
  k[slug] = loadContract(`joomla-${slug}`)
  c.eq(`S1 ${slug}: template key`, k[slug].template, `joomla/${slug}`)
  c.eq(`S1 ${slug}: offered`, k[slug].ready === true, READY.includes(slug))
  c.check(
    `S1 ${slug}: readyNote names the evidence`,
    String(k[slug].readyNote).includes(`ds-contracts-batch6-2026-10-11/templates/${slug}-j6`) ||
      (READY.includes(slug) && laterEvidence(slug, k[slug].readyNote)),
    k[slug].readyNote
  )
  if (!READY.includes(slug))
    c.check(
      `S1 ${slug}: not offered says so`,
      String(k[slug].readyNote).startsWith('NOT offered yet'),
      k[slug].readyNote
    )
}
for (const slug of ['ja-purity-iv', 'ja-spark']) {
  c.eq(`S1 ${slug}: headings follow`, k[slug].templateVars?.['--headings-color'], 'var(--ds-c-fg-2)')
  c.eq(`S1 ${slug}: light surfaces follow`, k[slug].templateVars?.['--tpl-base-100'], 'var(--ds-c-surface)')
  c.check(`S1 ${slug}: heading contrast judged`, !!k[slug].contrast?.heading, k[slug].contrast)
}
c.check(
  'S1 ja-spark: white cards kept',
  k['ja-spark'].keepScopes.includes('.bg-white'),
  k['ja-spark'].keepScopes
)
c.check(
  'S1 ja-mono: footer and dark cards kept',
  ['.t3-footer', '.style-dark', '.style-highlight'].every((s) => k['ja-mono'].keepScopes.includes(s)),
  k['ja-mono'].keepScopes
)

// S2: the module sheet a site wears (Moxie)
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
// The template's own heading colour, given back inside a kept band: Purity IV's T4 default, and
// JA Spark's as its 1.0.1 release build declares it (ds-remeasure-5; round 1 read #212529 off 1.0.0).
const OWN_HEADING = { 'ja-purity-iv': '#212529', 'ja-spark': '#18181b' }
for (const slug of ['ja-purity-iv', 'ja-spark']) {
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, k[slug]), k[slug]).css ?? ''
  c.check(
    `S2 ${slug}: --headings-color reads the system`,
    css.includes('--headings-color:var(--ds-c-fg-2)'),
    css.slice(0, 300)
  )
  c.check(
    `S2 ${slug}: a kept band gets the template heading colour back`,
    css.includes(`--headings-color:${OWN_HEADING[slug]}`),
    ''
  )
}

// S3: JA Purity IV through its pass — 12/12, controls 0, nothing less readable
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('image', 'inspect', 'tracy/web-joomla:6-apache-20260923-r1')
  docker('image', 'inspect', 'mariadb:11')
} catch {
  cannotRun('Docker, or the fleet Joomla image, is not on this machine')
}
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
try {
  execFileSync(
    'gh',
    ['release', 'view', 'quickstart/ja-purity-iv/j6', '-R', 'JoomlArt-Products/ja-products'],
    {
      stdio: 'ignore'
    }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsb6-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-purity-iv',
      '--port',
      '53296',
      '--cdp',
      '9796',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S3 ja-purity-iv: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S3 ja-purity-iv: verdicts', s.pass, '12/12')
    c.eq('S3 ja-purity-iv: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check(
      'S3 ja-purity-iv: no text under 4.5:1 worse than its own',
      s.lowContrast.length === 0,
      s.lowContrast
    )
    c.check('S3 ja-purity-iv: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
