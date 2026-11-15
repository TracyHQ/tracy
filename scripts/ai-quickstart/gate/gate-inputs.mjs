// What the release gate command reads before it runs (ticket #586): the kit folder as the build reads it, the plugin
// version Tracy pins, the demo baseline the template readiness step keeps beside the template's contract (template
// quality's fallback control), and the secret scan of the files to publish with its negative control, plus the same
// rule sets over the record's own files at the end. Reads files; never prints a secret's value.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLOW_FILE, allowShaOf } from './release-binding.mjs'
import { gitleaksFindings } from './secret-gitleaks.mjs'
import { ADAPTERS, filesOfArgs, readAllow, scanTexts, secretScan } from './secret-scan.mjs'

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
    lock: json('blank-site-contract/presentation-lock.json'),
    // The draft report names the places the drafting kept, with their reasons (`exemptions.mjs` `keptPlacesOf`).
    draftReport: existsSync(path.join(folder, 'draft-report.json')) ? json('draft-report.json') : null,
    // The template kit of the release: its themes and grounds, for the marker build's dark accent.
    templateKit: templateKitOf(t)
  }
}

/** The template kit `contracts/<slug>/<cms>/<version>/template-kit.json` of a template, or null. */
function templateKitOf(t, root = ROOT) {
  const file = path.join(
    root,
    'packages/cms/tracy-joomla-quickstart/contracts',
    String(t.slug),
    String(t.cms ?? 'j6'),
    String(t.version),
    'template-kit.json'
  )
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
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

/**
 * Every rule set over the record's own files (`[{name, text}]`): the value rules, the CMS adapter and the pinned
 * gitleaks, with no allow entry (the record holds no vendor sample, so nothing in it may be allowed). Returns
 * `{findings, gitleaks}`; gitleaks not run leaves the secret scan `incomplete` (`release-gate-files.mjs`).
 */
export function recordScanner({ cms, gitleaks = true }) {
  return (files) => {
    const texts = files.map((f) => ({ file: f.name, text: f.text }))
    const found = scanTexts(texts, ADAPTERS[cms])
    const leaks = gitleaks
      ? gitleaksFindings(texts, gitleaks === true ? {} : gitleaks)
      : { status: 'not_available', reason: 'not asked for' }
    return {
      findings: [...found, ...(leaks.findings ?? [])],
      gitleaks: { status: leaks.status, ...(leaks.reason ? { reason: leaks.reason } : {}) }
    }
  }
}

/** The sha256 of the kit's secret allow file and its name, or null when the kit has none (`record.mjs` binding). */
export function secretAllowOf(folder) {
  const sha256 = allowShaOf(folder)
  return sha256 ? { file: ALLOW_FILE, sha256 } : null
}
