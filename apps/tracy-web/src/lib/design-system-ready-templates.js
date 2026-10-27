/**
 * Which templates are design system READY for customers, read from the same verdict /ops shows: the
 * Road to live step "Design system" (`road-to-live.js` `roadOf`, ADR 0031) of each choosable release,
 * built from the stored Template Design System Readiness check (`design-system-readiness.js`
 * `dsReadinessRows`), the live demo and the preview door health, exactly as `GET /api/ops/quickstarts`
 * builds it. No second verdict is computed here: this module only reads the step's code.
 *
 * 🔒 OPEN = EVERY CHOOSABLE RELEASE OF THE TEMPLATE SAYS `ds-ready`. That code means the check ran on
 * the release's current version and left 0 must-fix, 0 worth-fixing and nothing "not measured".
 * Anything else locks the template for customers: must-fix, worth-fixing, not measured, an error,
 * a check still running, and a version NEVER CHECKED (no row yet: locked until the check has run).
 * A template no choosable release builds is locked. A read that fails is locked.
 *
 * Kept a short while per process (`ttlMs`), so a door does not run three queries per request; a new
 * verdict on /ops reaches customers within that time.
 */
import { defaultContracts } from './contracts.js'
import { candidateKeys, dsReadinessOf, dsReadinessRows } from './design-system-readiness.js'
import { liveDemosByTag } from './demo-sites.js'
import { readReleases } from './quickstart-releases.js'
import { roadOf } from './road-to-live.js'

/** The Road to live code that opens a template to customers. */
export const DS_READY_CODE = 'ds-ready'

/**
 * The verdict of every template key the choosable releases stand for. PURE.
 * @param {{
 *   releases: any[],
 *   dsChecks: Map<string, any>,
 *   live?: Map<string, any>,
 *   doorHealth?: { of: (tag: string) => any } | null,
 *   contracts?: any
 * }} world the rows /ops reads
 * @returns {Map<string, { open: boolean, releases: { tag: string, version: string | null, code: string }[] }>}
 */
export function readyTemplates({ releases, dsChecks, live = new Map(), doorHealth = null, contracts }) {
  const index = contracts ?? defaultContracts()
  /** @type {Map<string, { open: boolean, releases: { tag: string, version: string | null, code: string }[] }>} */
  const out = new Map()
  for (const release of releases) {
    if (!release?.choosable) continue
    const road = roadOf(release, {
      demo: live.get(release.tag) ?? null,
      doorHealth: doorHealth?.of(release.tag) ?? null,
      contracts: index,
      dsReadiness: dsReadinessOf(dsChecks, release)
    })
    const code = road?.find((s) => s.step === 'design-system')?.code ?? 'ds-not-checked'
    const version = typeof release.setting?.version === 'string' ? release.setting.version : null
    for (const key of candidateKeys(release)) {
      const entry = out.get(key) ?? { open: true, releases: [] }
      entry.releases.push({ tag: release.tag, version, code })
      entry.open = entry.open && code === DS_READY_CODE
      out.set(key, entry)
    }
  }
  return out
}

/**
 * The reader the customer lock asks (`design-system-customer-lock.js` `isReady`).
 * @param {{
 *   pool: any,
 *   doorHealth?: { of: (tag: string) => any } | null,
 *   ttlMs?: number,
 *   now?: () => number
 * }} deps
 * @returns {(templateKey: string | null | undefined) => Promise<boolean>}
 */
export function readyTemplatesReader({ pool, doorHealth = null, ttlMs = 30_000, now = Date.now }) {
  /** @type {{ at: number, map: Promise<Map<string, { open: boolean }>> } | null} */
  let memo = null
  const load = async () => {
    const [releases, dsChecks, live] = await Promise.all([
      readReleases(pool, { choosable: true }),
      dsReadinessRows(pool),
      liveDemosByTag(pool)
    ])
    return readyTemplates({ releases, dsChecks, live, doorHealth })
  }
  return async (templateKey) => {
    if (typeof templateKey !== 'string' || templateKey === '' || !pool) return false
    try {
      if (!memo || now() - memo.at > ttlMs) {
        const map = load()
        memo = { at: now(), map }
        // a failed read is not kept: the next ask reads again
        map.catch(() => {
          memo = null
        })
      }
      return (await memo.map).get(templateKey)?.open === true
    } catch {
      return false
    }
  }
}
