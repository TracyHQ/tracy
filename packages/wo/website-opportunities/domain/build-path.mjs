// Which build path a site takes (#598, spec #577): the AI quickstart build (needs profile, plan composer, write step
// into a blank site) or the current build path. Decided from data only: the AI quickstart pins, the kit manifests and
// the trade of the business. No template name, id or trade is written here, so a template joins the new path by being
// pinned, with no code change.
//
// 🔒 A PINNED AI QUICKSTART is what the pin reader says it is (#588, `ai-quickstart-pin.mjs`
// `resolvePinnedAiQuickstart`: exactly the pinned version, its files, check record and template kit as published, and
// a manifest that names a site). This module is handed that answer per template and never reads a file. On top of it
// the kit manifest must say `released: true` and name the pinned slug and version under `template`. A template that is
// not pinned keeps the reasons it was refused (`refused`, with the codes the pin reader gave), so a caller can log why
// a kit is not offered.
//
// 🔒 FIT IS DECLARED, NEVER GUESSED. A pinned AI quickstart fits the trades its manifest lists under `trades` (values
// of `TRADES`). A manifest without that list, or with something else in it, fits nothing: its trade takes the current
// path. Nothing here maps one trade to another.
//
// 🔒 TWO THAT FIT: the one first in code point order of `<slug>/<cms>` is chosen, whatever order the data came in.

/** The two answers. */
export const BUILD_PATHS = Object.freeze({ aiQuickstart: 'ai-quickstart', current: 'current' })

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/**
 * A quickstart tag without its release prefix or version suffix: `quickstart/<slug>/<cms>/1.0.10` and
 * `<slug>/<cms>@1.0.10` are both `<slug>/<cms>`, and so are the AI quickstart's own release
 * `ai-quickstart/<slug>/<cms>` (`ai-quickstart-pin.mjs` `aiQuickstartReleaseOf`) and a dev stand's local pack of either
 * (`local/...`, tracy-web `local-releases.js`). Anything that is not text is `''`.
 * @param {unknown} quickstart
 */
export function quickstartTemplateKey(quickstart) {
  if (typeof quickstart !== 'string') return ''
  return quickstart
    .trim()
    .replace(/^local\//, '')
    .replace(/^(?:ai-)?quickstart\//, '')
    .replace(/@.*$/, '')
    .replace(/\/v?\d+(\.\d+)*$/, '')
}

const problem = (code, message) => [{ code, message }]

/** Why a template with a pin answer is not a pinned AI quickstart; empty when it is one. */
function refusalOf(t) {
  if (!t.pin || t.pin.ok !== true)
    return Array.isArray(t.pin?.problems) && t.pin.problems.length
      ? t.pin.problems
      : problem('not_pinned', 'no pin answer for this template')
  const m = t.manifest
  if (!m || typeof m !== 'object')
    return problem('manifest_unreadable', 'the pinned kit has no readable manifest')
  if (m.released !== true) return problem('not_released', 'the pinned kit manifest does not say released')
  if (m.template?.slug !== t.slug || m.template?.version !== t.pin.version)
    return problem('manifest_mismatch', 'the pinned kit manifest names another template or version')
  return []
}

/**
 * The pinned AI quickstarts among the templates found, in the chosen order, and why each other one is not.
 * @param {{templates?: Array<{slug: string, cms: string, pin: {ok: true, version: string} | {ok: false,
 *   problems: Array<{code: string, message: string}>}, manifest?: unknown}>}} data one entry per template: `pin` is
 *   what `resolvePinnedAiQuickstart` answered for it, `manifest` the parsed `kit-manifest.json` of the pinned folder
 * @returns {{pinned: Array<{key: string, slug: string, cms: string, version: string, trades: string[]}>,
 *   refused: Array<{key: string, slug: string, cms: string, problems: Array<{code: string, message: string}>}>}}
 */
export function aiQuickstartPinsOf({ templates = [] } = {}) {
  const pinned = []
  const refused = []
  for (const t of Array.isArray(templates) ? templates : []) {
    if (!t || !isText(t.slug) || !isText(t.cms)) continue
    const key = `${t.slug}/${t.cms}`
    const problems = refusalOf(t)
    if (problems.length) {
      refused.push({ key, slug: t.slug, cms: t.cms, problems })
      continue
    }
    const trades = Array.isArray(t.manifest.trades) ? t.manifest.trades.filter(isText) : []
    pinned.push({ key, slug: t.slug, cms: t.cms, version: t.pin.version, trades })
  }
  return { pinned: pinned.sort(byKey), refused: refused.sort(byKey) }
}

/** The pinned AI quickstarts alone (`aiQuickstartPinsOf(data).pinned`). */
export const pinnedAiQuickstarts = (data) => aiQuickstartPinsOf(data).pinned

/**
 * The pinned AI quickstarts that declare this trade, in the chosen order.
 * @param {{trade: unknown, quickstarts: ReturnType<typeof pinnedAiQuickstarts>}} args
 */
export function fittingAiQuickstarts({ trade, quickstarts = [] }) {
  if (!isText(trade)) return []
  return [...quickstarts].filter((q) => q.trades.includes(trade)).sort(byKey)
}

/**
 * Which path a business of this trade takes: the AI quickstart build with the chosen template when a pinned AI
 * quickstart fits, else the current build path.
 * @param {{trade: unknown, quickstarts: ReturnType<typeof pinnedAiQuickstarts>}} args
 * @returns {{path: 'ai-quickstart', quickstart: object, fitting: object[]} | {path: 'current', quickstart: null,
 *   fitting: []}}
 */
export function buildPathFor({ trade, quickstarts = [] }) {
  const fitting = fittingAiQuickstarts({ trade, quickstarts })
  return fitting.length
    ? { path: BUILD_PATHS.aiQuickstart, quickstart: fitting[0], fitting }
    : { path: BUILD_PATHS.current, quickstart: null, fitting: [] }
}

/**
 * The pinned AI quickstart of the template a quickstart tag names, or null: what the create door asks of a build.
 * @param {{quickstart: unknown, quickstarts: ReturnType<typeof pinnedAiQuickstarts>}} args
 */
export function aiQuickstartOfTemplate({ quickstart, quickstarts = [] }) {
  const key = quickstartTemplateKey(quickstart)
  if (!key) return null
  return quickstarts.find((q) => q.key === key) ?? null
}
