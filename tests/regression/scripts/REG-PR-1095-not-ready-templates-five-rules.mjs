/**
 * REG-PR-1095: five tokenizer rules make a template that was not ready (#1087) wear a chosen system
 * with no text reading worse than in its own look, judged on its own release.
 *   S1 the library's tests (the five rules each have one);
 *   S2 the library audit — every invariant over all Refero + OpenDesign systems;
 *   S3 Joomla: the released quickstart/ja-trip/j6 (not ready in #1087: Bootstrap's .link-primary and
 *      unnamed text colours) restored, its stylesheets tokenized with this tree's contract, four systems
 *      worn through the slot module and cleared (pass-joomla.mjs).
 * No model reads anything. Needs Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
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
    ['release', 'view', 'quickstart/ja-trip/j6', '-R', 'JoomlArt-Products/ja-products', '--json', 'tagName'],
    { stdio: 'ignore' }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}

const work = mkdtempSync(join(tmpdir(), 'reg-five-rules-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))
const c = checks()
const last = (r) => {
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    return null
  }
}

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)
// S2
const audit = run(process.execPath, [join(LIB, 'scripts/audit.mjs')], { timeoutS: 600 })
c.check(
  'S2 audit: invariants all hold',
  /invariants: all hold/.test(audit.stdout),
  audit.stdout.split('\n').slice(-3).join(' ')
)

// S3: ja-trip through its pass — every verdict, both controls at 0 differences, no text worse
const r = run(
  process.execPath,
  [join(LIB, 'scripts/pass-joomla.mjs'), 'ja-trip', '--port', '52361', '--cdp', '9531', '--evidence', work],
  { timeoutS: 3600 }
)
const s = last(r)
c.check('S3 Joomla ja-trip/j6: ran', !!s, r.stderr.slice(-400))
if (s) {
  c.eq('S3 controls (differences against the release)', s.controls.join(','), '0,0,0,0')
  c.eq('S3 verdicts', s.pass, '12/12')
  c.check('S3 no text under 4.5:1 worse than the template’s own', s.lowContrast.length === 0, s.lowContrast)
  c.check(
    'S3 the page follows each system (≥ 0.6)',
    s.follows.every((x) => x >= 0.6),
    s.follows
  )
}
c.done()
