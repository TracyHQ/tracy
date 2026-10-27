/**
 * The file modes of a webroot archive (12/10/2026). Provision unpacks the webroot as root with
 * `tar -xm`, which keeps each member's mode, and the site's web and wp-cli containers read it as
 * another user. So a member at 0600/0700 is a file the site cannot read: the eight WordPress
 * quickstarts packed from sites restored under `umask 077` that day failed at their first wp-cli
 * call ("This does not seem to be a WordPress installation"). The archive is the release's, so the
 * check reads the archive, not a built site.
 *
 * Allowed: regular files 0644 or 0755, directories 0755. Links carry no mode of their own.
 */
import { tarGzMembers } from './archives.js'

export const FILE_MODES = Object.freeze([0o644, 0o755])
export const DIR_MODE = 0o755

const octal = (/** @type {number} */ mode) => `0${mode.toString(8).padStart(3, '0')}`

/**
 * @param {Buffer} gzipped the webroot `.tar.gz`
 * @returns {{ members: number, wrong: { name: string, type: string, mode: string }[], counts: Record<string, number> }}
 *   `wrong` lists every member outside the allowed modes; `counts` tallies them by kind and mode
 *   (`file 0600: 4436`), for one readable line.
 */
export function webrootModes(gzipped) {
  const wrong = []
  /** @type {Record<string, number>} */
  const counts = {}
  const members = tarGzMembers(gzipped)
  for (const m of members) {
    const isDir = m.type === '5'
    const isFile = m.type === '0' || m.type === '7'
    if (!isDir && !isFile) continue
    const ok = isDir ? m.mode === DIR_MODE : FILE_MODES.includes(m.mode)
    if (ok) continue
    const kind = isDir ? 'directory' : 'file'
    wrong.push({ name: m.name, type: kind, mode: octal(m.mode) })
    counts[`${kind} ${octal(m.mode)}`] = (counts[`${kind} ${octal(m.mode)}`] ?? 0) + 1
  }
  return { members: members.length, wrong, counts }
}

/**
 * One sentence for a report, or null when every member is allowed.
 * @param {string} file the archive's name
 * @param {ReturnType<typeof webrootModes>} result
 */
export function webrootModeProblem(file, result) {
  if (result.wrong.length === 0) return null
  const tally = Object.entries(result.counts)
    .map(([k, n]) => `${String(n)} ${k}`)
    .join(', ')
  return `${file} holds ${String(result.wrong.length)} of ${String(result.members)} members the site cannot read as unpacked (${tally}; first ${result.wrong[0].name}): files must be 0644 or 0755, directories 0755`
}
