/**
 * REG-PR-1134-ds-contracts-batch5: the eleven JA Joomla j6 quickstarts of batch 5 each carry a slot
 * contract, and only the measured ones are offered:
 *   - JA Civica, Conference, Diner and Ego: every heading and text judged against the same
 *     one on the default page under four systems; each names the release that wears it (minVersion);
 *   - the other seven are not offered, each with a readyNote naming what still fails.
 * Round 3 (11/10/2026) took eight of them to their own cases, each offered from a re-release: JA Coach
 * and Colab (REG-PR-1134-ds-contracts-r3d), JA Comics, Educatsy, Eventcamp and Fit (r3e), JA Civica and
 * Company (r3a). This case still judges Conference, Diner and Ego.
 * S1 reads the contracts; S2 builds the Moxie module sheet for Eventcamp (a T4 palette band) and
 * Educatsy (an !important accent link); S3 restores JA Conference's release, tokenizes it and wears
 * four systems (pass-joomla.mjs). S3 needs Docker, the fleet's Joomla image, Chrome and read access
 * to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { contractBase, loadContract, loadProfile } = await import(join(LIB, 'src/library.mjs'))
const { joomlaSlot } = await import(join(LIB, 'src/joomla.mjs'))
const c = checks()

// S1: every template of the batch has a contract; ready only where measured
// JA Civica and JA Company went on to round 3 (REG-PR-1134-ds-contracts-r3a)
const READY = {
  'ja-conf': '1.0.2',
  'ja-diner': '1.0.1',
  'ja-ego': '1.0.1'
}
const ALL = ['ja-comics', 'ja-conf', 'ja-diner', 'ja-educatsy', 'ja-ego', 'ja-eventcamp', 'ja-fit']
// round 3 (batch r3e, 11/10/2026) re-measured these four and offers them: their contracts and readyNotes
// now belong to REG-PR-1134-ds-contracts-r3e (the S2 sheets below are still built from them)
const MOVED_R3E = ['ja-comics', 'ja-educatsy', 'ja-eventcamp', 'ja-fit']
const k = {}
for (const slug of MOVED_R3E) k[slug] = loadContract(`joomla-${slug}`)
for (const slug of ALL.filter((s) => !MOVED_R3E.includes(s))) {
  k[slug] = loadContract(`joomla-${slug}`)
  const ready = slug in READY
  c.eq(`S1 ${slug}: template key`, k[slug].template, `joomla/${slug}`)
  c.eq(`S1 ${slug}: offered`, k[slug].ready === true, ready)
  c.check(
    `S1 ${slug}: readyNote names the evidence`,
    String(k[slug].readyNote).includes(`ds-contracts-batch5-2026-10-11/${slug}-j6`),
    k[slug].readyNote
  )
  c.check(
    `S1 ${slug}: every heading and text judged`,
    !!k[slug].contrast?.heading && !!k[slug].contrast?.text,
    k[slug].contrast
  )
  if (ready) c.eq(`S1 ${slug}: minVersion`, k[slug].minVersion?.[`quickstart/${slug}/j6`], READY[slug])
  else
    c.check(
      `S1 ${slug}: not offered says so`,
      String(k[slug].readyNote).startsWith('NOT offered yet'),
      k[slug].readyNote
    )
}
c.eq('S1 ja-ego: headings follow', k['ja-ego'].templateVars?.['--body-headings-color'], 'var(--ds-c-fg)')

// S2: the module sheet a site wears (Moxie)
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const sheet = (slug, id = MOXIE) =>
  joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[slug]), k[slug]).css ?? ''
const ev = sheet('ja-eventcamp')
c.check(
  'S2 ja-eventcamp: the light palette band takes the surface and the text colour',
  /\.t4-palette-light[^{]*\{background-color:var\(--ds-c-surface\);color:var\(--ds-c-fg\)\}/.test(ev),
  ev.slice(0, 300)
)
c.check(
  'S2 ja-eventcamp: links in the band take the readable accent',
  ev.includes('.t4-palette-light a:not(.btn)') && ev.includes('color:var(--ds-accent-text, var(--ds-c-fg))'),
  ''
)
// MotherDuck: a system whose accent needs a readable text shade (Moxie's reads as it is, so no rule)
const ed = sheet('ja-educatsy', 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567')
c.check(
  'S2 ja-educatsy (MotherDuck): the active menu link takes the readable accent, !important',
  ed.includes('li.active > a:not(.active)') && ed.includes('color:var(--ds-accent-text)!important'),
  ''
)

// S3: JA Conference through its pass — 12/12, controls 0, nothing less readable
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-conf/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsb5-'))
try {
  const r = run(
    process.execPath,
    [join(LIB, 'scripts/pass-joomla.mjs'), 'ja-conf', '--port', '53295', '--cdp', '9795', '--evidence', work],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S3 ja-conf: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S3 ja-conf: verdicts', s.pass, '12/12')
    c.eq('S3 ja-conf: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check('S3 ja-conf: no text under 4.5:1 worse than its own', s.lowContrast.length === 0, s.lowContrast)
    c.check('S3 ja-conf: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
