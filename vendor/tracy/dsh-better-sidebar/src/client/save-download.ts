/**
 * Save one file the host serves (`/sidebar/file?…&download=1`) as the person's download.
 *
 * The bytes are fetched first, the way the archive download already does (`FileTree.tsx`
 * `saveArchive`): a bare `<a download>` saves whatever the route answers, so a refusal — a file
 * over the limit, a path outside the workspace, a session with no folder yet — came down as the
 * route's JSON error envelope, named `file.json` (Tracy beta week, 21/10/2026: a template zip asked
 * for in the chat). A refusal now throws with the route's own message for the caller to show.
 */
export async function saveDownload(url: string, name: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    const envelope: { error?: { message?: string } } | null = await response.json().catch(() => null)
    throw new Error(envelope?.error?.message ?? `HTTP ${response.status}`)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = name
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on the next task, as `saveArchive` does: some engines have not committed the download
  // when click() returns.
  window.setTimeout(() => { URL.revokeObjectURL(objectUrl) }, 0)
}

/** The last segment of a workspace path: the name the download is saved under. */
export function downloadName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? 'download'
}
