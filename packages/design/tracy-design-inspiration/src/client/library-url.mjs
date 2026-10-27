/**
 * Where a system's file is read from in the browser. The catalog names a `library` — the public
 * page's static files and the vendor commit they were cut from (tasks/todo-thu-vien-mot-cho.md) —
 * and the 152 systems are read straight from there, versioned by `?v=<commit>` so a CDN and the
 * browser keep them for a year and a new commit is a new address. A brand (`brand:<host>`) is the
 * customer's own and stays behind the lane's door. With no library named (an image-only lane,
 * an older host) everything goes through the door, as before.
 *
 * Shared by the plugin's client and the public page — one function, one place to be wrong.
 */

/**
 * @param {{ url: string, commit: string } | null} library
 * @param {(rest: string) => string} door the plugin's own door for `systems/<id>/<file>`
 * @param {string} id
 * @param {string} file `tokens.css` … `system/artifacts/<kind>.html`, or the aliases `slots` and `artifact-slots/<kind>`
 * @returns {string}
 */
export function libraryFileUrl(library, door, id, file) {
  if (library === null || id.startsWith('brand:')) return door(`systems/${encodeURIComponent(id)}/${file}`)
  const base = library.url.replace(/\/+$/, '')
  const v = `?v=${encodeURIComponent(library.commit)}`
  const artifactSlots = /^artifact-slots\/([a-z]+)$/.exec(file)
  if (artifactSlots)
    return `${base}/systems/${encodeURIComponent(id)}/artifact-slots/${artifactSlots[1]}.json${v}`
  if (file === 'slots') return `${base}/systems/${encodeURIComponent(id)}/slots.json${v}`
  return `${base}/systems/${encodeURIComponent(id)}/${file}${v}`
}
