// What the release gate command reads before it runs (ticket #586): the kit folder as the build reads it, the plugin
// version Tracy pins, the demo baseline the template readiness step keeps beside the template's contract (template
// quality's fallback control), and the secret scan of the files to publish with its negative control, plus the same
// value rules over the record's own files at the end. Reads files; never prints a secret's value.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADAPTERS, applyAllow, filesOfArgs, readAllow, scanTexts, secretScan } from './secret-scan.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** The kit of an AI quickstart folder, as the marker build reads it. */
export function kitOf(folder) {
  const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
  const mapping = json('mapping.json')
  const t = mapping.template ?? {}
  return {
    ref: t.slug + '/' + (t.cms ?? 'j6') + '@' + t.version,
    template: t,
    blockStore: json('block-store.json'),
    pageRecipes: json('page-recipes.json'),
    mapping,
    blankContract: json('blank-site-contract/content-map.json'),
    lock: json('blank-site-contract/presentation-lock.json')
  }
}

/** The plugin version `apps/tracy-web/src/quickstarts.json` pins for the kit's template, or null. */
export function pinnedPlugin(template, root = ROOT) {
  const file = path.join(root, 'apps/tracy-web/src/quickstarts.json')
  if (!existsSync(file)) return null
  const pins = JSON.parse(readFileSync(file, 'utf8'))
  return pins['quickstart/' + template.slug + '/' + (template.cms ?? 'j6')]?.cowork?.version ?? null
}

/**
 * The demo baseline of the kit's template: `contracts/<slug>/<cms>/<version>/demo-measures.json` in the package that
 * holds `ai-quickstarts/<slug>/<cms>/<version>`, or the given file; null when there is none.
 */
export function baselineOf(folder, given = null) {
  const parts = path.resolve(folder).split(path.sep)
  const file =
    given ?? path.join('/', ...parts.slice(0, -4), 'contracts', ...parts.slice(-3), 'demo-measures.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

/**
 * The secret scan of the files to publish: the kit folder and the blank site archive, with the untouched human
 * quickstart installer as the negative control and the kit's allow file.
 * @param {{folder: string, installer: string, human?: string | null, cms: string, gitleaks?: boolean}} input
 */
export function secretsOf({ folder, installer, human = null, cms, gitleaks = true }) {
  return secretScan({
    files: filesOfArgs({ kit: folder, blankSite: installer }),
    allow: readAllow(path.join(folder, 'check-record', 'secret-allow.json')),
    control: human ? { name: path.basename(human), bytes: readFileSync(human) } : null,
    cms,
    gitleaks
  })
}

/** The value rules and the CMS adapter over the record's own files (`[{name, text}]`), less what the allow file names. */
export function recordScanner({ folder, cms }) {
  const allow = readAllow(path.join(folder, 'check-record', 'secret-allow.json'))
  return (files) =>
    applyAllow(
      scanTexts(
        files.map((f) => ({ file: f.name, text: f.text })),
        ADAPTERS[cms]
      ),
      allow
    ).findings
}
