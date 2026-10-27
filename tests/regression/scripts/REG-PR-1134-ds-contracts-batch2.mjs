/**
 * REG-PR-1134-ds-contracts-batch2: the batch-2 JA Joomla contracts say whether they are offered (JA Aiga, Alpha,
 * Artsy and Athena moved to round 3, REG-PR-1134-ds-contracts-r3b; JA Beauty, Blockk, Boxing and Campaign to
 * REG-PR-1134-ds-contracts-r3c),
 * the two offered ones are offered only from their tokenized release, and one of them measured again.
 *   S1 the library's tests (contract invariants, alphaText, the Joomla sheet);
 *   S2 every contract read, and the build door's answer for each at 1.0.0 and 1.0.1;
 *   S3 JA Alumni restored from its release, tokenized, four systems worn and cleared (pass-joomla.mjs).
 * No model reads anything. S3 needs Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 * JA Candidate and JA Cityguide left this list on 11/10/2026: round 3 (REG-PR-1134-ds-contracts-r3d)
 * offers them from their 1.0.1 re-release.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
// made ready in round 3 and judged by their own cases: ja-aiga, ja-alpha, ja-artsy, ja-athena
// (REG-PR-1134-ds-contracts-r3b); ja-beauty, ja-blockk, ja-boxing, ja-campaign (REG-PR-1134-ds-contracts-r3c);
// ja-candidate, ja-cityguide (REG-PR-1134-ds-contracts-r3d)
const SLUGS = ['ja-alumni']
const READY = ['ja-alumni']
const IMAGES = ['tracy/web-joomla:6-apache-20260923-r1', 'mariadb:11']
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('version', '--format', '{{.Server.Version}}')
} catch {
  cannotRun('Docker is not running')
}
for (const image of IMAGES)
  try {
    docker('image', 'inspect', image)
  } catch {
    cannotRun(`image ${image} is not on this machine`)
  }
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
try {
  execFileSync(
    'gh',
    [
      'release',
      'view',
      'quickstart/ja-alumni/j6',
      '-R',
      'JoomlArt-Products/ja-products',
      '--json',
      'tagName'
    ],
    { stdio: 'ignore' }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}

const work = mkdtempSync(join(tmpdir(), 'reg-ds-batch2-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/contracts.test.mjs', 'test/tokenize.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const { contractFor } = await import(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js'))
for (const slug of SLUGS) {
  const file = join(LIB, 'templates', `joomla-${slug}.json`)
  const k = JSON.parse(readFileSync(file, 'utf8'))
  c.eq(`S2 ${slug}: template`, k.template, `joomla/${slug}`)
  c.check(`S2 ${slug}: ready is a boolean`, typeof k.ready === 'boolean', k.ready)
  const at = (version) => contractFor(`joomla/${slug}`, { key: `quickstart/${slug}/j6`, version })
  if (READY.includes(slug)) {
    c.eq(`S2 ${slug}: ready`, k.ready, true)
    c.eq(
      `S2 ${slug}: minVersion`,
      JSON.stringify(k.minVersion),
      JSON.stringify({ [`quickstart/${slug}/j6`]: '1.0.1' })
    )
    c.check(
      `S2 ${slug}: readyNote names its evidence`,
      k.readyNote.includes(`tasks/evidence/ds-contracts-batch2-2026-10-11/templates/${slug}-j6`),
      k.readyNote
    )
    c.eq(`S2 ${slug}: door at 1.0.0`, at('1.0.0').reason, 'TEMPLATE_NEEDS_UPDATE')
    c.eq(`S2 ${slug}: door at 1.0.1`, at('1.0.1').contract, `joomla-${slug}`)
  } else {
    c.eq(`S2 ${slug}: ready`, k.ready, false)
    c.check(`S2 ${slug}: readyNote says why`, (k.readyNote ?? '').startsWith('NOT offered yet'), k.readyNote)
    c.eq(`S2 ${slug}: door`, at('1.0.1').reason, 'TEMPLATE_NOT_READY')
  }
}

// S3
const r = run(
  process.execPath,
  [join(LIB, 'scripts/pass-joomla.mjs'), 'ja-alumni', '--port', '53292', '--cdp', '9792', '--evidence', work],
  { timeoutS: 3000 }
)
let s = null
try {
  s = JSON.parse(r.stdout.trim().split('\n').pop())
} catch {}
c.check('S3 JA Alumni: ran', !!s, r.stderr.slice(-400))
if (s) {
  c.eq('S3 verdicts', s.pass, '12/12')
  c.eq('S3 controls (differences against the release)', s.controls.join(','), '0,0,0,0')
  c.check(
    'S3 no text under 4.5:1 worse than the same text on the default page',
    s.lowContrast.length === 0,
    s.lowContrast
  )
  c.check(
    'S3 the page follows each system (≥ 0.5)',
    s.follows.every((x) => x >= 0.5),
    s.follows
  )
}
c.done()
