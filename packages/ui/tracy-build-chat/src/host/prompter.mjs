/**
 * The person who typed the most recent message of a session, from its log: who `tracy_build` acts as.
 *
 * The same rule as `latestPrompter` in `tracy-site-tools` (`src/host/prompter.mjs`), kept here rather than imported:
 * that file also carries the reply language rules and their word lists at load time, which a bundle importing it
 * would carry too. The rule: only a `user` source is a person (a `plugin` or `tool` message is the machine talking),
 * and a stamp with a name but no address (a gate's master account) cannot be vouched for, so it answers null and the
 * tool says `stopped` rather than calling as nobody. `test/prompter.test.mjs` holds both readers to the same answers.
 *
 * @param {readonly any[] | undefined} events - the session's events, oldest first
 * @returns {{ user: string, email: string } | null}
 */
export function latestPrompter(events) {
  if (!Array.isArray(events)) return null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type !== 'user/message') continue
    const source = event.data?.source
    if (source?.kind !== 'user') continue
    const who = source.prompter
    if (!who || typeof who.user !== 'string' || typeof who.email !== 'string' || who.email === '') return null
    return { user: who.user, email: who.email }
  }
  return null
}
