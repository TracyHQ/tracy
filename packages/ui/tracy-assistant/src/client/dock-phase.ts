/**
 * Whether the Help strip above the chat box has the start screen to itself, or the transcript is
 * already drawing the same rows.
 *
 * dsh draws no transcript while `session.blank && conversationPhase(session, conversation) === 'blank'`
 * (`DefaultConversationViews`). `conversationPhase` is `active` when a conversation target is active,
 * when the session is past its first turn (`!blank && !awaitingFirstTurn`) or running, and `engaging`
 * once a prompt was attempted. A host command such as `/compact` opens the transcript through an
 * active target while `session.blank` stays true, so reading `blank` alone drew every Help row twice:
 * once in the strip and once in the transcript (measured 08/10/2026).
 *
 * The rule is repeated here, structurally, because a Tracy plugin does not import dsh's module; the
 * test file holds its cases, so a change in dsh's rule shows up as a red test.
 */

/** The slice of dsh's `SessionSnapshot` the rule reads. */
export interface PhaseSession {
  readonly blank?: boolean
  readonly running?: boolean
  readonly promptAttempted?: boolean
}

/**
 * @param session - the session snapshot the dock was handed.
 * @param activeTargets - how many conversation targets are active (`useConversation(s => s.activeTargets.size)`).
 * @returns true while dsh draws no transcript, so the strip is the only place a Help row can show.
 */
export function transcriptHidden(session: PhaseSession | undefined, activeTargets: number): boolean {
  if (session?.blank !== true) return false
  // blank is true here, so the "past its first turn" arm of dsh's rule cannot hold.
  if (activeTargets > 0 || session.running === true) return false
  return session.promptAttempted !== true
}
