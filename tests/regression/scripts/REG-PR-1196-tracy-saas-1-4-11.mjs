/**
 * REG-PR-1196-tracy-saas-1-4-11 (id kept from the line's first release, 1.4.11, built 12/10/2026 and
 * never served): the three EmDash quickstarts ship sharp and Tracy SaaS ships the design-system slot
 * reader under numbers of their own — Tracy SaaS 1.4.12, Tracy Business 1.7.16, Tracy Base 0.5.1.
 *   S1 each theme reads its version everywhere it names it, lists sharp as a direct dependency (without
 *      it /_image answers 500 MissingSharp, TCH #1182), and carries the slot reader;
 *   S2 at those versions each theme packs to the built and measured release (artifactHash);
 *   S3 the slot contracts wear exactly these: SaaS [1.4.12, 1.4.12] (1.4.10 and 1.4.11 need the
 *      update), Business up to 1.7.16, Base [0.5.0, 0.5.1]; template-profiles rows for all three;
 *   S4 the SaaS call-to-action eyebrow takes bandText (it read 4.43 / 4.27 under MotherDuck / Apple):
 *      the contract names it and slot.test.mjs proves 4.5:1 on every ground of its card;
 *   S5 the theme slot tests, the sharp test and tracy-web's door test.
 * No stand, no model, no network.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, run } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const text = (p) => readFileSync(join(ROOT, p), 'utf8')
const THEMES = [
  [
    // 1.4.13 / 1.7.17 (TCH #1297, 13/10/2026): the same themes with the personalize tool of #1297; follow the rows
    'saas',
    'tracy-saas/emdash-0.x',
    '1.4.13',
    'sha256:73a9b9bce4b1dde2c502aa71ec407fdbf715f03a95c82beb806e4ffd32426418'
  ],
  [
    // 1.7.18 (TCH #1321, 13/10/2026): 1.7.17 plus the two-mode slot of #1315; the hash is the tree's own pack until
    // the release is built and verified (1.7.17 packed to sha256:28ab2a66…3abb7)
    'business',
    'tracy-business/emdash-0.x',
    '1.7.18',
    'sha256:9ded02e6a4126ce27f2146d7bec47d324b724bab979b4111eb31a7d758bf2d87'
  ],
  [
    // 0.5.2 (12/10/2026): the same theme with readiness rules in seed/personalize.json; 0.5.3 (TCH #1297): the one
    // personalize tool the three themes ship; follows the rows
    'base',
    'tracy-base/emdash-0.x',
    '0.5.3',
    'sha256:1e61c312b0a649b46f21299f8f086c430bf3ab131caa20a23ee03efb0acdaba9'
  ]
]
const profiles = json('apps/tracy-web/src/lib/template-profiles.json').releases

for (const [name, tag, want, built] of THEMES) {
  const dir = `packages/cms/tracy-emdash-theme-${name}`
  // S1
  const pkg = json(`${dir}/package.json`)
  c.eq(`S1 ${name} package.json`, pkg.version, want)
  c.eq(`S1 ${name} template.config.json`, json(`${dir}/template.config.json`).version, want)
  c.check(
    `S1 ${name} Dockerfile label`,
    text(`${dir}/Dockerfile`).includes(`io.tracy.template.version="${want}"`),
    null
  )
  c.eq(`S1 ${name} generated inventory`, json(`${dir}/docs/generated/inventory.json`).template.version, want)
  c.check(
    `S1 ${name} lists sharp as a direct dependency`,
    typeof pkg.dependencies?.sharp === 'string',
    pkg.dependencies?.sharp
  )
  c.check(`S1 ${name} carries the slot reader`, /ds-slot\.css/.test(text(`${dir}/src/lib/ds-slot.ts`)), null)
  // S2 (only while the theme is at this version: a later change is built and measured again)
  if (pkg.version === want) {
    const out = mkdtempSync(join(tmpdir(), 'reg-1196-pack-'))
    rmSync(out, { recursive: true })
    const r = run(process.execPath, ['tools/distribution.mjs', 'pack', 'qa.contract.json', out], {
      cwd: join(ROOT, dir)
    })
    let hash = null
    try {
      hash = JSON.parse(r.stdout).artifactHash
    } catch {}
    rmSync(out, { recursive: true, force: true })
    c.eq(`S2 ${name} packs to the built release ${want}`, hash, built)
  }
  c.check(`S3 ${name} template-profiles ${want}`, !!profiles[tag]?.[want], null)
}

// S3
const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
for (const [contract, tag, min, max] of [
  ['emdash-tracy-saas', 'tracy-saas/emdash-0.x', '1.4.12', '1.4.13'],
  // 1.7.18 (TCH #1321): the two-mode slot of #1315 on top of 1.7.17
  ['emdash-tracy-business', 'tracy-business/emdash-0.x', '1.7.6', '1.7.18'],
  ['emdash-base', 'tracy-base/emdash-0.x', '0.5.0', '0.5.3']
]) {
  const k = loadContract(contract)
  c.eq(`S3 ${contract} ready`, k.ready, true)
  c.eq(
    `S3 ${contract} wears [${min}, ${max}]`,
    `${k.minVersion?.[tag]} ${k.maxVersion?.[tag]}`,
    `${min} ${max}`
  )
}
const { contractFor, templateKeyOf, versionKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const TAG = 'tracy-saas/emdash-0.x'
const at = (v) =>
  contractFor(
    templateKeyOf({ platform: 'emdash', quickstartTag: TAG }),
    versionKeyOf({ platform: 'emdash', quickstartTag: TAG, quickstartVersion: v })
  )
c.eq('S3 SaaS 1.4.12 is offered', at('1.4.12').contract, 'emdash-tracy-saas')
for (const v of ['1.4.10', '1.4.11'])
  c.eq(`S3 SaaS ${v} needs the update`, `${at(v).reason} ${at(v).need}`, 'TEMPLATE_NEEDS_UPDATE 1.4.12')

// S4
const saas = loadContract('emdash-tracy-saas')
c.eq(
  'S4 the contract names the eyebrow on the card',
  JSON.stringify(saas.bandText?.['.cta--card']?.text),
  JSON.stringify(['.cta-eyebrow'])
)
c.tapClean(
  'S4 ds-slot library (bandText)',
  nodeTest(['test/slot.test.mjs'], { cwd: 'packages/design/tracy-ds-slot' })
)

// S5
c.tapClean(
  'S5 SaaS theme slot test',
  nodeTest(['tests/ds-slot.test.mjs'], { cwd: 'packages/cms/tracy-emdash-theme-saas' })
)
c.tapClean('S5 sharp in all three', nodeTest(['scripts/test/emdash-templates-sharp.test.mjs']))
c.tapClean('S5 tracy-web door', nodeTest(['test/design-system-door.test.mjs'], { cwd: 'apps/tracy-web' }))

c.done()
