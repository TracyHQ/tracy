/** Build behavior is earned by the current turn's server answer, never inherited from its conversation. */
const CLOSED = new Set(['AGENT_DEMO_NOT_GRANTED', 'AGENT_DEMO_ACTION_CLOSED', 'AGENT_DEMO_TURN_NOT_BOUND'])

export function createBuildTurns(most = 500) {
  const entries = new Map()
  /** @param {string} session @param {unknown} turn */
  const state = (session, turn) => {
    const entry = entries.get(session)
    return turn !== null && turn !== undefined && entry?.turn === turn ? entry.state : null
  }
  return {
    state,
    /** @param {string} session @param {unknown} turn @param {any} answer @param {unknown} currentTurn @param {number} [now] @param {boolean} [checkedPlan] */
    observe(session, turn, answer, currentTurn, now = Date.now(), checkedPlan = false) {
      // The request's identity was captured before await; old replies cannot assign or revoke a newer turn.
      if (turn === null || turn === undefined || turn !== currentTurn) return
      // A terminal refusal blocks late grants, but a later closed-action answer may tighten the fence.
      if (
        entries.get(session)?.turn === turn &&
        entries.get(session)?.closed &&
        answer?.code !== 'AGENT_DEMO_ACTION_CLOSED'
      )
        return
      const previous = state(session, turn)
      const closed = CLOSED.has(answer?.code)
      const successful = answer?.ok === true && !closed
      const next = {
        closedBuild:
          previous?.closedBuild === true ||
          answer?.code === 'AGENT_DEMO_ACTION_CLOSED' ||
          (answer?.code === 'AGENT_DEMO_TURN_NOT_BOUND' && previous?.build === true),
        build: !closed && (successful || previous?.build === true),
        planned:
          !closed && (previous?.planned === true || (successful && typeof answer.planHash === 'string')),
        planCheckedAt: checkedPlan ? now : (previous?.planCheckedAt ?? null)
      }
      entries.delete(session)
      entries.set(session, { turn, state: next, closed })
      while (entries.size > most) entries.delete(entries.keys().next().value)
    }
  }
}
