/**
 * REG-PR-1238: Tracy Base EmDash 0.5.2 passes the Template Customization Question Readiness rules its
 * seed/personalize.json decides (ABOUT-2, ABOUT-3, LANG-1, LANG-2, PAGE-8) on the release it packs.
 *   S1 0.5.2 in package.json, template.config.json, the Dockerfile label and the generated inventory;
 *      a template-profiles row and the slot contract's maxVersion 0.5.2;
 *   S2 the theme is packed (tools/distribution.mjs pack), zipped as the release zip and read by the
 *      readiness CLI beside a tracy_setting.json that lists template.config.json locales: each rule passes;
 *   S3 the theme's personalize suites.
 * No stand, no model, no network (the CLI runs --offline).
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks, nodeTest, ROOT, run } from './lib.mjs'

const c = checks()
const DIR = 'packages/cms/tracy-emdash-theme-base'
const TAG = 'tracy-base/emdash-0.x'
const WANT = '0.5.2'
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

// S1
const tcfg = json(`${DIR}/template.config.json`)
c.eq('S1 package.json', json(`${DIR}/package.json`).version, WANT)
c.eq('S1 template.config.json', tcfg.version, WANT)
c.check(
  'S1 Dockerfile label',
  readFileSync(join(ROOT, DIR, 'Dockerfile'), 'utf8').includes(`io.tracy.template.version="${WANT}"`),
  null
)
c.eq('S1 generated inventory', json(`${DIR}/docs/generated/inventory.json`).template.version, WANT)
c.check(
  'S1 template-profiles row',
  !!json('apps/tracy-web/src/lib/template-profiles.json').releases[TAG]?.[WANT],
  null
)
c.eq(
  'S1 slot contract maxVersion',
  json('packages/design/tracy-ds-slot/templates/emdash-base.json').maxVersion?.[TAG],
  WANT
)

// S2
const work = mkdtempSync(join(tmpdir(), 'reg-1238-'))
try {
  const pack = join(work, 'pack')
  const release = join(work, 'release')
  const packed = run(process.execPath, ['tools/distribution.mjs', 'pack', 'qa.contract.json', pack], {
    cwd: join(ROOT, DIR)
  })
  c.eq('S2 pack exit code', packed.status, 0)
  run('mkdir', ['-p', release])
  const zip = `tracy-base-emdash-quickstart-${WANT}.zip`
  const zipped = run('zip', ['-qr', join(release, zip), '.'], { cwd: pack })
  c.eq('S2 zip exit code', zipped.status, 0)
  const sha = createHash('sha256')
    .update(readFileSync(join(release, zip)))
    .digest('hex')
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'emdash',
    label: tcfg.label,
    version: WANT,
    cms: '1.1.0',
    install: {
      source: { file: zip, sha256: sha },
      state: { file: `tracy-base-emdash-state-${WANT}.tar.gz`, sha256: '0'.repeat(64) }
    },
    template: tcfg.id,
    languages: tcfg.locales
  }
  writeFileSync(join(release, 'tracy_setting.json'), `${JSON.stringify(setting, null, 2)}\n`)
  for (const rule of ['ABOUT-2', 'ABOUT-3', 'LANG-1', 'LANG-2', 'PAGE-8']) {
    const r = run(process.execPath, [
      'scripts/template-customization-question-readiness.mjs',
      release,
      '--tag',
      TAG,
      '--only',
      rule,
      '--offline',
      '--json'
    ])
    let status = null
    try {
      status = JSON.parse(r.stdout).results.find((x) => x.id === rule)?.status ?? null
    } catch {}
    c.eq(`S2 ${rule}`, status, 'pass')
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

// S3
c.tapClean(
  'S3 personalize suites',
  nodeTest(
    [
      'tests/personalize-labels.test.mjs',
      'tests/personalize-facts.test.mjs',
      'tests/personalize-rewrite-trade.test.mjs',
      'tests/personalize-gate.test.mjs',
      'tests/empty-claims.test.mjs'
    ],
    { cwd: DIR }
  )
)

c.done()
