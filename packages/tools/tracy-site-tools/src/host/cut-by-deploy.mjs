/**
 * Which deploys cut a running chat turn of a conversation (#1403 item 11).
 *
 * `deploy-host-dsh.sh` writes `$DSH_HOME/cut-by-deploy.json` when its drain runs out and it
 * recreates dsh over work that still held a lease: one record per such deploy,
 * `{at, tag, work: [<each cut lease>]}`, and a chat turn's lease names its `sessionId` and site
 * (`chatLeases`). Nothing read it until now. A turn dsh closes as interrupted when the session is
 * next opened was cut by a deploy only if one of these records names its conversation; any other
 * interruption is Tracy restarting on its own (a crash, a host reboot). The chat's turn card says
 * which (`tracy-chat-input` `interrupted.mjs`), where it used to blame an update every time.
 *
 * Read only: the deploy script appends to the file through a rename at any moment, so this side
 * never writes it. Never throws — a file that cannot be read names no deploy.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const CUT_FILE = 'cut-by-deploy.json'
/** A file larger than this is not read: each record is one deploy that cut work, a few hundred bytes. */
export const CUT_MAX_BYTES = 1024 * 1024

/**
 * When deploys cut a running turn of `sessionId`, oldest first, in epoch milliseconds.
 * @param {string} sessionId
 * @param {string | null | undefined} site - the site label the asking page is mounted under; undefined
 *   when the page talks to dsh directly. A page of one site learns nothing about another site's turns.
 * @param {{ dir?: string }} [options]
 * @returns {number[]}
 */
export function cutTimes(sessionId, site, { dir = process.env.DSH_HOME ?? process.cwd() } = {}) {
  try {
    const file = path.join(dir, CUT_FILE)
    if (statSync(file).size > CUT_MAX_BYTES) return []
    const records = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(records)) return []
    /** @type {number[]} */
    const times = []
    for (const record of records) {
      const at = Date.parse(record?.at)
      if (!Number.isFinite(at) || !Array.isArray(record?.work)) continue
      const cut = record.work.some(
        (/** @type {any} */ w) =>
          w?.kind === 'chat' && w.sessionId === sessionId && (site === undefined || w.siteKey === site)
      )
      if (cut) times.push(at)
    }
    return times.sort((a, b) => a - b)
  } catch {
    return []
  }
}
