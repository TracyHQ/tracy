/**
 * `/api/ops/usage*`: Beta › Usage (plan `tasks/todo-do-dung-that.md` U5–U6). What customers' chat
 * requests did and how the Add site form was used, read from the records Tracy already keeps — no
 * table of its own, and no model reading what anybody typed:
 *
 *   - `GET /api/ops/usage?days=7|14|30`: per CMS, the turns opened in the window (`site_turn`), what
 *     they changed (`site_write`, the moment's files), how long they took, what the visual check said,
 *     and four signals kept apart — Good/Bad with its coverage, undo within a day, a follow-up within
 *     ten minutes, a rework of the same place; then the Add site funnel (`ops_signal`, `site_brief`).
 *     Beside it, `research`: the model calls of Website Opportunities research and its Build picture
 *     labels (`wo_cost_ledger`, `lib/ops-usage-research.js`), never folded into the chat figures.
 *   - `GET /api/ops/usage/turns?days=&group=`: a random sample of one group of turns WITH the customer's
 *     words and Tracy's answer — only for the addresses in `USAGE_TEXT_READERS`, each read one `audit`
 *     row. Everyone else on `/ops` sees numbers only.
 *
 * 🔒 RULES AGREED WITH THE COUNCIL (17/10/2026), held here so the screen cannot bend them:
 *   - a count below {@link MIN_FOR_RATE} carries no rate and no median, only `a/b`; the 90th percentile
 *     needs {@link MIN_FOR_P90}. Rates come with a 95% Wilson interval.
 *   - the denominator keeps errors, cut turns, turns still running and nulls; every figure says how
 *     many turns it could be computed on.
 *   - a window that needs time to close counts only what is old enough: undo within a day only turns
 *     closed a day ago, a follow-up only turns closed ten minutes ago, a first request only sites
 *     made a day ago. Nothing younger is called "no".
 *   - "what changed" is what the agent DID, never what the customer asked; a turn may be several
 *     kinds. A follow-up is not a failure, and the four signals are never folded into one score.
 *   - a site from the warm pool (`seconds: 0`) is not a build time; `visual = null` is unknown.
 *   - demo sites and the turns, sites and openings of people holding a Tracy staff seat are left out.
 *
 * NO PROSE IN THE ANSWER: codes and values; the screen words them.
 *
 * MODULE-GRAPH BOUNDARY: imports only `lib/` and `./admit.js`, like every door under `ops/`.
 */
import { Hono } from 'hono'

import { vietnamDay } from '../lib/beta-access.js'
import { resolveSignalRange, signalBucket, signalBuckets } from '../lib/ops-signal-query.js'
import { readUsageData, usagePopulation } from '../lib/ops-usage-data.js'
import { usageQuery } from '../lib/ops-usage-query.js'
import { readResearchUsage, summarizeResearchUsage } from '../lib/ops-usage-research.js'
import { summarizeTokenUsage } from '../lib/ops-usage-tokens.js'
import { admit, denied } from './admit.js'

export const USAGE_WINDOWS = Object.freeze([7, 14, 30])
/** Below this many, a figure is a count (`a/b`) only: no rate, no median. */
export const MIN_FOR_RATE = 20
/** The 90th percentile needs this many. */
export const MIN_FOR_P90 = 100
/** A next turn of the same conversation opened within this after a turn stopped is its follow-up. */
export const FOLLOW_UP_MS = 10 * 60_000
/** An undo this soon after the turn stopped counts against the turn. */
export const UNDO_WINDOW_MS = 24 * 3_600_000
/** A site whose first chat request came this soon after it was made; an opening with no Create by then was left. */
export const DAY_WINDOW_MS = 24 * 3_600_000
/** The CMSes the screen splits by, then `unknown` (a site deleted with nothing else naming its platform). */
export const PLATFORMS = Object.freeze(['wordpress', 'joomla', 'emdash', 'unknown'])
/** What a turn may have changed, in the order the screen lists them. */
export const CHANGE_KINDS = Object.freeze(['added', 'text', 'image', 'look', 'delete', 'files', 'other'])
/** How a turn ended: dsh's `turn/end` kinds, then the states of a turn with none. */
export const ENDINGS = Object.freeze([
  'completed',
  'max-tokens',
  'error',
  'aborted',
  'blocked',
  'interrupted',
  'running',
  'stale',
  'unknown'
])
export const VISUALS = Object.freeze(['shown', 'not_shown', 'broken', 'cannot_tell', 'skipped', 'unknown'])
/** The groups a reader may sample turns from (`/api/ops/usage/turns`). */
export const SAMPLE_GROUPS = Object.freeze(['bad', 'good', 'unrated', 'undone', 'failed', 'not-shown'])
export const SAMPLE_MAX = 20

const ms = (value) => {
  const at = value == null ? NaN : new Date(value).getTime()
  return Number.isFinite(at) ? at : null
}

/**
 * The kind of change one successful write made, from its action (`site_write.action`: the Apply door's
 * verb, or the EmDash MCP tool's name) and the path that reported it (`via`).
 * @param {string} action
 * @param {string | null} via
 * @returns {string} one of {@link CHANGE_KINDS} but `files`
 */
export function changeKind(action, via) {
  if (via === 'look-css' || via === 'file-look' || via === 'look-revert') return 'look'
  const a = String(action ?? '')
  if (/^look[._]/.test(a)) return 'look'
  // Something new: the Apply door files every creation as `content.create` of its kind (an article, a
  // post, a menu item, a module — a page is an article and its menu item), EmDash as `content_create`.
  if (a === 'page.create' || a === 'content.create' || a === 'content_create' || a === 'menu_create')
    return 'added'
  if (/^(content|media)[._]delete$/.test(a) || a === 'menu_delete') return 'delete'
  if (/^media[._]/.test(a)) return 'image'
  // EmDash names a site's title and tagline `settings_update` (the stand, 17/10/2026).
  if (/^(content|site|menu|settings)[._]/.test(a)) return 'text'
  return 'other'
}

/**
 * What one turn changed: the kinds of its successful writes, and `files` when its moment committed
 * files but no write explains them (an edit of the site's own files). Empty: nothing changed.
 * @param {{ action: string, via: string | null, outcome: string }[]} writes
 * @param {number} files
 * @returns {Set<string>}
 */
export function kindsOf(writes, files) {
  const kinds = new Set()
  for (const w of writes) if (w.outcome === 'ok') kinds.add(changeKind(w.action, w.via))
  if (kinds.size === 0 && Number(files) > 0) kinds.add('files')
  return kinds
}

/**
 * The 50th and 90th percentile of `values`, as far as their number allows (nearest rank).
 * @param {number[]} values
 * @returns {{ n: number, p50: number | null, p90: number | null }}
 */
export function quantiles(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  const n = sorted.length
  const at = (q) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))]
  const round = (v) => Math.round(v * 10) / 10
  return {
    n,
    p50: n >= MIN_FOR_RATE ? round(at(0.5)) : null,
    p90: n >= MIN_FOR_P90 ? round(at(0.9)) : null
  }
}

/**
 * `a` out of `b`, with the rate and its 95% Wilson interval once `b` reaches {@link MIN_FOR_RATE}.
 * @param {number} a
 * @param {number} b
 * @returns {{ a: number, b: number, rate: number | null, low: number | null, high: number | null }}
 */
export function rate(a, b) {
  if (b < MIN_FOR_RATE) return { a, b, rate: null, low: null, high: null }
  const z = 1.96
  const p = a / b
  const denominator = 1 + (z * z) / b
  const centre = (p + (z * z) / (2 * b)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / b + (z * z) / (4 * b * b))) / denominator
  const r = (v) => Math.round(v * 1000) / 1000
  return { a, b, rate: r(p), low: r(Math.max(0, centre - half)), high: r(Math.min(1, centre + half)) }
}

/**
 * How a turn ended, as the screen counts it.
 * @param {{ state: string, end_reason: string | null }} t
 */
export function endingOf(t) {
  if (t.end_reason && ENDINGS.includes(t.end_reason)) return t.end_reason
  if (t.state === 'open') return 'running'
  if (t.state === 'stale') return 'stale'
  return 'unknown'
}

/** The (kind, id) a write aimed at, or null. */
const targetKey = (w) =>
  w?.target && typeof w.target === 'object' && w.target.kind && w.target.id != null
    ? `${w.target.kind}:${w.target.id}`
    : null

const emptyTurns = () => ({
  turns: 0,
  tokenTurns: [],
  endings: Object.fromEntries(ENDINGS.map((e) => [e, 0])),
  changes: {
    changed: 0,
    ...Object.fromEntries(CHANGE_KINDS.map((k) => [k, 0])),
    unchangedCompleted: 0,
    unchangedCompletedRefused: 0,
    unchangedNotCompleted: 0,
    unchangedCut: 0,
    outcomeUnknown: 0
  },
  times: { turn: [], firstWrite: [] },
  work: { known: 0, steps: [], calls: [], withFailed: 0 },
  visual: { changed: 0, ...Object.fromEntries(VISUALS.map((v) => [v, 0])) },
  feedback: { rated: 0, positive: 0, negative: 0 },
  undo: { aged: 0, undone: 0, fromChat: 0, fromSiteChanges: 0 },
  followUp: { eligible: 0, followed: 0 },
  rework: { eligible: 0, reworked: 0 }
})

/** The counts of one platform, shaped for the answer (percentiles and rates by the rules above). */
function shapeTurns(acc) {
  return {
    turns: acc.turns,
    tokens: summarizeTokenUsage(acc.tokenTurns),
    endings: acc.endings,
    changes: acc.changes,
    time: { turn: quantiles(acc.times.turn), firstWrite: quantiles(acc.times.firstWrite) },
    work: {
      known: acc.work.known,
      steps: quantiles(acc.work.steps),
      calls: quantiles(acc.work.calls),
      withFailedCalls: rate(acc.work.withFailed, acc.work.known)
    },
    visual: acc.visual,
    feedback: {
      coverage: rate(acc.feedback.rated, acc.turns),
      positive: acc.feedback.positive,
      negative: acc.feedback.negative,
      bad: rate(acc.feedback.negative, acc.feedback.rated)
    },
    undo: {
      within24h: rate(acc.undo.undone, acc.undo.aged),
      fromChat: acc.undo.fromChat,
      fromSiteChanges: acc.undo.fromSiteChanges
    },
    followUp: rate(acc.followUp.followed, acc.followUp.eligible),
    rework: rate(acc.rework.reworked, acc.rework.eligible)
  }
}

/**
 * Fold the window's turns into per-platform figures. Pure: every input is a row the door read.
 * @param {{
 *   turns: any[],
 *   writes: any[],
 *   undoneBySiteChanges: Map<string, number>,
 *   now: number
 * }} input - `turns`: `site_turn` rows with `platform`; `writes`: their `site_write` rows;
 *   `undoneBySiteChanges`: turn id → when a Site changes undo of that turn's moment was pressed.
 */
export function summarizeTurns({ turns, writes, undoneBySiteChanges, now, contextTurns = turns }) {
  const byTurn = new Map()
  for (const w of writes) {
    if (!byTurn.has(w.turn_id)) byTurn.set(w.turn_id, [])
    byTurn.get(w.turn_id).push(w)
  }
  const bySession = new Map()
  // Session labels alone can recur on another site or a later incarnation of the same address.
  const conversation = (t) => JSON.stringify([t.site_key, t.lifetimeKey ?? ms(t.site_instance), t.session_id])
  for (const t of contextTurns) {
    const key = conversation(t)
    if (!bySession.has(key)) bySession.set(key, [])
    bySession.get(key).push(t)
  }
  for (const list of bySession.values()) list.sort((a, b) => a.turn - b.turn)

  const acc = Object.fromEntries([...PLATFORMS, 'all'].map((p) => [p, emptyTurns()]))
  for (const t of turns) {
    const platform = PLATFORMS.includes(t.platform) ? t.platform : 'unknown'
    const mine = byTurn.get(t.turn_id) ?? []
    const kinds = kindsOf(mine, t.files)
    const ending = endingOf(t)
    const opened = ms(t.opened_at)
    const stopped = ms(t.closed_at)
    const okWrites = mine.filter((w) => w.outcome === 'ok')
    const firstWrite = okWrites.length ? Math.min(...okWrites.map((w) => ms(w.at))) : null
    const chatUndo = ms(t.undone_at)
    const siteUndo = undoneBySiteChanges.get(t.turn_id) ?? null
    const next = (bySession.get(conversation(t)) ?? []).find((o) => o.turn > t.turn)
    for (const a of [acc[platform], acc.all]) {
      a.turns += 1
      a.tokenTurns.push(t)
      a.endings[ending] += 1
      if (kinds.size > 0) {
        a.changes.changed += 1
        for (const k of kinds) a.changes[k] += 1
      } else if (mine.some((w) => w.outcome !== 'ok' && w.outcome !== 'refused')) {
        a.changes.outcomeUnknown += 1
      } else if (ending === 'max-tokens') a.changes.unchangedCut += 1
      else if (ending === 'completed') {
        a.changes.unchangedCompleted += 1
        if (Number(t.failed_calls) > 0) a.changes.unchangedCompletedRefused += 1
      } else a.changes.unchangedNotCompleted += 1
      if (opened !== null && stopped !== null && stopped >= opened)
        a.times.turn.push((stopped - opened) / 1000)
      if (opened !== null && firstWrite !== null && firstWrite >= opened)
        a.times.firstWrite.push((firstWrite - opened) / 1000)
      if (t.steps !== null && t.steps !== undefined) {
        a.work.known += 1
        a.work.steps.push(Number(t.steps))
        a.work.calls.push(Number(t.calls))
        if (Number(t.failed_calls) > 0) a.work.withFailed += 1
      }
      if (kinds.size > 0) {
        a.visual.changed += 1
        a.visual[VISUALS.includes(t.visual) ? t.visual : 'unknown'] += 1
      }
      if (t.rating) {
        a.feedback.rated += 1
        a.feedback[t.rating === 'positive' ? 'positive' : 'negative'] += 1
      }
      // Undo within a day: only a turn that changed something, stopped a whole day ago.
      if (kinds.size > 0 && stopped !== null && now - stopped >= UNDO_WINDOW_MS) {
        a.undo.aged += 1
        const chat = chatUndo !== null && chatUndo >= stopped && chatUndo - stopped <= UNDO_WINDOW_MS
        const site = siteUndo !== null && siteUndo >= stopped && siteUndo - stopped <= UNDO_WINDOW_MS
        if (chat || site) a.undo.undone += 1
        if (chat) a.undo.fromChat += 1
        else if (site) a.undo.fromSiteChanges += 1
      }
      // A follow-up: the conversation's next turn, opened within ten minutes of this one stopping.
      if (stopped !== null && now - stopped >= FOLLOW_UP_MS) {
        a.followUp.eligible += 1
        const nextOpened = next ? ms(next.opened_at) : null
        if (nextOpened !== null && nextOpened >= stopped && nextOpened - stopped <= FOLLOW_UP_MS)
          a.followUp.followed += 1
        // A rework: that next turn wrote to a place this one wrote to.
        const mineTargets = new Set(okWrites.map(targetKey).filter(Boolean))
        if (mineTargets.size > 0) {
          a.rework.eligible += 1
          const nextTargets =
            next && nextOpened !== null && nextOpened >= stopped && nextOpened - stopped <= FOLLOW_UP_MS
              ? (byTurn.get(next.turn_id) ?? []).filter((w) => w.outcome === 'ok').map(targetKey)
              : []
          if (nextTargets.some((k) => k && mineTargets.has(k))) a.rework.reworked += 1
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([p, a]) => [p, shapeTurns(a)]))
}

const emptyFunnel = () => ({
  created: 0,
  built: { done: 0, failed: 0, pending: 0 },
  ready: [],
  warm: 0,
  readyUnknown: 0,
  customize: { none: 0, applied: 0, failed: 0, inProgress: 0 },
  entered: { counted: 0, entered: 0 },
  firstRequest: { aged: 0, within24h: 0 },
  returned: { aged: 0, returned: 0 }
})

/**
 * Fold the Add site records into the funnel. Pure.
 * @param {{
 *   openings: { wizard_id: string, occurred_at: Date }[],
 *   creates: { site_key: string, platform: string | null, wizard_id: string | null, occurred_at: Date }[],
 *   results: Map<string, { seconds: number }>,
 *   stuck: Set<string>,
 *   briefs: Map<string, string>,
 *   entries: Map<string, Date[]>,
 *   firstTurns: Map<string, Date>,
 *   enteredSince: Date | null,
 *   now: number
 * }} input - `enteredSince`: when Tracy started recording visits (its first `site.entered` or
 *   `wizard.opened`). A site made before it could never have one, so visits and returns are counted only
 *   on sites made since (null: none yet).
 */
export function summarizeFunnel({
  openings,
  creates,
  wizardCreates = creates,
  results,
  stuck,
  briefs,
  entries,
  firstTurns,
  enteredSince = null,
  now
}) {
  // An opening reached Create when a creation carried its id; one with none is "left" only once a day
  // has passed (`pending` before that). Openings from a page older than the id are not here at all.
  const owner = (row) => String(row.data?.email ?? row.account_email ?? '').toLowerCase()
  const reachedCreate = (opening) =>
    wizardCreates.some(
      (created) =>
        created.wizard_id &&
        created.wizard_id === opening.wizard_id &&
        ms(created.occurred_at) >= ms(opening.occurred_at) &&
        (!owner(opening) || !owner(created) || owner(opening) === owner(created))
    )
  let reached = 0
  let pending = 0
  let agedOpenings = 0
  let agedReached = 0
  for (const o of openings) {
    const hit = reachedCreate(o)
    const aged = now - ms(o.occurred_at) >= DAY_WINDOW_MS
    if (hit) reached += 1
    else if (!aged) pending += 1
    if (aged) {
      agedOpenings += 1
      if (hit) agedReached += 1
    }
  }
  const acc = Object.fromEntries([...PLATFORMS, 'all'].map((p) => [p, emptyFunnel()]))
  for (const c of creates) {
    const platform = PLATFORMS.includes(c.platform) ? c.platform : 'unknown'
    const made = ms(c.occurred_at)
    const result = results.get(c.site_key)
    const brief = briefs.get(c.site_key) ?? null
    const visits = (entries.get(c.site_key) ?? []).filter((v) => ms(v) >= made && ms(v) <= now)
    const first = firstTurns.get(c.site_key) ?? null
    for (const a of [acc[platform], acc.all]) {
      a.created += 1
      if (result) {
        a.built.done += 1
        if (result.seconds != null && result.seconds !== '' && Number(result.seconds) > 0)
          a.ready.push(Number(result.seconds))
        else if (result.seconds === 0 || result.seconds === '0') a.warm += 1
        else a.readyUnknown += 1
      } else if (stuck.has(c.site_key)) a.built.failed += 1
      else a.built.pending += 1
      if (brief === null) a.customize.none += 1
      else if (brief === 'applied') a.customize.applied += 1
      else if (brief === 'failed') a.customize.failed += 1
      else a.customize.inProgress += 1
      const visitsKnown = enteredSince !== null && made >= ms(enteredSince)
      if (visitsKnown) {
        a.entered.counted += 1
        if (visits.length > 0) a.entered.entered += 1
      }
      if (now - made >= DAY_WINDOW_MS) {
        a.firstRequest.aged += 1
        if (first !== null && ms(first) >= made && ms(first) - made <= DAY_WINDOW_MS)
          a.firstRequest.within24h += 1
        if (visitsKnown) {
          a.returned.aged += 1
          if (new Set(visits.map((v) => vietnamDay(ms(v)))).size >= 2) a.returned.returned += 1
        }
      }
    }
  }
  const shaped = Object.fromEntries(
    Object.entries(acc).map(([p, a]) => [
      p,
      {
        created: a.created,
        built: a.built,
        ready: quantiles(a.ready),
        warm: a.warm,
        readyUnknown: a.readyUnknown,
        customize: a.customize,
        entered: rate(a.entered.entered, a.entered.counted),
        firstRequestWithin24h: rate(a.firstRequest.within24h, a.firstRequest.aged),
        returnedAnotherDay: rate(a.returned.returned, a.returned.aged)
      }
    ])
  )
  return {
    wizard: {
      opened: openings.length,
      reachedCreate: reached,
      pending,
      leftBeforeCreate: agedOpenings - agedReached,
      reachedCreateRate: rate(agedReached, agedOpenings)
    },
    byPlatform: shaped
  }
}

/** Complete metadata-only report; raw rows are also a seam for independent numeric verification. */
export function summarizeUsage(raw, query, staff, now) {
  resolveSignalRange(
    query,
    [
      ...raw.turns.map((row) => row.opened_at),
      ...raw.events.map((row) => row.occurred_at),
      ...raw.writes.map((row) => row.at),
      ...raw.operations.map((row) => row.created_at)
    ],
    now
  )
  if (query.allTime) query.observedEnd = query.end
  const data = usagePopulation(raw, query, staff, now)
  const byHead = new Map(
    data.contextTurns
      .filter((t) => t.head_sha && t.lifetimeKey)
      .map((t) => [`${t.lifetimeKey}:${t.head_sha}`, t.turn_id])
  )
  const undoneBySiteChanges = new Map()
  for (const op of data.operations) {
    if (op.action !== 'undo') continue
    const id = byHead.get(`${op.lifetimeKey}:${op.target_sha}`)
    const when = ms(op.created_at)
    if (op.lifetimeKey && id && (!undoneBySiteChanges.has(id) || when < undoneBySiteChanges.get(id)))
      undoneBySiteChanges.set(id, when)
  }
  const summarize = (turns) =>
    summarizeTurns({ turns, writes: data.writes, undoneBySiteChanges, now, contextTurns: data.contextTurns })
  const turns = summarize(data.turns)
  const daily = []
  for (const day of signalBuckets(query)) {
    const group = data.turns.filter((row) => signalBucket(row.opened_at, query) === day)
    const stats = summarize(group).all
    daily.push({
      day,
      requests: stats.turns,
      tokens: stats.tokens.total,
      tokenCoverage: {
        measuredRequests: stats.tokens.measuredRequests,
        requests: stats.turns,
        partialRequests: stats.tokens.partialRequests
      },
      changed: stats.changes.changed,
      negative: stats.feedback.negative,
      undone: stats.undo.within24h.a
    })
  }
  const customerRows = (population) =>
    [...new Set(population.turns.map((t) => t.actor.toLowerCase()))]
      .map((email) => {
        const group = population.turns.filter((t) => t.actor.toLowerCase() === email)
        const stats = summarize(group).all
        const tokens = summarizeTokenUsage(group)
        return {
          email,
          requests: stats.turns,
          changed: stats.changes.changed,
          good: stats.feedback.positive,
          bad: stats.feedback.negative,
          undone: stats.undo.within24h.a,
          followUps: stats.followUp.a,
          reworks: stats.rework.a,
          tokens: tokens.total,
          tokenCoverage: {
            measuredRequests: tokens.measuredRequests,
            requests: tokens.requests,
            partialRequests: tokens.partialRequests
          },
          tokensPerRequest: tokens.perRequest,
          sitesChanged: new Set(
            group
              .filter(
                (turn) =>
                  kindsOf(
                    population.writes.filter((write) => write.turn_id === turn.turn_id),
                    turn.files
                  ).size > 0
              )
              .map((turn) => turn.lifetimeKey ?? `${turn.site_key}:${turn.site_instance ?? ''}`)
          ).size,
          siteCount: new Set(group.map((t) => `${t.site_key}:${t.site_instance ?? ''}`)).size,
          platforms: [...new Set(group.map((t) => t.platform))],
          lastRequestAt: new Date(Math.max(...group.map((t) => ms(t.opened_at)))).toISOString()
        }
      })
      .sort((a, b) => b.requests - a.requests || a.email.localeCompare(b.email))
  const customers = customerRows(data)
  // The owner's usage leaderboard always represents real customers on non-demo sites.
  const tokenPopulation = usagePopulation(
    raw,
    {
      ...query,
      filters: { ...query.filters, audience: 'customers', demo: 'exclude' }
    },
    staff,
    now
  )
  const tokenCustomers =
    query.filters.audience === 'staff' || query.filters.demo === 'only'
      ? []
      : customerRows(tokenPopulation).sort(
          (a, b) =>
            (b.tokens ?? -1) - (a.tokens ?? -1) || b.requests - a.requests || a.email.localeCompare(b.email)
        )
  return {
    turns,
    siteUndos: {
      restores: data.operations.filter(
        (o) =>
          o.action === 'reset' &&
          ms(o.created_at) >= query.start.getTime() &&
          ms(o.created_at) < query.observedEnd.getTime()
      ).length,
      rowReverts: data.standaloneWrites.length
    },
    funnel: summarizeFunnel({ ...data, now }),
    daily,
    customers,
    tokenCustomers,
    limitations: data.limitations
  }
}

export function usageRoutes({ pool, config, now = Date.now }) {
  const app = new Hono()
  const readers = new Set(
    (Array.isArray(config?.usageTextReaders) ? config.usageTextReaders : []).map((email) =>
      String(email).toLowerCase()
    )
  )
  const guard = async (c) => {
    const who = await admit(c, { pool, config })
    return who === 'sign-in' || who === null ? { deny: denied(c, who) } : { who }
  }
  const queryOf = (c, at) => usageQuery(new URL(c.req.url).searchParams, at)
  const invalid = (c, error) =>
    c.json({ code: 'INVALID_USAGE_FILTER', parameter: error.parameter ?? 'range' }, 400)
  async function staffEmails() {
    return (
      await pool.query(`select distinct lower(a.email) as email from account a
      join seat_workspace sw on sw.account_id=a.id join workspace w on w.id=sw.workspace_id
      where w.kind='tracy_admin' and sw.revoked_at is null and sw.declined_at is null
        and sw.accepted_at is not null`)
    ).rows.map((row) => row.email)
  }

  app.get('/api/ops/usage', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const at = now()
    let query
    try {
      query = queryOf(c, at)
    } catch (error) {
      return invalid(c, error)
    }
    const staff = await staffEmails()
    const raw = await readUsageData(pool, query, at)
    const current = summarizeUsage(raw, query, staff, at)
    const previousQuery = {
      ...query,
      start: query.previousStart,
      end: query.start,
      observedEnd: query.previousEnd
    }
    const previous = query.compare ? summarizeUsage(raw, previousQuery, staff, at) : null
    const research = summarizeResearchUsage(await readResearchUsage(pool, query), {
      audience: query.filters.audience,
      staff: new Set(staff),
      minForMedian: MIN_FOR_RATE,
      minForP90: MIN_FOR_P90
    })
    return c.json({
      readAt: new Date(at).toISOString(),
      days: query.days,
      since: query.start.toISOString(),
      range: query.range,
      filters: query.filters,
      rules: { minForRate: MIN_FOR_RATE, minForP90: MIN_FOR_P90 },
      platforms: [...PLATFORMS, 'all'],
      ...current,
      research,
      previous,
      previousDaily: previous?.daily ?? [],
      canReadText: readers.has(g.who.email.toLowerCase())
    })
  })

  // The existing audited text action remains gated independently from metadata access.
  app.get('/api/ops/usage/turns', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    if (!readers.has(g.who.email.toLowerCase())) return c.body(null, 403)
    const group = c.req.query('group')
    if (!SAMPLE_GROUPS.includes(group)) return c.json({ code: 'INVALID_GROUP' }, 400)
    const at = now()
    let query
    try {
      query = queryOf(c, at)
    } catch (error) {
      return invalid(c, error)
    }
    const staff = await staffEmails()
    const raw = await readUsageData(pool, query, at)
    const data = usagePopulation(raw, query, staff, at)
    const byHead = new Map(
      data.contextTurns
        .filter((t) => t.head_sha && t.lifetimeKey)
        .map((t) => [`${t.lifetimeKey}:${t.head_sha}`, t.turn_id])
    )
    const undos = new Map()
    for (const op of data.operations) {
      const id = op.action === 'undo' ? byHead.get(`${op.lifetimeKey}:${op.target_sha}`) : null
      if (op.lifetimeKey && id && (!undos.has(id) || ms(op.created_at) < undos.get(id)))
        undos.set(id, ms(op.created_at))
    }
    const matches = (t) => {
      if (group === 'bad') return t.rating === 'negative'
      if (group === 'good') return t.rating === 'positive'
      if (group === 'unrated') return !t.rating
      if (group === 'failed') return endingOf(t) !== 'completed'
      if (group === 'not-shown')
        return (
          ['not_shown', 'broken'].includes(t.visual) &&
          kindsOf(
            data.writes.filter((w) => w.turn_id === t.turn_id),
            t.files
          ).size > 0
        )
      return (
        summarizeTurns({ turns: [t], writes: data.writes, undoneBySiteChanges: undos, now: at }).all.undo
          .within24h.a > 0
      )
    }
    const ids = data.turns.filter(matches).map((t) => t.turn_id)
    const rows = ids.length
      ? (
          await pool.query(
            `select turn_id,title,reply,visual_note from site_turn
      where turn_id=any($1::text[]) order by random() limit $2`,
            [ids, SAMPLE_MAX]
          )
        ).rows
      : []
    await pool.query(`insert into audit (actor,action,detail) values ($1,'ops.usage.read-turns',$2::jsonb)`, [
      g.who.email,
      JSON.stringify({ group, days: query.days, turns: rows.map((r) => r.turn_id) })
    ])
    const iso = (value) => (value ? new Date(value).toISOString() : null)
    return c.json({
      group,
      days: query.days,
      turns: rows.map((r) => {
        const t = data.turns.find((row) => row.turn_id === r.turn_id)
        return {
          turnId: t.turn_id,
          siteKey: t.site_key,
          platform: t.platform,
          source: t.source,
          request: r.title,
          reply: r.reply,
          openedAt: iso(t.opened_at),
          seconds:
            ms(t.closed_at) !== null && ms(t.closed_at) >= ms(t.opened_at)
              ? Math.round((ms(t.closed_at) - ms(t.opened_at)) / 100) / 10
              : null,
          ending: endingOf(t),
          changed: [
            ...kindsOf(
              data.writes.filter((w) => w.turn_id === t.turn_id),
              t.files
            )
          ],
          steps: t.steps,
          calls: t.calls,
          failedCalls: t.failed_calls,
          visual: t.visual,
          visualNote: r.visual_note,
          rating: t.rating,
          undone: ms(t.undone_at) !== null || undos.has(t.turn_id)
        }
      })
    })
  })
  return app
}
