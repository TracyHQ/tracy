/**
 * The measurement file of a release (`tdsr-measurement/v1`, `@tracy/ds-slot` `measurement.mjs`): what
 * a run on a built site found, as numbers, which the eight built-site rules score here (spec
 * `tasks/spec-template-design-system-readiness.md`, decision 15: the person who fixes a template
 * measures on their machine with the `tdsr` skill and the file travels with the fix; /ops only reads).
 *
 * Two places, both read, the newer `measuredAt` wins, and only a file of the PUBLISHED version counts
 * (a new release never inherits the numbers of the old one, save a WordPress patch proven by the committed files
 * to carry the theme and slot contract of the version before it: `measurement-inheritance.js`):
 *   - the `designSystem` block of the release's own `VERIFICATION.json` (a re-release carries it);
 *   - `design-system-measurement.json` in the contract folder of that version: in the image
 *     `src/contracts/<slug>/<cms dir>/<version>/` (Dockerfile COPY), in a checkout the quickstart
 *     packages' `contracts/` and an EmDash theme's `contracts/<version>/`.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DS_SLOT_DIR, dsSlotModule } from '../../ds-slot.js'
import { publishedTagOf } from '../../local-releases.js'
import { readText } from '../../template-customization-question-readiness/release-source.js'
import { inheritanceFiles, inheritanceProofAt } from './measurement-inheritance.js'

export const MEASUREMENT_FILE = 'design-system-measurement.json'

/**
 * The kinds a design system causes on most templates (`scripts/tdsr/preview-system-issues.mjs`, PR 2 of
 * 14/10/2026), or null when the file is missing: such a kind is the system's, shown once on /ops and
 * never counted against a template.
 * @returns {{ lines?: number, share: number, min: number, systems: Record<string, Record<string, { lines: number, of: number, examples: string[] }>> } | null}
 */
export function previewSystemIssues() {
  try {
    return JSON.parse(readFileSync(path.join(DS_SLOT_DIR, 'templates', 'preview-system-issues.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Where the image puts the contract folders (Dockerfile COPY); a checkout reads the packages. */
const IN_IMAGE = fileURLToPath(new URL('../../../contracts/', import.meta.url))
const IN_CHECKOUT = [
  fileURLToPath(
    new URL('../../../../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url)
  ),
  fileURLToPath(
    new URL('../../../../../../packages/cms/tracy-wordpress-quickstart/contracts/', import.meta.url)
  )
]
const EMDASH_THEMES = fileURLToPath(new URL('../../../../../../packages/cms/', import.meta.url))

/**
 * The ids Add site offers a template under that are not its release slug: Tracy Base is the card
 * `tracy` on Joomla and WordPress. Mirror of `CARD_ALIASES` in @tracy/ds-slot measurement.mjs (this
 * reader is synchronous and cannot load that module; a test holds the two equal).
 */
export const CARD_ALIASES = Object.freeze(/** @type {Record<string, string>} */ ({ tracy: 'tracy-base' }))

/** A path segment a tag may contribute: no dots, no slashes. */
const SEGMENT = /^[a-z0-9][a-z0-9-]*(\.[0-9a-z-]+)*$/i

/**
 * The files that could hold the measurement of one published version, existing ones only.
 * @param {{ tag: string | null | undefined, version: string | null | undefined }} release
 * @returns {string[]}
 */
export function treeMeasurementFiles({ tag, version }) {
  const published = publishedTagOf(String(tag ?? ''))
  const parts = published.split('/')
  const named = parts.at(-2)
  const slug = named ? (CARD_ALIASES[named] ?? named) : named
  const cmsDir = parts.at(-1)
  if (!slug || !cmsDir || !version || ![slug, cmsDir, version].every((s) => SEGMENT.test(s))) return []
  const roots = [IN_IMAGE, ...IN_CHECKOUT].map((r) => path.join(r, slug, cmsDir, version, MEASUREMENT_FILE))
  if (cmsDir.startsWith('emdash'))
    roots.push(
      path.join(
        EMDASH_THEMES,
        `tracy-emdash-theme-${slug.replace(/^tracy-/, '')}`,
        'contracts',
        version,
        MEASUREMENT_FILE
      )
    )
  return [...new Set(roots)].filter((f) => existsSync(f))
}

/**
 * The bytes of the measurement files this server holds for one version, for the check's inputs: a
 * file that arrives re-checks that release alone. Each file brings the files its inheritance proof reads
 * (`inheritanceFiles`: the evidence beside it, and along a chain the locks and measurements), so an evidence file
 * changed or removed re-checks the release too.
 * @param {{ tag: string | null | undefined, version: string | null | undefined }} release
 */
export function treeMeasurementBytes(release) {
  return measurementBytesOf(treeMeasurementFiles(release))
}

/**
 * The bytes of these measurement files and of every file their inheritance proof reads. A file that is not there
 * adds nothing, so a version with no evidence keeps the fingerprint it always had, and removing an evidence file
 * still changes it (its bytes leave).
 */
export function measurementBytesOf(/** @type {string[]} */ files) {
  return files
    .flatMap((f) => [f, ...inheritanceFiles(f)])
    .filter((f) => existsSync(f))
    .map((f) => {
      try {
        return readFileSync(f, 'utf8')
      } catch {
        return `${f}:unreadable`
      }
    })
    .join('\n')
}

/**
 * @typedef {{
 *   doc: Record<string, any>,
 *   judged: Record<string, { status: 'pass' | 'fail' | 'warn' | 'unmeasurable', note: string }>,
 *   where: string
 * }} Measured
 * @typedef {{ measured: Measured | null, rejected: string[] }} MeasurementRead
 */

/**
 * The design system issues of the preview, once each, for /ops (`designSystemIssues` of `/api/ops/quickstarts`):
 * what the kind is, on how many templates of how many, and how to fix the SYSTEM.
 * @returns {Promise<{ system: string, label: string, kind: string, rule: string, what: string, fix: string, lines: number, of: number, examples: string[] }[]>}
 */
export async function designSystemIssues() {
  const file = previewSystemIssues()
  if (!file?.systems) return []
  const { PREVIEW_KINDS, labelOf } = await dsSlotModule('measurement')
  return Object.entries(file.systems).flatMap(([system, kinds]) =>
    Object.entries(kinds).map(([kind, k]) => {
      const reg = PREVIEW_KINDS[kind] ?? { rule: '', what: kind, fix: '' }
      return {
        system,
        label: labelOf(system),
        kind,
        rule: reg.rule,
        what: reg.what,
        fix: reg.systemFix ?? reg.fix,
        lines: k.lines,
        of: k.of,
        examples: k.examples ?? []
      }
    })
  )
}

/** @type {WeakMap<object, Promise<MeasurementRead>>} */
const memo = new WeakMap()

/**
 * The measurement of this release's version, judged, or why none counts.
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<MeasurementRead>}
 */
export function measurementOf(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<MeasurementRead>} */ (memo.get(context))
}

/** @param {import('../index.js').RuleContext} context @returns {Promise<MeasurementRead>} */
async function read(context) {
  const { inheritanceProblem, judgeMeasurement, measurementMatches, previewProbeOf, validateMeasurement } =
    await dsSlotModule('measurement')
  const published = {
    tag: publishedTagOf(String(context.release.tag ?? '')),
    version: context.release.version
  }
  /** @type {{ doc: any, where: string, tree?: boolean }[]} */
  const found = []
  const verification = await readText(context.source, 'VERIFICATION.json')
  if (verification !== null) {
    try {
      const block = JSON.parse(verification)?.designSystem
      if (block) found.push({ doc: block, where: 'VERIFICATION.json' })
    } catch {
      /* a VERIFICATION.json that is not JSON carries no measurement */
    }
  }
  for (const file of treeMeasurementFiles(published)) {
    try {
      found.push({ doc: JSON.parse(readFileSync(file, 'utf8')), where: file, tree: true })
    } catch {
      found.push({ doc: null, where: file })
    }
  }
  /** @type {string[]} */
  const rejected = []
  /** @type {Measured[]} */
  const ok = []
  for (const { doc, where, tree } of found) {
    const why = doc ? validateMeasurement(doc) : ['not JSON']
    if (why.length) {
      rejected.push(`${path.basename(where)}: ${why[0]}`)
      continue
    }
    // only a file of the contract tree has committed files beside it to prove an inheritance with
    const proof = tree
      ? (/** @type {string} */ from) =>
          inheritanceProofAt(path.dirname(where), published, from, {
            selfProblem: inheritanceProblem
          }).problem
      : null
    const match = measurementMatches(doc, published, proof)
    if (!match.ok) {
      rejected.push(`${path.basename(where)}: ${match.reason}`)
      continue
    }
    ok.push({
      doc,
      judged: judgeMeasurement(doc, undefined, { systemIssues: previewSystemIssues() }),
      // the preview probe its preview rows were measured with, for the stamp of a preview rule
      probe: previewProbeOf(doc.preview),
      where
    })
  }
  // the newest READING wins: a preview re-measured in place (`preview-check.mjs --write` stamps
  // previewMeasuredAt and keeps the built-site run's measuredAt) is newer than the release's
  // VERIFICATION.json of the same run, which ties on measuredAt and was read first (Tracy Base WP
  // 1.1.6 read its probe-7 preview rows from the release, 16/10/2026)
  const readAt = (/** @type {any} */ doc) =>
    Math.max(Date.parse(doc.measuredAt) || 0, Date.parse(doc.previewMeasuredAt ?? '') || 0)
  ok.sort((a, b) => readAt(b.doc) - readAt(a.doc))
  return { measured: ok[0] ?? null, rejected }
}
