/**
 * `<userData>/policy.json`: the last minimum version policy the app accepted from a channel file
 * whose signature verified (tasks/todo-desktop-update-policy.md C5), `{ policy, revision, verifiedAt }`.
 * A start reads it at once (C6), before the network answers, so a copy told to stop stays stopped
 * offline (Open questions: offline + a stored "blocked" still blocks, with Retry).
 *
 * `revision` is the policy's `policyRevision` (0 for a channel file with no policy lines): what
 * src/update-plan.js `acceptPolicy` compares, so a replayed older file never replaces a newer one.
 *
 * Read defensively — a missing, broken or inconsistent file is null, and a log line; written whole
 * through a temporary file and a rename, so a crash mid-write leaves the old file.
 */
const fs = require('node:fs')
const path = require('node:path')

const MAX_BYTES = 16 * 1024
const VERSION_RE = /^\d+\.\d+\.\d+(-dev\.\d+)?$/
const KEYS = new Set(['minimumVersion', 'minimumVersionAfter', 'policyRevision'])

/** @param {unknown} record @returns {boolean} */
function wellFormed(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return false
  const { policy, revision, verifiedAt } = record
  if (!Number.isSafeInteger(revision) || revision < 0) return false
  if (!Number.isFinite(verifiedAt)) return false
  if (policy === null) return revision === 0
  if (typeof policy !== 'object' || Array.isArray(policy)) return false
  if (Object.keys(policy).some((key) => !KEYS.has(key))) return false
  if (policy.policyRevision !== revision || revision === 0) return false
  if (policy.minimumVersion !== undefined && !VERSION_RE.test(String(policy.minimumVersion))) return false
  if (
    policy.minimumVersionAfter !== undefined &&
    Number.isNaN(Date.parse(String(policy.minimumVersionAfter)))
  )
    return false
  return true
}

/**
 * @param {{ file: string, log: (line: string) => void }} deps
 * @returns {{ read: () => ({ policy: object | null, revision: number, verifiedAt: number } | null), write: (record: object) => void }}
 */
function createPolicyStore({ file, log }) {
  function read() {
    let text
    try {
      const size = fs.statSync(file, { throwIfNoEntry: false })?.size
      if (size === undefined) return null
      if (size > MAX_BYTES) {
        log(`policy: ${file} is too large (${size} bytes); ignored`)
        return null
      }
      text = fs.readFileSync(file, 'utf8')
    } catch (error) {
      log(`policy: cannot read ${file} (${error.message}); ignored`)
      return null
    }
    let record
    try {
      record = JSON.parse(text)
    } catch {
      log(`policy: ${file} is not valid JSON; ignored`)
      return null
    }
    if (!wellFormed(record)) {
      log(`policy: ${file} does not hold a policy record; ignored`)
      return null
    }
    return { policy: record.policy, revision: record.revision, verifiedAt: record.verifiedAt }
  }

  function write(record) {
    if (!wellFormed(record)) throw new TypeError('policy: not a policy record')
    const body = { policy: record.policy, revision: record.revision, verifiedAt: record.verifiedAt }
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`, { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch (error) {
      fs.rmSync(tmp, { force: true })
      throw error
    }
  }

  return { read, write }
}

module.exports = { createPolicyStore }
