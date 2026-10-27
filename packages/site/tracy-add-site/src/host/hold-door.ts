/**
 * `POST /api/tracy-add-site/hold` — tracy-web's one door into this host for removing an unfinished
 * import (`apps/tracy-web/src/sites/import-remove.js`). The caller is verified before this runs
 * (`index.ts`, `signedByTracy`); this file only decides.
 *
 * - `hold`: refused with `RUN_ACTIVE` while a read of the site is running, or `RECENT_ACTIVITY` when
 *   `quietForMs` is given and the site's latest run change or uploaded part is newer than that (the
 *   abandoned-import sweep). Otherwise the site is held (`hold.ts`), and the answer says when it last
 *   saw activity. The check and the hold are one synchronous step after the reads, so a start either
 *   came first (and is running) or meets the hold (`startRun` throws `SiteHeld`).
 * - `release`: the Remove gave up; starts are allowed again.
 * - `hold` also names the store keys the site's reads left (the open multipart upload and the
 *   finished archives) for tracy-web to delete; this host holds no store credentials.
 * - `forget`: only on a held site, and only after tracy-web deleted the row. Its runs, `runs.json`
 *   lines, Claude Cowork code, `handovers.json` line and upload cursor go; the hold stays as a
 *   tombstone until it lapses.
 */
import { holdSite, isHeld, releaseSite } from './hold.js'
import { handoverKeys } from './handover.js'
import { forgetUpload, heldUpload, staleUpload } from './resume.js'
import { forgetSiteRuns, lastRunActivity, restoreRuns, runForSite, siteArchiveKeys } from './run.js'

type Answer = { status: number; body: unknown }

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export async function answerHold(body: Record<string, unknown>, now = Date.now): Promise<Answer> {
  const siteKey = text(body.siteKey)
  const op = text(body.op)
  if (!siteKey || !op) return { status: 400, body: { code: 'INVALID_REQUEST' } }
  await restoreRuns()

  if (op === 'release') {
    await releaseSite(siteKey)
    return { status: 200, body: { released: true } }
  }

  if (op === 'hold') {
    const quietFor = typeof body.quietForMs === 'number' && body.quietForMs > 0 ? body.quietForMs : 0
    // Read first (it awaits); decide and hold after, with nothing awaited in between.
    const cursor = (await heldUpload(siteKey)) ?? (await staleUpload(siteKey))
    const handed = await handoverKeys(siteKey)
    const standing = runForSite(siteKey)
    if (standing?.state === 'running')
      return { status: 409, body: { code: 'RUN_ACTIVE', runId: standing.id } }
    const seen = [
      lastRunActivity(siteKey),
      cursor ? (cursor.updatedAt ?? cursor.startedAt) : undefined
    ].filter((value): value is number => typeof value === 'number')
    const lastActivityAt = seen.length ? Math.max(...seen) : null
    const at = now()
    if (quietFor && lastActivityAt !== null && at - lastActivityAt < quietFor)
      return { status: 409, body: { code: 'RECENT_ACTIVITY', lastActivityAt } }
    await holdSite(siteKey, at)
    // What the site's reads left in the store, named now: tracy-web deletes it BEFORE it asks this
    // host to forget, so the hold stands over its whole clean-up.
    return {
      status: 200,
      body: {
        held: true,
        lastActivityAt,
        upload: cursor ? { key: cursor.key, uploadId: cursor.uploadId } : null,
        // `handovers.json` goes at `forget`, so its keys (a pending dump included) are named here.
        archives: [...new Set([...siteArchiveKeys(siteKey), ...handed])]
      }
    }
  }

  if (op === 'forget') {
    if (!isHeld(siteKey)) return { status: 409, body: { code: 'NOT_HELD' } }
    await forgetSiteRuns(siteKey)
    await forgetUpload(siteKey)
    // 🔒 THE HOLD STAYS, AS A TOMBSTONE, until it lapses (`HOLD_TTL_MS` from now): tracy-web has
    // already deleted the row, and a `/new/` tab left open must not open a read of a site that is
    // gone. A new import of the same address can begin once it lapses.
    await holdSite(siteKey, now())
    return { status: 200, body: { forgotten: true } }
  }

  return { status: 400, body: { code: 'INVALID_REQUEST' } }
}
