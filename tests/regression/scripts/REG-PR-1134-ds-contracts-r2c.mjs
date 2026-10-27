/**
 * REG-PR-1134-ds-contracts-r2c: the four JA Joomla quickstarts batch 3 left not ready (Gamex, Helple,
 * Kidscorner, Landscape) wear a design system as measured in round 2 (11/10/2026):
 *   S1 the library's tests (the emitter's groundPicture, inkImages, pageText, onAccent, inlineColours);
 *   S2 the contracts: four ready, each naming its evidence and wearing from 1.0.1 (minVersion);
 *   S3 tracy-web's door finds them, and refuses a site built from 1.0.0 (TEMPLATE_NEEDS_UPDATE);
 *   S4 two releases through pass-joomla.mjs — ja-gamex (text on a picture, now judged against the
 *      picture) and ja-landscape (t4Placeholders, menu text, text on the accent band): controls 0, no text
 *      under 4.5:1 worse than the template's own, at least 60% of the page follows;
 *   S5 release-joomla.mjs builds ja-helple's next version with T4's style templates (css/tpl/*.tpl.css)
 *      reading the slot through their placeholders; restored from that zip, with T4's sheets deleted
 *      and its pages rendered again, every sheet T4 writes reads the slot. Round 2 first shipped the
 *      generated sheets tokenized with T4's hashes (t4SiteCss): they held on a fresh site and went
 *      back to literals as soon as T4 wrote them again (4/12, 11/10/2026).
 * No model reads anything. S4 and S5 need Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh); one stand at a time.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(
    ['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs', 'test/release-manifest.test.mjs'],
    { cwd: 'packages/design/tracy-ds-slot' }
  )
)

// S2
const FOUR = ['ja-gamex', 'ja-helple', 'ja-kidscorner', 'ja-landscape']
for (const s of FOUR) {
  const k = loadContract(`joomla-${s}`)
  c.eq(`S2 ${s} is ready`, k.ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k.minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(`S2 ${s} names its evidence`, /ds-contracts-r2c-2026-10-11/.test(k.readyNote ?? ''), k.readyNote)
}
// T4's style templates, not its generated sheets (t4SiteCss until regeneration-checked, 11/10/2026)
for (const s of ['ja-helple', 'ja-landscape']) {
  const k = loadContract(`joomla-${s}`)
  c.check(`S2 ${s} no longer relies on T4’s generated sheets`, !k.t4SiteCss, k.t4SiteCss)
  c.eq(`S2 ${s} reads the slot through T4’s placeholders`, k.t4Placeholders?.__body_text_color, 'fg')
  c.check(`S2 ${s} is regeneration-checked`, /regeneration-checked/.test(k.readyNote ?? ''), k.readyNote)
}
c.eq(
  'S2 JA Landscape names a role per kind where a T4 colour plays two',
  JSON.stringify(loadContract('joomla-ja-landscape').t4Placeholders?.__color_primary),
  JSON.stringify({ fill: 'accent', line: 'accent', text: 'fg-2' })
)
c.check(
  'S2 JA Gamex’s page picture gives way',
  (loadContract('joomla-ja-gamex').selectors.groundPicture ?? []).includes('.t4-content'),
  loadContract('joomla-ja-gamex').selectors.groundPicture
)
c.eq(
  'S2 JA Kidscorner’s inline titles take fg-2',
  loadContract('joomla-ja-kidscorner').inlineColours?.['#403d75'],
  'fg-2'
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of FOUR) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  const site = (version) => ({ key: `quickstart/${s}/j6`, version })
  c.eq(
    `S3 ${s} 1.0.1`,
    JSON.stringify(contractFor(key, site('1.0.1'))),
    JSON.stringify({ contract: `joomla-${s}` })
  )
  c.eq(`S3 ${s} 1.0.0 needs the update`, contractFor(key, site('1.0.0')).reason, 'TEMPLATE_NEEDS_UPDATE')
}

// S4, S5: Docker, Chrome, the release
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-gamex/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr2c-'))
try {
  // S4
  for (const slug of ['ja-gamex', 'ja-landscape']) {
    const r = run(
      process.execPath,
      [join(LIB, 'scripts/pass-joomla.mjs'), slug, '--port', '52751', '--cdp', '9761', '--evidence', work],
      { timeoutS: 1800 }
    )
    let s = null
    try {
      s = JSON.parse(r.stdout.trim().split('\n').pop())
    } catch {}
    c.check(`S4 ${slug}: ran`, !!s, r.stderr.slice(-400))
    if (!s) continue
    c.eq(`S4 ${slug}: controls (differences against the release)`, s.controls.join(','), '0,0,0,0')
    c.check(
      `S4 ${slug}: no text under 4.5:1 worse than the template’s own`,
      s.lowContrast.length === 0,
      s.lowContrast
    )
    c.check(
      `S4 ${slug}: the page follows each system (≥ 0.6)`,
      s.follows.every((x) => x >= 0.6),
      s.follows
    )
    // a picture-ground sample is measured (the probe no longer skips text on a picture)
    if (slug === 'ja-gamex') {
      const f = JSON.parse(readFileSync(join(work, `${slug}-j6`, 'final/flow.json'), 'utf8'))
      const onPicture = f.rows[1].views.desktop.contrast
        .flatMap((k) => k.samples)
        .filter(([, x]) => x.onPicture)
      c.check('S4 ja-gamex: texts on a picture are measured', onPicture.length > 0, onPicture.length)
    }
  }
  // S5
  const out = join(work, 'rel-helple')
  const b = run(
    process.execPath,
    [
      join(LIB, 'scripts/release-joomla.mjs'),
      'quickstart/ja-helple/j6',
      '--template',
      'joomla-ja-helple',
      '--out',
      out,
      '--port',
      '52753'
    ],
    { timeoutS: 1800 }
  )
  c.check('S5 ja-helple: the next version builds', b.status === 0, b.stderr.slice(-400))
  const rel = join(out, 'release')
  const zip = existsSync(rel) ? readdirSync(rel).find((f) => f.endsWith('.zip')) : null
  const list = zip
    ? execFileSync('unzip', ['-Z1', join(rel, zip)], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')
    : []
  const tpl = list.filter((f) => /^templates\/ja_helple\/css\/tpl\/[\w-]+\.tpl\.css$/.test(f))
  c.check('S5 ja-helple: the zip carries T4’s style templates', tpl.length > 0, tpl)
  c.check(
    'S5 ja-helple: and no generated sheet hash (nothing pins a tokenized copy)',
    !list.some((f) => f.startsWith('administrator/cache/t4asset/')),
    list.filter((f) => f.includes('t4asset'))
  )
  if (zip) {
    const name = 'reg-r2c-helple'
    try {
      const st = JSON.parse(
        execFileSync(
          process.execPath,
          [
            join(LIB, 'scripts/stand.mjs'),
            'up',
            'quickstart/ja-helple/j6',
            '--port',
            '52755',
            '--name',
            name,
            '--from-dir',
            rel
          ],
          { encoding: 'utf8' }
        )
          .trim()
          .split('\n')
          .pop()
      )
      const dir = join(st.dir, 'site/media/t4/css')
      const pages = () => {
        for (let i = 0; i < 2; i++)
          for (const h of ['/', '/index.php/about', '/index.php/blog', '/index.php/contact'])
            run('curl', ['-s', '--noproxy', '*', '-o', '/dev/null', '-m', '300', `${st.site}${h}`], {
              timeoutS: 320
            })
      }
      const sheetsNow = () =>
        readdirSync(dir)
          .filter((f) => /^\d+(-sub)?\.css$/.test(f))
          .map((f) => [f, readFileSync(join(dir, f), 'utf8').includes('var(--ds-c-')])
      pages()
      const first = sheetsNow()
      // T4 writes its sheets again whenever their content changes (a style saved, the folder emptied):
      // emptied here, with its combined cache, and the pages asked for twice
      for (const d of ['site/media/t4/css', 'site/media/t4/optimize'])
        if (existsSync(join(st.dir, d)))
          for (const f of readdirSync(join(st.dir, d)))
            rmSync(join(st.dir, d, f), { recursive: true, force: true })
      pages()
      const again = sheetsNow()
      c.check(
        'S5 ja-helple: after its pages render, every sheet T4 wrote reads the slot',
        first.length > 0 && first.every(([, y]) => y),
        first
      )
      c.check(
        'S5 ja-helple: and still after T4 writes them again',
        again.length > 0 && again.every(([, y]) => y),
        again
      )
    } finally {
      run(process.execPath, [join(LIB, 'scripts/stand.mjs'), 'down', '--name', name], { timeoutS: 300 })
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
