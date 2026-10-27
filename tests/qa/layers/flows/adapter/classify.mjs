// Turns what the legacy runner wrote (journeys/<id>[-<cms>].json, report.json) into layer verdicts.
// Pure functions, no I/O: every rule that keeps a legacy "pass" from being believed lives here.
//
// A legacy PASS is only a CANDIDATE: the layer still needs a red proof before it counts (the
// caller turns a candidate without proof into PENDING). What is never a candidate:
//   - a journey that succeeded only on a retry (the first failure is the real signal),
//   - a journey whose notes carry a known/upstream error (the error is lowered to a note there),
//   - J1 (it never reads the emailed code), a run with --keep (it proves nothing about delete),
//   - a record whose shape, id or verdict is not what the legacy runner writes.

const LEGACY_VERDICTS = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT RUN'])
/** BLOCKED kinds the legacy suite uses for "a prerequisite outside the mechanism is missing". */
const ENV_KINDS = new Set(['environment', 'model', 'mailbox', 'no-mailbox', 'credentials', 'image'])
/** A FAIL message that says the transport, not the product, could not do its job. */
const TRANSPORT_FAILURE =
  /no local equivalent|devExec refused|ssh:|Permission denied \(publickey\)|ConnectTimeout|check-server|E2E_RUN_ID/i
/** A FAIL message that proves a prerequisite of the machine is missing (no browser binary, no Playwright). */
const MISSING_PREREQUISITE =
  /Executable doesn't exist|browserType\.launch|playwright is not installed|npx playwright install|spawn docker ENOENT/i
const KNOWN_NOTE = /known[- ]error|dsh-subscriptions-status-404|upstream/i

/**
 * @param {unknown} record - parsed journeys/*.json
 * @param {{ journey: string, cms?: string | null, keep?: boolean }} want
 * @returns {{ verdict: 'PASS'|'FAIL'|'ENV'|'PENDING', candidate: boolean, reason: string, notes: string[] }}
 */
export function classifyJourney(record, want) {
  const bad = (why) => ({ verdict: 'PENDING', candidate: false, reason: `TEST_INVALID: ${why}`, notes: [] })
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return bad('journey record is not an object')
  const r = /** @type {Record<string, any>} */ (record)
  if (r.id !== want.journey) return bad(`record id ${JSON.stringify(r.id)} is not ${want.journey}`)
  if ((r.cms ?? null) !== (want.cms ?? null))
    return bad(`record cms ${JSON.stringify(r.cms)} is not ${want.cms ?? null}`)
  if (!LEGACY_VERDICTS.has(r.verdict)) return bad(`unknown verdict ${JSON.stringify(r.verdict)}`)
  if (!Array.isArray(r.attempts) || r.attempts.length === 0)
    return bad('no attempts recorded (zero executed assertions)')
  const last = r.attempts.at(-1)
  if (!last || typeof last !== 'object' || last.verdict !== r.verdict)
    return bad('the last attempt does not carry the journey verdict')
  const notes = r.attempts.flatMap((a) => (Array.isArray(a?.notes) ? a.notes.map(String) : []))
  const reason = typeof r.reason === 'string' ? r.reason : ''

  if (r.verdict === 'NOT RUN')
    return { verdict: 'PENDING', candidate: false, reason: `not run: ${reason}`, notes }
  if (r.verdict === 'BLOCKED') {
    const kind = /^\[([a-z-]+)\]/.exec(reason)?.[1] ?? null
    if (kind && ENV_KINDS.has(kind))
      return { verdict: 'ENV', candidate: false, reason: `legacy probe → ${reason}`, notes }
    return {
      verdict: 'PENDING',
      candidate: false,
      reason: `BLOCKED is not a pass: ${reason || 'no reason given'}`,
      notes
    }
  }
  if (r.verdict === 'FAIL') {
    if (MISSING_PREREQUISITE.test(reason))
      return { verdict: 'ENV', candidate: false, reason: `legacy probe → ${reason.slice(0, 300)}`, notes }
    if (TRANSPORT_FAILURE.test(reason))
      return { verdict: 'PENDING', candidate: false, reason: `TEST_INVALID: transport — ${reason}`, notes }
    // The first failing attempt is the earliest divergence, even if a retry later passed.
    const first = r.attempts.find((a) => a?.verdict === 'FAIL')
    return { verdict: 'FAIL', candidate: false, reason: `${want.journey}: ${first?.reason ?? reason}`, notes }
  }
  // verdict === 'PASS'
  if (want.journey === 'J1')
    return {
      verdict: 'PENDING',
      candidate: false,
      reason: 'J1 never reads the emailed code; the scripted sign-in cases do',
      notes
    }
  if (want.keep)
    return {
      verdict: 'PENDING',
      candidate: false,
      reason: '--keep skips deletion, so the journey proves nothing about delete',
      notes
    }
  const firstFail = r.attempts.find((a) => a?.verdict === 'FAIL')
  if (firstFail)
    return {
      verdict: 'PENDING',
      candidate: false,
      reason: `passed only on a retry; first attempt failed: ${String(firstFail.reason ?? '').slice(0, 300)}`,
      notes
    }
  const known = notes.filter((n) => KNOWN_NOTE.test(n))
  if (known.length)
    return {
      verdict: 'PENDING',
      candidate: false,
      reason: `passed with ${known.length} known-error note(s) lowered from failures: ${known[0].slice(0, 200)}`,
      notes
    }
  return { verdict: 'PASS', candidate: true, reason: 'legacy journey passed', notes }
}

/** Worst verdict of several (one per CMS): FAIL > PENDING > ENV > PASS. */
export function worstOf(results) {
  const rank = { FAIL: 3, PENDING: 2, ENV: 1, PASS: 0 }
  return results.reduce((a, b) => (rank[b.verdict] > rank[a.verdict] ? b : a))
}
