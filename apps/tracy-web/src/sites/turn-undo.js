/**
 * UNDO BY CHAT TURN — the decisions, with no database, no host and no HTTP (plan
 * `tasks/undo-change/plan.md` PR 1, contract `tasks/undo-change/api-contract.md`).
 *
 * `route.js` reads the facts (`turn-undo-store.js`, the host's `turn-moments` and `undo-check`
 * jobs) and hands them here; this file says what each turn of a conversation changed, whether it
 * can be undone and why not, and in which order an undo runs. `runUndo` executes a plan through
 * injected steps, so the stop-at-first-failure rule is tested without a site.
 *
 * What a turn changed, by source:
 *   files    the Git moments carrying its `Tracy-Turn` trailer (`webroot-git.sh turn-moments`);
 *            one is undone when a succeeded `site_operation` undo names it.
 *   content  its writes through the Apply door (`site_write` via `apply`, joined to the `audit`
 *            row of the same statement for the `apply_id`); one is undone when an `apply.revert`
 *            of that id succeeded after its last write.
 *   look     its WordPress look writes (`site_write` via `look-css`, action `look.set`, target
 *            `{kind: 'additional-css', id: <look undo id>}`): `look.set` writes the site's Additional
 *            CSS, a database post Git never sees, and keeps its own undo entry with the CSS before
 *            and after (`tracy-site-tools` `look-undo.mjs`). One is undone when a `look.revert` of
 *            that id was recorded after it (the agent's, or a turn undo's own), or the host says the
 *            entry was put back (tracy-host `site-look-css` job, `check`). Its undo writes the
 *            before back only while the site holds the after (`undo`, compare and set).
 */

/** Reason codes, in the order the client shows them: the first one is the one it says. */
export const REASON_ORDER = Object.freeze([
  'TURN_OPEN',
  'NO_UNDO_ON_EMDASH',
  'MISSING_TOOLSET',
  'RESTORED_AFTER',
  'CONTENT_CHANGED_AFTER',
  'LOOK_CHANGED_AFTER',
  'FILES_CHANGED_AFTER',
  'SHARED_CHANGE',
  'NOT_RECORDED',
  'LATER_TURN_BLOCKED'
])

/** An `open` turn older than this is stale (`turns.js` `STALE_AFTER_MS`): it no longer holds the site. */
export const OPEN_TURN_HOLDS_MS = 30 * 60_000

/** Writes of these vias change the site's content; `file-look`/`look-revert` are files, in Git. */
const CONTENT_VIAS = new Set(['apply', 'emdash-mcp'])
/** A WordPress look write: the site's Additional CSS, with its look undo id (`look-css` above). */
const LOOK_VIA = 'look-css'
/** The `target.kind` a `look-css` write names (`tracy-site-tools` `LOOK_CSS_TARGET_KIND`). */
export const LOOK_TARGET_KIND = 'additional-css'
/** A look undo id: six hex digits (`look-undo.mjs` `UNDO_ID`). */
export const LOOK_UNDO_ID = /^[0-9a-f]{6}$/
/** Restores that count after a turn: an operation that may have moved the site. */
const RESTORE_LIVE = new Set(['succeeded', 'pending', 'unknown'])
/** The door's codes for a site that went silent mid-call: the write may have landed (#802). */
const SILENCE_CODES = new Set(['COMPONENT_UNREACHABLE', 'COMPONENT_BAD_RESPONSE'])

const ms = (value) => {
  if (value === null || value === undefined) return null
  const t =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(t) ? t : null
}
const iso = (value) => {
  const t = ms(value)
  return t === null ? null : new Date(t).toISOString()
}
/** Two sha spellings name one commit when one is a prefix of the other (`operations.js` `sameCommit`). */
const sameSha = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a !== '' && b !== ''
    ? a.length <= b.length
      ? b.startsWith(a)
      : a.startsWith(b)
    : false

/** The look undo id a `look-css` write names, or null. */
const lookIdOf = (w) =>
  w?.target?.kind === LOOK_TARGET_KIND && typeof w.target.id === 'string' && LOOK_UNDO_ID.test(w.target.id)
    ? w.target.id
    : null

/**
 * Reasons sorted by {@link REASON_ORDER}; a code it does not know goes last, order kept.
 * @param {Array<{ code: string }>} reasons
 */
export function sortReasons(reasons) {
  const rank = (code) => {
    const at = REASON_ORDER.indexOf(code)
    return at === -1 ? REASON_ORDER.length : at
  }
  return [...reasons].sort((a, b) => rank(a.code) - rank(b.code))
}

/**
 * The `{kind, id, title}` a write names, from its `site_write.target` (names only, never values).
 * `title` only when the write's own record kept one (EmDash's report does, and an Apply write the dsh
 * host labelled with `x-tracy-write-title`), else null — never looked up.
 * @param {unknown} target
 */
export function targetOf(target) {
  if (!target || typeof target !== 'object') return null
  const t = /** @type {{ kind?: unknown, id?: unknown, title?: unknown, front?: unknown }} */ (target)
  if (typeof t.kind !== 'string' && typeof t.id !== 'string') return null
  return {
    kind: typeof t.kind === 'string' ? t.kind : null,
    id: typeof t.id === 'string' ? t.id : null,
    title: typeof t.title === 'string' && t.title.trim() !== '' ? t.title : null,
    // The site's static front page (#257): the card says "the home page", whatever its title.
    ...(t.front === true ? { front: true } : {})
  }
}

/**
 * Pair each `site_write` row with the `audit` row its statement wrote (same turn, action and
 * instant: one `insert … with` statement, one `now()`), to read the `apply_id` only `audit` keeps.
 * `recordApply` rewrites the write's action to `content.create` when the apply created a row (so
 * Site changes shows a create), while its audit row keeps `content.update`; the key undoes that
 * rename for `via: 'apply'` writes only, so the pair still matches and the action stays in the key.
 * @param {any[]} writes - `site_write` rows
 * @param {any[]} audits - `audit` rows `{at, action, detail}`
 * @returns {Map<any, any>} write row → its audit row
 */
export function pairWrites(writes, audits) {
  /** @type {Map<string, any[]>} */
  const queue = new Map()
  const key = (turnId, action, at) => `${turnId ?? ''}|${action}|${ms(at)}`
  const auditActionOf = (w) =>
    w.via === 'apply' && w.action === 'content.create' ? 'content.update' : w.action
  for (const row of audits) {
    const k = key(row.detail?.turnId ?? null, row.action, row.at)
    const list = queue.get(k) ?? []
    list.push(row)
    queue.set(k, list)
  }
  const paired = new Map()
  for (const w of writes) {
    const hit = queue.get(key(w.turn_id ?? null, auditActionOf(w), w.at))?.shift()
    if (hit) paired.set(w, hit)
  }
  return paired
}

/**
 * The view `GET /turns` answers, from facts already read. Pure.
 *
 * @param {{
 *   platform: string | null,
 *   now: number,
 *   viewer: { email: string, seesAll: boolean },   // seesAll: an owner or editor (ADR 0028)
 *   toolsets: { code?: boolean, content?: boolean },
 *   turns: any[],          // site_turn rows of the session (every actor), any order
 *   openTurns: any[],      // site_turn rows `open` on the site (any session)
 *   moments: { turns: Record<string, Array<{ sha: string, at?: number, files?: string[] }>>, truncated?: boolean } | null,
 *   writes: any[],         // site_write rows of the session's turns
 *   audits: any[],         // audit rows: the session's turn writes, and `apply.revert` rows since
 *   laterWrites: any[],    // site_write rows on the site since the session's first turn (any session)
 *   laterCms: any[],       // site_cms_change rows since then, each with `origin` (`classifyCmsChange`)
 *   operations: any[],     // site_operation rows since then
 *   sharedAudits?: any[],  // audit rows of writes (any turn, any session) carrying an apply_id of the session's turns
 *   check: { commits?: any[], conflict?: { sha: string, code: string, files?: string[] } | null } | null,
 *   looks?: { entries: Record<string, { before: string, after: string, now: string, reverted: boolean } | { unknown: true }> } | null
 *                          // the host's `site-look-css` check of the session's look ids; null: not read
 * }} facts
 */
export function turnsView(facts) {
  const now = facts.now
  const ordered = [...facts.turns].sort((a, b) => a.turn - b.turn)
  const paired = pairWrites(facts.writes, facts.audits)
  const reverts = facts.audits.filter((a) => a.action === 'apply.revert' && a.detail?.ok === true)
  // Every `look.revert` recorded on the site since the session began (any turn, any conversation, a
  // turn undo's own): id → the newest time.
  /** @type {Map<string, number>} */
  const lookReverts = new Map()
  for (const w of [...facts.writes, ...facts.laterWrites]) {
    const id =
      w.via === LOOK_VIA && w.action === 'look.revert' && w.outcome !== 'refused' ? lookIdOf(w) : null
    if (id !== null) lookReverts.set(id, Math.max(lookReverts.get(id) ?? 0, ms(w.at) ?? 0))
  }
  const lookEntry = (id) => facts.looks?.entries?.[id] ?? null

  // ── what each turn changed, and what of it is still on the site ──
  const parts = new Map()
  for (const t of ordered) {
    const commits = (facts.moments?.turns?.[t.turn_id] ?? []).map((c) => ({
      sha: c.sha,
      files: Array.isArray(c.files) ? c.files : []
    }))
    const undoneSha = (sha) =>
      facts.operations.some(
        (op) => op.action === 'undo' && op.status === 'succeeded' && sameSha(op.target_sha, sha)
      )
    const pendingCommits = commits.filter((c) => !undoneSha(c.sha)).map((c) => c.sha)
    const own = facts.writes.filter(
      (w) =>
        w.turn_id === t.turn_id &&
        CONTENT_VIAS.has(w.via) &&
        w.outcome !== 'refused' &&
        !String(w.action).startsWith('apply.')
    )
    const notRecorded = []
    // Files committed with no commit found: a moment without its trailer (an older dsh), or one
    // sealed as outside. Only when the walk was complete — a cut walk proves nothing.
    if (
      (Number(t.files) > 0 || t.head_sha) &&
      commits.length === 0 &&
      facts.moments &&
      !facts.moments.truncated
    )
      notRecorded.push({ code: 'NOT_RECORDED', part: 'files' })
    /** @type {Map<string, { applyId: string, last: number }>} */
    const applies = new Map()
    const content = []
    let missingId = false
    for (const w of own) {
      const applyId = paired.get(w)?.detail?.apply_id
      if (typeof applyId !== 'string' || applyId === '') {
        missingId = true
        continue
      }
      const at = ms(w.at) ?? 0
      const seen = applies.get(applyId)
      applies.set(applyId, { applyId, last: Math.max(seen?.last ?? 0, at) })
      const target = targetOf(w.target)
      if (!content.some((c) => c.applyId === applyId && sameTarget(c.target, target)))
        content.push({ applyId, action: w.action, target, at: iso(w.at) })
    }
    if (missingId) notRecorded.push({ code: 'NOT_RECORDED', part: 'content' })
    // Its WordPress look writes (a `look.revert` is not a change of its own, as an `apply.revert` is not).
    const lookWrites = facts.writes.filter(
      (w) =>
        w.turn_id === t.turn_id && w.via === LOOK_VIA && w.outcome !== 'refused' && w.action !== 'look.revert'
    )
    /** @type {Array<{ undo: string, at: string | null, ms: number }>} */
    const looks = []
    for (const w of lookWrites) {
      const undo = lookIdOf(w)
      if (undo === null) notRecorded.push({ code: 'NOT_RECORDED', part: 'look' })
      else if (!looks.some((l) => l.undo === undo)) looks.push({ undo, at: iso(w.at), ms: ms(w.at) ?? 0 })
    }
    const lookBack = (l) => (lookReverts.get(l.undo) ?? -1) >= l.ms || lookEntry(l.undo)?.reverted === true
    const pendingLooks = looks
      .filter((l) => !lookBack(l))
      .sort((a, b) => b.ms - a.ms)
      .map((l) => l.undo)
    const reverted = (a) => reverts.some((r) => r.detail?.apply_id === a.applyId && (ms(r.at) ?? 0) >= a.last)
    // 🔒 NEWEST FIRST, AND A TIE GOES TO THE LATER WRITE: since 26/10/2026 each agent write has an apply id
    // of its own, so one turn holds many, and two written within one clock tick still undo in reverse.
    const pendingApplies = [...applies.values()]
      .map((a, order) => ({ a, order }))
      .filter(({ a }) => !reverted(a))
      .sort((x, y) => y.a.last - x.a.last || y.order - x.order)
      .map(({ a }) => a.applyId)
    const changed = commits.length > 0 || Number(t.files) > 0 || own.length > 0 || lookWrites.length > 0
    const lastWrite = [...own, ...lookWrites].reduce((m, w) => Math.max(m, ms(w.at) ?? 0), 0)
    parts.set(t.turn_id, {
      turn: t,
      commits,
      pendingCommits,
      applyIds: [...applies.keys()],
      pendingApplies,
      content,
      looks: looks.map((l) => ({ undo: l.undo, at: l.at })),
      lookMs: new Map(looks.map((l) => [l.undo, l.ms])),
      pendingLooks,
      notRecorded,
      changed,
      pending:
        changed &&
        (pendingCommits.length > 0 ||
          pendingApplies.length > 0 ||
          pendingLooks.length > 0 ||
          notRecorded.length > 0),
      ended: ms(t.closed_at) ?? (lastWrite || ms(t.opened_at) || 0)
    })
  }

  // ── the site right now ──
  const busy = facts.openTurns
    .filter((t) => t.state === 'open' && (ms(t.opened_at) ?? 0) > now - OPEN_TURN_HOLDS_MS)
    .sort((a, b) => (ms(b.opened_at) ?? 0) - (ms(a.opened_at) ?? 0))[0]
  const pendingTurns = ordered.filter((t) => parts.get(t.turn_id).pending)
  const latestId = pendingTurns.at(-1)?.turn_id ?? null

  // ── the reasons of each turn on its own (not counting later turns) ──
  const conflict = facts.check?.conflict ?? null
  const own = new Map()
  for (const t of pendingTurns) {
    const p = parts.get(t.turn_id)
    const chain = ordered.filter((u) => u.turn >= t.turn)
    const chainIds = new Set(chain.map((u) => u.turn_id))
    const chainCommits = chain.flatMap((u) => parts.get(u.turn_id).commits.map((c) => c.sha))
    const chainApplies = new Set(chain.flatMap((u) => parts.get(u.turn_id).applyIds))
    const from = p.ended
    const reasons = []
    if (facts.platform === 'emdash') reasons.push({ code: 'NO_UNDO_ON_EMDASH' })
    // Restores after the turn, other than undos of this turn's or a later turn's own moments.
    const restore = facts.operations
      .filter((op) => RESTORE_LIVE.has(op.status) && (ms(op.created_at) ?? 0) > from)
      .filter(
        (op) =>
          !(
            op.action === 'undo' &&
            op.status === 'succeeded' &&
            chainCommits.some((sha) => sameSha(op.target_sha, sha))
          )
      )
      .sort((a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0))[0]
    if (restore) reasons.push({ code: 'RESTORED_AFTER', at: iso(restore.created_at), action: restore.action })
    const changedAfter = laterContentChange(facts, paired, { from, chainIds, chainApplies })
    if (changedAfter) reasons.push({ code: 'CONTENT_CHANGED_AFTER', ...changedAfter })
    const lookAfter = laterLookChange(facts, parts, chain, { from, chainIds, lookEntry })
    if (lookAfter) reasons.push(lookAfter)
    if (
      conflict &&
      conflict.code === 'CONFLICT' &&
      p.pendingCommits.some((sha) => sameSha(conflict.sha, sha))
    )
      reasons.push({
        code: 'FILES_CHANGED_AFTER',
        files: Array.isArray(conflict.files) ? conflict.files : []
      })
    // A moment the host would refuse to undo at all (not an agent's): nothing recorded we can undo.
    if (
      conflict &&
      conflict.code === 'NOT_UNDOABLE' &&
      p.pendingCommits.some((sha) => sameSha(conflict.sha, sha))
    )
      reasons.push({ code: 'NOT_RECORDED', part: 'files' })
    reasons.push(...sharedChange(facts, parts, pendingTurns, t, chainIds))
    reasons.push(...p.notRecorded)
    own.set(t.turn_id, reasons)
  }

  // ── each turn as the card reads it ──
  const view = []
  for (const t of ordered) {
    if (!facts.viewer.seesAll && t.actor !== facts.viewer.email) continue
    const p = parts.get(t.turn_id)
    const chain = pendingTurns.filter((u) => u.turn >= t.turn)
    // A look is changed only in a mode with a shell (`look.set`), the code toolset's: so is its undo.
    const needs = {
      code: chain.some(
        (u) => parts.get(u.turn_id).pendingCommits.length > 0 || parts.get(u.turn_id).pendingLooks.length > 0
      ),
      content: chain.some((u) => parts.get(u.turn_id).pendingApplies.length > 0)
    }
    /** @type {{ state: string, latest: boolean, reasons: any[], needs: { code: boolean, content: boolean } }} */
    let undo
    if (!p.changed) undo = { state: 'none', latest: false, reasons: [], needs }
    else if (!p.pending) undo = { state: 'undone', latest: false, reasons: [], needs }
    else {
      const reasons = [...own.get(t.turn_id)]
      if (busy) reasons.push({ code: 'TURN_OPEN', by: busy.actor ?? null })
      if (needs.code && !facts.toolsets.code) reasons.push({ code: 'MISSING_TOOLSET', toolset: 'code' })
      if (needs.content && !facts.toolsets.content)
        reasons.push({ code: 'MISSING_TOOLSET', toolset: 'content' })
      // A later turn's SHARED_CHANGE is judged again on this turn's own, larger undo set (above):
      // going back further may take the other half of the shared change with it.
      const blocking = (u) => own.get(u.turn_id).filter((r) => r.code !== 'SHARED_CHANGE')
      const later = chain.find((u) => u.turn > t.turn && blocking(u).length > 0)
      if (later)
        reasons.push({
          code: 'LATER_TURN_BLOCKED',
          turnId: later.turn_id,
          blockedBy: sortReasons(blocking(later))[0].code
        })
      const sorted = sortReasons(reasons)
      undo = {
        state: sorted.length > 0 ? 'blocked' : 'available',
        latest: t.turn_id === latestId,
        reasons: sorted,
        needs
      }
    }
    const paths = new Set(p.commits.flatMap((c) => c.files))
    view.push({
      turnId: t.turn_id,
      turn: t.turn,
      title: t.title,
      openedAt: iso(t.opened_at),
      closedAt: iso(t.closed_at),
      changed: p.changed,
      files: {
        count: paths.size || (p.commits.length === 0 ? Number(t.files) || 0 : 0),
        commits: p.commits.map((c) => c.sha),
        zones: zonesOf(facts.check, p.commits)
      },
      content: p.content,
      look: p.looks.map((l) => ({ undo: l.undo, at: l.at })),
      undo
    })
  }
  return { cms: facts.platform ?? null, siteBusy: Boolean(busy), turns: view, parts, pendingTurns }
}

/**
 * SHARED_CHANGE for undoing `t` and every later turn of the session (the undo set): a change part of
 * which lies outside the set, so undoing the set would take that part too, or leave it half done.
 *   - `apply-id`: an `apply.revert` reverts every write under its id, and an id of the set also has
 *     successful writes in a turn outside it (any conversation; a write naming no turn counts too).
 *   - `concurrent` / `unsealed`: a turn of the set that left file moments was open while another
 *     conversation's turn was (`site_turn.concurrent`), or began without its opening seal
 *     (`unsealed_start`): its moments may hold files someone else changed.
 */
function sharedChange(facts, parts, pendingTurns, t, chainIds) {
  const set = pendingTurns.filter((u) => u.turn >= t.turn)
  const ids = new Set(set.flatMap((u) => parts.get(u.turn_id).pendingApplies))
  const reasons = []
  const outside = (facts.sharedAudits ?? []).find(
    (a) =>
      a.detail?.ok === true &&
      !String(a.action).startsWith('apply.') &&
      ids.has(a.detail?.apply_id) &&
      !chainIds.has(a.detail?.turnId ?? '')
  )
  if (outside)
    reasons.push({
      code: 'SHARED_CHANGE',
      cause: 'apply-id',
      ...(typeof outside.detail?.turnId === 'string' ? { turnId: outside.detail.turnId } : {})
    })
  const mixed = set.find(
    (u) =>
      parts.get(u.turn_id).pendingCommits.length > 0 && (u.concurrent === true || u.unsealed_start === true)
  )
  if (mixed)
    reasons.push({
      code: 'SHARED_CHANGE',
      // The first turn of a whole-site build (`wo-demo-<action>:1`) laid the site down: there was no site to seal
      // before it, and nothing earlier to go back to — "built", not "not recorded in time" (local stand 24/10/2026).
      cause:
        mixed.concurrent === true
          ? 'concurrent'
          : /^wo-demo-[^:]+:1$/.test(String(mixed.turn_id))
            ? 'built'
            : 'unsealed',
      turnId: mixed.turn_id
    })
  return reasons
}

/** Two targets name the same record. */
function sameTarget(a, b) {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && a.id === b.id
}

/**
 * The zones of a turn's moments, summed from the host's `undo-check` answer; `{}` when it had none.
 * @param {any} check
 * @param {Array<{ sha: string }>} commits
 */
function zonesOf(check, commits) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const c of commits) {
    const read = (check?.commits ?? []).find((r) => sameSha(r.sha, c.sha))
    for (const [zone, n] of Object.entries(read?.zones ?? {}))
      if (Number.isInteger(n)) out[zone] = (out[zone] ?? 0) + n
  }
  return out
}

/**
 * The newest content change on the site after `from` that is not this run's own: a Tracy write of
 * another session or of an earlier turn (a later turn of this session is part of the run), or an
 * edit in the CMS admin (`site_cms_change` whose Source is not `automatic`). A revert of an id the
 * run owns is part of the run too. Null when there is none.
 */
function laterContentChange(facts, paired, { from, chainIds, chainApplies }) {
  /** @type {Array<{ at: number, via: string, by: string | null, target: any }>} */
  const found = []
  const revertIds = new Map()
  for (const a of facts.audits)
    if (a.action === 'apply.revert')
      revertIds.set(`${a.detail?.turnId ?? ''}|${ms(a.at)}`, a.detail?.apply_id)
  for (const w of facts.laterWrites) {
    const at = ms(w.at) ?? 0
    if (at <= from || w.outcome === 'refused' || !CONTENT_VIAS.has(w.via)) continue
    if (w.turn_id && chainIds.has(w.turn_id)) continue
    if (w.action === 'apply.revert') {
      const id = paired.get(w)?.detail?.apply_id ?? revertIds.get(`${w.turn_id ?? ''}|${at}`)
      if (typeof id === 'string' && chainApplies.has(id)) continue
    }
    found.push({ at, via: 'tracy', by: w.actor ?? null, target: targetOf(w.target) })
  }
  for (const c of facts.laterCms) {
    const at = ms(c.occurred_at) ?? 0
    if (at <= from || c.origin?.source === 'automatic') continue
    found.push({
      at,
      via: 'cms-admin',
      by: typeof c.cms_actor?.name === 'string' ? c.cms_actor.name : null,
      target:
        c.resource_type || c.resource_id
          ? { kind: c.resource_type ?? null, id: c.resource_id ?? null, title: c.resource_title ?? null }
          : null
    })
  }
  const newest = found.sort((a, b) => b.at - a.at)[0]
  return newest ? { via: newest.via, by: newest.by, at: iso(newest.at), target: newest.target } : null
}

/**
 * LOOK_CHANGED_AFTER for undoing `t` and every later turn of the session (`chain`), when the run
 * holds WordPress look writes still on the site: something else changed the site's Additional CSS
 * after them, so writing their before back would throw that change away (the host's compare and
 * set would refuse it anyway, after the run's earlier steps had already gone).
 *   - `via: 'tracy'`: a look write recorded after the turn that is not the run's own (another
 *     conversation's, or a `look.revert` of a look outside the run), newest first.
 *   - `via: 'outside'`: the host's check: walking the run's looks newest first, each must find the
 *     Additional CSS its write left (`after`) — the site's now for the newest, the next one's
 *     `before` after that. A mismatch is an edit no record names (the Customizer, a plugin).
 * `NOT_RECORDED` (part `look`) when the host no longer keeps a look's undo entry (pruned, or its
 * write did not finish). Null when nothing stands in the way, or the run has no look to put back.
 */
function laterLookChange(facts, parts, chain, { from, chainIds, lookEntry }) {
  const pending = chain.flatMap((u) => {
    const p = parts.get(u.turn_id)
    return p.pendingLooks.map((undo) => ({ undo, at: p.lookMs.get(undo) ?? 0 }))
  })
  if (pending.length === 0) return null
  const chainLooks = new Set(chain.flatMap((u) => parts.get(u.turn_id).looks.map((l) => l.undo)))
  const later = facts.laterWrites
    .filter(
      (w) =>
        w.via === LOOK_VIA &&
        w.outcome !== 'refused' &&
        (ms(w.at) ?? 0) > from &&
        !(w.turn_id && chainIds.has(w.turn_id)) &&
        !(w.action === 'look.revert' && chainLooks.has(lookIdOf(w) ?? ''))
    )
    .sort((a, b) => (ms(b.at) ?? 0) - (ms(a.at) ?? 0))[0]
  if (later) return { code: 'LOOK_CHANGED_AFTER', via: 'tracy', by: later.actor ?? null, at: iso(later.at) }
  if (!facts.looks) return null
  let expected = null
  for (const look of pending.sort((a, b) => b.at - a.at)) {
    const entry = lookEntry(look.undo)
    if (entry === null || entry.unknown === true) return { code: 'NOT_RECORDED', part: 'look' }
    if ((expected ?? entry.now) !== entry.after) return { code: 'LOOK_CHANGED_AFTER', via: 'outside' }
    expected = entry.before
  }
  return null
}

/**
 * What `POST /turns/undo` will do for `turnId` and `scope`, from a fresh {@link turnsView}: the
 * turns to undo, newest first, each with its moments and apply ids newest first — or why not.
 *
 * @param {ReturnType<typeof turnsView>} view
 * @param {string} turnId
 * @param {'turn' | 'from-here'} scope
 * @returns {{ error: { status: number, code: string, [k: string]: unknown } } | { steps: Array<{ turnId: string, commits: string[], applyIds: string[], looks: string[] }> }}
 */
export function undoPlan(view, turnId, scope) {
  const row = view.turns.find((t) => t.turnId === turnId)
  if (!row) return { error: { status: 404, code: 'TURN_UNKNOWN' } }
  if (row.undo.state === 'none' || row.undo.state === 'undone')
    return { error: { status: 409, code: 'NOTHING_TO_UNDO', state: row.undo.state } }
  if (scope === 'turn' && !row.undo.latest) return { error: { status: 409, code: 'NOT_LATEST' } }
  const missing = row.undo.reasons.find((r) => r.code === 'MISSING_TOOLSET')
  if (missing) return { error: { status: 403, code: 'FORBIDDEN_WRITE', toolset: missing.toolset } }
  if (row.undo.state === 'blocked')
    return { error: { status: 409, code: 'BLOCKED', reasons: row.undo.reasons } }
  const steps = view.pendingTurns
    .filter((t) => t.turn >= row.turn)
    .sort((a, b) => b.turn - a.turn)
    .map((t) => {
      const p = view.parts.get(t.turn_id)
      return {
        turnId: t.turn_id,
        commits: [...p.pendingCommits],
        applyIds: [...p.pendingApplies],
        looks: [...p.pendingLooks]
      }
    })
  return { steps }
}

/**
 * The shas `undo-check` must walk for a session: every moment still on the site, newest turn
 * first, each turn's moments newest first (as `turn-moments` lists them).
 * @param {{ turns: any[], moments: any, operations: any[] }} facts
 */
export function shasToCheck(facts) {
  const ordered = [...facts.turns].sort((a, b) => b.turn - a.turn)
  const out = []
  for (const t of ordered)
    for (const c of facts.moments?.turns?.[t.turn_id] ?? [])
      if (
        !facts.operations.some(
          (op) => op.action === 'undo' && op.status === 'succeeded' && sameSha(op.target_sha, c.sha)
        ) &&
        !out.includes(c.sha)
      )
        out.push(c.sha)
  return out
}

/**
 * The look undo ids the host's `site-look-css` check must read for a session: every WordPress look
 * write of its turns, newest first, at most `max` (the host's own limit).
 * @param {any[]} writes - `site_write` rows of the session's turns
 * @param {number} [max]
 */
export function looksToCheck(writes, max = 50) {
  const out = []
  for (const w of [...writes].sort((a, b) => (ms(b.at) ?? 0) - (ms(a.at) ?? 0))) {
    const id =
      w.via === LOOK_VIA && w.outcome !== 'refused' && w.action !== 'look.revert' ? lookIdOf(w) : null
    if (id !== null && !out.includes(id)) out.push(id)
  }
  return out.slice(0, max)
}

/**
 * What one look's undo through the host's `site-look-css` job came to, from `runSiteJob`'s answer.
 * Only `ok: true` is undone. A clean refusal that wrote nothing (the site's Additional CSS changed
 * since, the entry gone or already used) is `failed`; a job that did not answer, or answered
 * unreadably, may have written: `unsure`.
 * @param {{ ok: true, output: unknown } | { ok: false, reason?: string }} job
 * @param {(output: unknown) => any} read - `jobAnswer`
 * @returns {{ status: 'undone' | 'failed' | 'unsure', code?: string }}
 */
export function lookOutcome(job, read) {
  if (!job.ok)
    return { status: 'unsure', code: job.reason === 'timeout' ? 'FLEET_JOB_PENDING' : 'FLEET_JOB_FAILED' }
  const data = read(job.output)
  if (data?.ok === true) return { status: 'undone' }
  if (data?.ok === false && typeof data.code === 'string') return { status: 'failed', code: data.code }
  return { status: 'unsure', code: 'FLEET_ANSWERED_UNREADABLY' }
}

/**
 * What one `apply.revert` through the Apply door came to — `revertAll`'s rule (#802, client
 * `interrupted.mjs`), on the door's own `{status, body}`: only `ok: true` is a revert, and silence is
 * not a refusal.
 * @param {{ status: number, body: unknown } | { thrown: true }} answer
 * @returns {{ outcome: 'reverted' } | { outcome: 'failed' | 'unsure', code: string }}
 */
export function revertOutcome(answer) {
  if ('thrown' in answer) return { outcome: 'unsure', code: 'UNREACHABLE' }
  const read = answer.body
  const body =
    typeof read === 'object' && read !== null && !Array.isArray(read) ? /** @type {any} */ (read) : null
  const okStatus = answer.status >= 200 && answer.status < 300
  const said =
    typeof body?.code === 'string' && body.code !== ''
      ? body.code
      : typeof body?.error?.code === 'string' && body.error.code !== ''
        ? body.error.code
        : null
  if (okStatus && body?.ok === true) return { outcome: 'reverted' }
  if (okStatus && body?.ok !== false && said === null) return { outcome: 'unsure', code: 'OUTCOME_UNKNOWN' }
  if (said !== null) return { outcome: SILENCE_CODES.has(said) ? 'unsure' : 'failed', code: said }
  const known = body?.ok === false || answer.status < 500
  return { outcome: known ? 'failed' : 'unsure', code: `HTTP_${answer.status}` }
}

/**
 * What one moment's undo through `restoreMoment` came to, from its `{status, body}`. Only a verified
 * restore commit (`status: 'succeeded'`) is undone. A clean refusal (CONFLICT, NOT_UNDOABLE, a
 * refused toolset or key, a job the host failed) is `failed`; anything that may have run — an
 * operation `pending`/`unknown`, an answer that could not be read, a run that made no restore
 * commit (`succeeded_noop`) — is `unsure`.
 * @param {{ status: number, body: any }} answer
 * @returns {{ status: 'undone' | 'failed' | 'unsure', code?: string, operationId: string | null }}
 */
export function fileOutcome(answer) {
  const body = answer.body ?? {}
  const operationId = typeof body.operationId === 'string' ? body.operationId : null
  if (answer.status === 200 && body.ok === true && body.status === 'succeeded')
    return { status: 'undone', operationId }
  const code =
    typeof body.code === 'string'
      ? body.code
      : body.status === 'succeeded_noop'
        ? 'SUCCEEDED_NOOP'
        : `HTTP_${answer.status}`
  const mayHaveRun =
    body.status === 'pending' ||
    body.status === 'unknown' ||
    body.status === 'succeeded_noop' ||
    code === 'FLEET_ANSWERED_UNREADABLY' ||
    answer.status === 202
  return { status: mayHaveRun ? 'unsure' : 'failed', code, operationId }
}

/**
 * Run a plan: turns newest first; in each, its moments (newest first), then its content (newest
 * first), then its WordPress looks (newest first). Stops at the first step that did not verifiably
 * succeed — nothing older is touched.
 *
 * @param {Array<{ turnId: string, commits: string[], applyIds: string[], looks?: string[] }>} steps
 * @param {{
 *   undoCommit: (sha: string) => Promise<{ status: 'undone' | 'failed' | 'unsure', code?: string, operationId?: string | null }>,
 *   revertApply: (applyId: string) => Promise<ReturnType<typeof revertOutcome>>,
 *   undoLook?: (undo: string) => Promise<ReturnType<typeof lookOutcome>>
 * }} deps
 */
export async function runUndo(steps, { undoCommit, revertApply, undoLook }) {
  const turns = []
  let stopped = false
  for (const step of steps) {
    if (stopped) break
    /** @type {{ status: string, code?: string, operationIds: string[] }} */
    const files = { status: step.commits.length ? 'undone' : 'none', operationIds: [] }
    const content = { reverted: [], failed: [], unsure: [] }
    const look = { undone: [], failed: [], unsure: [] }
    for (const sha of step.commits) {
      const done = await undoCommit(sha)
      if (done.operationId) files.operationIds.push(done.operationId)
      if (done.status !== 'undone') {
        files.status = done.status
        if (done.code) files.code = done.code
        stopped = true
        break
      }
    }
    if (!stopped)
      for (const applyId of step.applyIds) {
        const done = await revertApply(applyId)
        if (done.outcome === 'reverted') content.reverted.push(applyId)
        else {
          content[done.outcome].push({ applyId, code: done.code })
          stopped = true
          break
        }
      }
    if (!stopped)
      for (const undo of step.looks ?? []) {
        const done = undoLook
          ? await undoLook(undo)
          : { status: /** @type {const} */ ('failed'), code: 'LOOK_UNDO_UNAVAILABLE' }
        if (done.status === 'undone') look.undone.push(undo)
        else {
          look[done.status].push({ undo, ...(done.code ? { code: done.code } : {}) })
          stopped = true
          break
        }
      }
    turns.push({ turnId: step.turnId, files, content, look })
  }
  return { complete: !stopped && turns.length === steps.length, turns }
}

/**
 * Which turns of a press to stamp as undone (`markTurnsUndone`, migration 067), from the plan and
 * what `runUndo` came to. A turn is stamped when anything of it went, or may have gone: a moment
 * verifiably undone (`undoneShas`, counted by the caller's `undoCommit`), a moment or a revert left
 * `unsure`, or a content write reverted. `complete`: every moment undone and every write reverted.
 * `proven`: something of the turn verifiably went — a moment in `undoneShas`, a write reverted, a look
 * undone (or all of it: `complete`). Every mark tells the agent (`undone_at`); only a proven one marks
 * the Site changes row (`undo_proven_at`, migration 182), which is undone only by proof.
 * A turn the press never reached, or one that failed before changing anything, is not stamped.
 * @param {Array<{ turnId: string, commits: string[], applyIds: string[], looks?: string[] }>} steps
 * @param {Awaited<ReturnType<typeof runUndo>>} result
 * @param {ReadonlySet<string>} undoneShas
 * @returns {Array<{ turnId: string, complete: boolean, proven: boolean }>}
 */
export function undoneMarks(steps, result, undoneShas) {
  const marks = []
  for (const done of result.turns) {
    const step = steps.find((s) => s.turnId === done.turnId)
    if (!step) continue
    const filesGone = step.commits.filter((sha) => undoneShas.has(sha)).length
    const look = done.look ?? { undone: [], failed: [], unsure: [] }
    const complete =
      filesGone === step.commits.length &&
      done.content.failed.length === 0 &&
      done.content.unsure.length === 0 &&
      done.content.reverted.length === step.applyIds.length &&
      look.failed.length === 0 &&
      look.unsure.length === 0 &&
      look.undone.length === (step.looks ?? []).length
    const proven = complete || filesGone > 0 || done.content.reverted.length > 0 || look.undone.length > 0
    const touched =
      proven || done.files.status === 'unsure' || done.content.unsure.length > 0 || look.unsure.length > 0
    if (touched) marks.push({ turnId: done.turnId, complete, proven })
  }
  return marks
}
