/**
 * The template readiness verdict: given one quickstart release and the world Road to live already gets, the state of
 * each piece the Website opportunity flow reads, in a fixed order (spec #429, ticket #431).
 *
 *   quickstart-release   the release on GitHub and its install file (steps release, install-file)
 *   contract             the content contract, its content map and content coverage (steps contract, content-coverage)
 *   template-kit         the template kit beside the contract and what the flow reads of it (step template-kit)
 *   cowork-pin           the Claude Cowork plugin a new site gets: the Customize your site rules that read the pinned
 *                        plugin (STAB-1, `customize-split.js`)
 *   customize            every other rule of Customize your site (the questions a customer answers)
 *   design-system        the design system slot contract and its readiness check (step design-system)
 *   demo-baseline        the demo baseline beside the contract, measured once per quickstart version (a check alone,
 *                        `demo-baseline-check.js`, ticket #433)
 *
 * 🔒 ONE SET OF FACTS. The steps are the very Road to live steps (`release-steps.js`, `check-steps.js` and the two
 * road-step modules), built once here; `roadOf` starts its road from `verdictSteps` and adds the demo, the listing,
 * Publish and polish after them. So Road to live and the verdict can never disagree, and every code a piece carries
 * is a Road to live code, worded by the same guide.
 *
 * A piece is `{ piece, step, state, code, params, blockedBy? }`, its state one of Road to live's, or `not-judged` from a check (never a pass, never a hold) (`done`, `warn`,
 * `todo`, `blocked`, and `checking` while a stored check of the piece still runs): the first of its steps not passed decides it (a
 * `todo`, `blocked` or `checking` step), else its first `warn`, else its last step (`done`). `step` names the step
 * that decided it.
 *
 * EXTENSION POINT: `CHECKS` (`checks.js`, one line per check). A check that is not a road step (plugin write doors, hidden kit fields, demo measurements, the
 * demo baseline) is its own module returning `{ state, code, params, blockedBy? }` for one piece; listed in `CHECKS` (or handed in as
 * `world.checks`), it joins that piece after its road steps, or opens a new piece after the fixed ones when it names one.
 * A check is not a Road to live step until its own ticket puts it on the road.
 */
import { fitOfRelease } from '../content-coverage/fit.js'
import { contentCoverageStep, coverageOfRelease } from '../content-coverage/road-step.js'
import { rolesOfRelease } from '../content-coverage/roles.js'
import { previewDemoGap } from '../preview-demo.js'
import { baselineOfRelease } from '../template-kit/demo-baseline-file.js'
import { kitMapOfRelease, kitOfRelease, templateKitStep } from '../template-kit/road-step.js'
import { customizeStep, designSystemStep } from './check-steps.js'
import { CHECKS } from './checks.js'
import { customizeHalves } from './customize-split.js'
import { releaseSteps } from './release-steps.js'

export { CHECKS }

/**
 * The pieces in verdict order: the Road to live steps each one is made of, or (`half`) the half of Customize your
 * site it carries (`customize-split.js`).
 */
export const PIECES = Object.freeze([
  { piece: 'quickstart-release', steps: ['release', 'install-file'] },
  { piece: 'contract', steps: ['contract', 'content-coverage'] },
  { piece: 'template-kit', steps: ['template-kit'] },
  { piece: 'cowork-pin', half: 'plugin' },
  { piece: 'customize', half: 'rest' },
  { piece: 'design-system', steps: ['design-system'] },
  // Made of a check alone (`demo-baseline-check.js`), not a Road to live step.
  { piece: 'demo-baseline', steps: [] }
])

/** The Road to live steps the verdict builds, in road order: the first steps of every road. */
export const VERDICT_STEPS = Object.freeze([
  'release',
  'install-file',
  'contract',
  'content-coverage',
  'template-kit',
  'customize',
  'design-system'
])

/**
 * A step or piece that holds nothing: done, done with something worth fixing, or `not-judged` (a check that cannot
 * judge this platform yet, e.g. the WordPress write doors: no fix exists, so nothing is held and nothing is green).
 */
export const passed = (s) => s.state === 'done' || s.state === 'warn' || s.state === 'not-judged'

/** An empty road, with the two helpers every step module is handed. */
export function startRoad() {
  /** @type {{ step: string, state: any, code: string, params: Record<string, unknown>, blockedBy?: string }[]} */
  const road = []
  const put = (step, state, code, params = {}, blockedBy = undefined) => {
    const s = /** @type {any} */ ({ step, state, code, params })
    if (blockedBy) s.blockedBy = blockedBy
    road.push(s)
    return s
  }
  /** The first of `steps` not passed yet, or undefined. */
  const waitingOn = (steps) =>
    steps.map((n) => road.find((s) => s.step === n)).find((s) => s && !passed(s))?.step
  return { road, put, waitingOn }
}

/**
 * Put the verdict's Road to live steps (`VERDICT_STEPS`) of `release` on `at`.
 * @param {any} release one row of `readReleases`
 * @param {any} world what `roadOf` is handed (see there); `server: false` says there is no server behind the call
 *   (the command line), so the facts only a server knows (DEMO-1: its own demo; preview door health) are not judged
 * @param {ReturnType<typeof startRoad>} road the road to put them on
 * @returns {{ version: string | null, own: { state: string, profile: string | null } }}
 */
export function verdictSteps(release, world, { put, waitingOn }) {
  const { contracts, siblings = [], readiness = null, dsReadiness = null, demo = null } = world
  const { version, own } = releaseSteps(put, waitingOn, { release, contracts, siblings })
  contentCoverageStep(put, waitingOn, {
    release,
    version,
    contractId: own.profile,
    coverage: world.coverage ?? coverageOfRelease(release, contracts),
    roles: world.roles ?? rolesOfRelease(release, contracts),
    fit: world.fit ?? fitOfRelease(release, contracts)
  })
  templateKitStep(put, waitingOn, {
    release,
    version,
    contractId: own.profile,
    kit: world.templateKit ?? kitOfRelease(release, contracts),
    // `null` is an answer here (no content map beside the kit), so only a missing key reads the folder.
    map: world.kitMap === undefined ? kitMapOfRelease(release, contracts) : world.kitMap,
    baseline: world.demoBaseline ?? baselineOfRelease(release, contracts)
  })
  customizeStep(put, waitingOn, { release, version, readiness })
  const server = world.server !== false
  designSystemStep(put, waitingOn, {
    release,
    version,
    readiness: dsReadiness,
    severity: world.dsSeverity,
    previewGap: server ? previewDemoGap(demo) : undefined,
    doorHealth: server ? (world.doorHealth ?? null) : null
  })
  return { version, own }
}

/** The piece made of `entries` (road steps and checks, in order). */
function pieceOf(piece, entries) {
  const decider =
    entries.find((s) => !passed(s)) ??
    entries.find((s) => s.state === 'warn') ??
    // Never green: a piece with a check that was not judged says so, rather than the done entry beside it.
    entries.find((s) => s.state === 'not-judged') ??
    entries.at(-1)
  const out = /** @type {any} */ ({
    piece,
    step: decider.step,
    state: decider.state,
    code: decider.code,
    params: decider.params
  })
  if (decider.blockedBy) out.blockedBy = decider.blockedBy
  return out
}

/**
 * The readiness verdict of one release, or null for a design pack (it has no road either).
 * @param {any} release one row of `readReleases`, or one built from the quickstart list pin (`pinned-release.js`)
 * @param {any} world what `roadOf` is handed, plus `server` (see `verdictSteps`) and `checks` (default `CHECKS`)
 * @returns {{ tag: string, version: string | null, steps: any[], pieces: { piece: string, step: string, state: string, code: string, params: Record<string, unknown>, blockedBy?: string }[] } | null}
 */
export function readinessVerdict(release, world) {
  if (!release || release.kind === 'design-pack') return null
  const road = startRoad()
  const { version } = verdictSteps(release, world, road)
  const steps = road.road
  const halves = customizeHalves({ release, version, readiness: world.readiness ?? null }, road.waitingOn)
  /** @type {Map<string, any[]>} */
  const entries = new Map(
    PIECES.map((p) => [p.piece, p.half ? [halves[p.half]] : steps.filter((s) => p.steps?.includes(s.step))])
  )
  for (const check of world.checks ?? CHECKS) {
    const judged = check.judge(release, world, { steps, version })
    if (!judged) continue
    const list = entries.get(check.piece) ?? []
    const entry = /** @type {any} */ ({
      step: check.step,
      state: judged.state,
      code: judged.code,
      params: judged.params ?? {}
    })
    if (judged.blockedBy) entry.blockedBy = judged.blockedBy
    list.push(entry)
    entries.set(check.piece, list)
  }
  const pieces = [...entries]
    .filter(([, list]) => list.length > 0)
    .map(([piece, list]) => pieceOf(piece, list))
  return { tag: release.tag, version, steps, pieces }
}
