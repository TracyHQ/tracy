/**
 * One answer from the host half's `status` door, read into what the wizard should do next.
 *
 * 🔒 `RUN_UNKNOWN` IS AN ANSWER. The run lives only in dsh's memory (`src/host/run.ts`), so a dsh
 * restart forgets it — and on the dev surface every push to `develop` redeploys dsh. Reading that
 * 404 as "ask again" spun the wizard for three hours on 2026-09-14. Everything else that is not a
 * run stays "ask again": a missed poll is most likely a busy road, and showing bad news for it is
 * making someone read a failure that may not be true.
 *
 * @param {number} status HTTP status, `0` when the request never got an answer.
 * @param {Record<string, unknown>} body Parsed body, `{}` when there was none.
 * @returns {'run' | 'lost' | 'retry'} What the answer means.
 */
export function pollVerdict(status, body) {
  if (status === 200 && typeof body.id === 'string') return 'run'
  if (status === 404 && body.code === 'RUN_UNKNOWN') return 'lost'
  return 'retry'
}
