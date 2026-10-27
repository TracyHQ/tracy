/**
 * Files a release build ADDS under a presentation lock's file roots, pinned in the lock as text.
 *
 * The Claude Cowork plugin walks every `fileRoots` folder at bind and refuses a file the lock does not list
 * ("Unexpected presentation file", QuickstartContract.php). release-joomla.mjs swaps the hashes of the files
 * it changes, but an overlay can also bring a file the version before never had (Tracy Business 1.2.4:
 * scss/_tracy-business-late.scss; JA Kinetic 1.0.8: scss/_logo-pair.scss, 16/10/2026): without its line in
 * the lock every site of the new version would be refused at bind. Each such file is inserted into the
 * lock's `files` object at its sorted place, in the layout the capture wrote (one `"path": "sha256"` per line),
 * so every other byte stays the capture's own.
 */

/**
 * @param {string} lockText the lock as text (the capture's own bytes)
 * @param {Record<string, string>} added path relative to the site root -> sha256, for files the lock lacks
 * @returns {{ text: string, pinned: string[] }}
 */
export function pinAddedFiles(lockText, added) {
  const lock = JSON.parse(lockText)
  const roots = Array.isArray(lock.fileRoots) ? lock.fileRoots : []
  const pinned = Object.keys(added)
    .filter((f) => !(f in (lock.files ?? {})) && roots.some((r) => f.startsWith(`${r}/`)))
    .sort()
  if (pinned.length === 0) return { text: lockText, pinned }
  const open = /\n( *)"files": \{\n/.exec(lockText)
  if (!open) throw new Error('lock: no "files" object to pin added files in')
  const indent = `${open[1]}  `
  const start = open.index + open[0].length
  const end = lockText.indexOf(`\n${open[1]}}`, start)
  if (end < 0) throw new Error('lock: the "files" object does not close')
  // a key as the capture spelled it: with or without PHP's escaped slashes
  const escaped = /"[^"]*\\\//.test(lockText.slice(start, end))
  const spell = (/** @type {string} */ f) => JSON.stringify(f).replace(/\//g, escaped ? '\\/' : '/')
  const lines = lockText.slice(start, end).split('\n')
  for (const f of pinned) {
    const key = spell(f)
    const at = lines.findIndex((l) => l.trimStart() > key)
    const line = `${indent}${key}: "${added[f]}"`
    if (at === -1) {
      lines[lines.length - 1] = `${lines[lines.length - 1]},`
      lines.push(line)
    } else lines.splice(at, 0, `${line},`)
  }
  const text = lockText.slice(0, start) + lines.join('\n') + lockText.slice(end)
  const check = JSON.parse(text)
  for (const f of pinned) if (check.files[f] !== added[f]) throw new Error(`lock: ${f} not pinned`)
  return { text, pinned }
}
