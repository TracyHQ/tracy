// Release rules of the AI quickstart kits the contract check enforces (ticket #586), run by `check.mjs` in CI:
// (a) a kit whose `kit-manifest.json` names a `site` (a released AI quickstart) carries a fresh passing check record,
//     `check-record/verdict.json` bound to its files and to the pins of the quickstart list (`gate/release-guard.mjs`);
// (b) every kit `ai-quickstarts/<slug>/<cms>/<version>` of a package has a readable template kit of the same version,
//     `contracts/<slug>/<cms>/<version>/template-kit.json` in the same package: the declarations the build reads
//     beside the kit (logo, favicon, accent, picture frames, contact block, forms, page addresses).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { releaseRefusals } from './gate/release-guard.mjs'

const dirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : []

/** Every kit folder under `packages/cms/*\/ai-quickstarts`, as `{pkg, slug, cms, version, dir}`. */
export function kitFolders(root) {
  const out = []
  const cms = path.join(root, 'packages/cms')
  for (const pkg of dirs(cms)) {
    const base = path.join(cms, pkg, 'ai-quickstarts')
    for (const slug of dirs(base))
      for (const kind of dirs(path.join(base, slug)))
        for (const version of dirs(path.join(base, slug, kind)))
          out.push({ pkg, slug, cms: kind, version, dir: path.join(base, slug, kind, version) })
  }
  return out
}

/** The problems of the release rules, `{file, message}` with the file relative to the root. */
export function kitReleaseProblems(root, { pinsOf } = {}) {
  const problems = []
  for (const k of kitFolders(root)) {
    const rel = path.relative(root, k.dir).split(path.sep).join('/')
    const kitFile = ['packages/cms', k.pkg, 'contracts', k.slug, k.cms, k.version, 'template-kit.json'].join(
      '/'
    )
    try {
      JSON.parse(readFileSync(path.join(root, kitFile), 'utf8'))
    } catch (error) {
      const why = error.code === 'ENOENT' ? 'is missing' : 'is not readable JSON: ' + error.message
      problems.push({ file: kitFile, message: 'the template kit of ' + rel + ' ' + why })
    }
    const manifestFile = path.join(k.dir, 'kit-manifest.json')
    if (!existsSync(manifestFile)) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    } catch (error) {
      problems.push({ file: rel + '/kit-manifest.json', message: 'not JSON: ' + error.message })
      continue
    }
    if (manifest.site == null) continue
    const pins = pinsOf ? pinsOf(k) : undefined
    for (const p of releaseRefusals(k.dir, { root, pins }))
      problems.push({ file: rel + '/check-record/verdict.json', message: p.code + ': ' + p.message })
  }
  return problems
}

/** Print each problem and one summary line; returns how many problems there are. */
export function checkKitRelease(root) {
  const problems = kitReleaseProblems(root)
  for (const p of problems) process.stderr.write(p.file + ': ' + p.message + '\n')
  process.stdout.write(
    'ai-quickstart-contract: ' +
      kitFolders(root).length +
      ' kit(s) checked for release, ' +
      problems.length +
      ' problem(s)\n'
  )
  return problems.length
}
