/**
 * What the card under one chat turn shows, worked out from the turns door's answer (contract
 * `tasks/undo-change/api-contract.md`). Pure and React-free, so `test/turn-card.test.mjs` holds
 * every state Akemi approved (`plan-verified.html`, door d1): latest turn (Undo), older turn (Go
 * back to here), blocked (one sentence from `reasons[0]` and Ask Tracy to revert), Tracy working,
 * missing role, EmDash, undone, and no card at all.
 *
 * The card's decision and its words (`cardOf`, `whatOf`, `reasonWords`, …) live in
 * `@tracy/core/turn-undo` since 06/10/2026, because the Site changes row of the same turn offers
 * the same undo (plan PR 2): re-exported here so this package reads them where it always did. What
 * stays is the chat's own part: Ask Tracy to revert from the card, and Continue after a cut turn.
 */

export { cardOf, laterTurns, reasonWords, targetText, whatOf } from '@tracy/core/turn-undo'

/**
 * @typedef {import('@tracy/core/turn-undo').Turn} Turn
 * @typedef {import('@tracy/core/turn-undo').TurnsAnswer} TurnsAnswer
 * @typedef {import('@tracy/core/turn-undo').Reason} Reason
 * @typedef {import('@tracy/core/turn-undo').Target} Target
 * @typedef {import('@tracy/core/turn-undo').Card} Card
 * @typedef {import('./strings').StringKey} StringKey
 * @typedef {{ key: StringKey, params?: Record<string, string | number> }} Words
 */

/**
 * The Site changes row a chat turn would be, as far as `revert-prompt.ts` reads it, so "Ask Tracy to
 * revert" sends the same message from the chat as from Site changes. Only what the turns door gave
 * is filled in; the rest is the empty value, never a guess.
 * @param {Turn} turn
 * @param {{ cms: string | null, sessionId: string }} ctx
 * @returns {import('../../../../core/tracy-core/src/site-tabs/api').ActivityItemV2}
 */
export function askItemOf(turn, { cms, sessionId }) {
  /** @type {Map<string, { type: string | null, id: string, title: string | null, ops: string[] }>} */
  const resources = new Map()
  let unnamed = 0
  for (const write of turn.content) {
    const op = write.action.includes('.')
      ? write.action.slice(write.action.lastIndexOf('.') + 1)
      : write.action
    if (write.target === null || write.target.id === null) {
      unnamed += 1
      continue
    }
    const key = `${write.target.kind ?? ''}:${write.target.id}`
    const seen = resources.get(key)
    if (seen) {
      if (op !== '' && !seen.ops.includes(op)) seen.ops.push(op)
    } else
      resources.set(key, {
        type: write.target.kind,
        id: write.target.id,
        title: write.target.title,
        ops: op === '' ? [] : [op]
      })
  }
  const platform = cms === 'wordpress' || cms === 'joomla' || cms === 'emdash' ? cms : undefined
  const sha = turn.files.commits[0] ?? null
  /** @type {'recorded' | 'not-tracked' | 'not-linked'} */
  const filesState = turn.files.count > 0 ? 'recorded' : platform === 'emdash' ? 'not-tracked' : 'not-linked'
  return {
    id: turn.turnId,
    kind: 'turn',
    origin: { source: 'chat', evidence: 'confirmed', ...(platform ? { cms: platform } : {}) },
    actor: { type: 'system', name: 'Tracy', role: 'executor' },
    description: { key: 'request', params: {}, isRequestOnly: false },
    occurredAt: turn.closedAt ?? turn.openedAt,
    detectedAt: null,
    timeBasis: 'occurred',
    effects: {
      content: { resources: [...resources.values()], operations: unnamed },
      settings: { resources: [], operations: 0 },
      files: {
        count: turn.files.count > 0 ? turn.files.count : null,
        sha: turn.files.count > 0 ? sha : null,
        state: filesState
      },
      other: { operations: 0, actions: [] },
      coverage: { files: filesState, content: 'recorded' }
    },
    request: turn.title === null ? { state: 'none' } : { text: turn.title, state: 'full' },
    reversal: { state: 'none' },
    capabilities: { canDiff: false, canUndoFiles: false, reasons: [] },
    evidence: { turnId: turn.turnId, ...(sha !== null && turn.files.count > 0 ? { commitSha: sha } : {}) },
    reply: null,
    conversation: { sessionId, turn: turn.turn, promptMessageId: null, mine: true }
  }
}

/** How long the request may be inside "Revert “…”" before it is cut. */
const ASK_WHAT_MAX = 60

/**
 * The words inside the person's sentence of an Ask Tracy to revert message: the request, cut.
 * @param {Turn} turn
 * @returns {string | null} null when the turn kept no request text.
 */
export function askWhatOf(turn) {
  if (turn.title === null) return null
  const flat = turn.title.replace(/\s+/g, ' ').trim()
  return flat.length > ASK_WHAT_MAX ? `${flat.slice(0, ASK_WHAT_MAX - 1).trimEnd()}…` : flat
}

/** How many changes Continue names by id; the rest are counted. */
const CONTINUE_REFS = 6

/**
 * What Continue asks the agent after an interrupted turn (#295), in the words of `interrupted.mjs`
 * `continueMessage`: what is still on the site, by apply id and commit, or that it was all undone.
 * @param {Turn} turn
 * @returns {Words}
 */
export function continueWords(turn) {
  // 🔒 EACH ONCE, THE LATEST FEW (local stand and dev 24/10/2026): a whole-site build interrupted at minute 25 sent
  // the person's own message as forty apply ids, most of them repeated. The agent reads the rest with `apply.list`.
  const all = [
    ...new Set([
      ...turn.content.map((c) => c.applyId),
      ...turn.files.commits.map((sha) => `commit ${sha.slice(0, 12)}`)
    ])
  ]
  const shown = all.slice(-CONTINUE_REFS)
  const refs =
    all.length > shown.length ? `${shown.join(', ')} … (+${all.length - shown.length})` : shown.join(', ')
  return turn.undo.state === 'undone'
    ? { key: 'interrupted.continueUndone', params: { undone: refs } }
    : { key: 'interrupted.continueMessage', params: { applied: refs } }
}
