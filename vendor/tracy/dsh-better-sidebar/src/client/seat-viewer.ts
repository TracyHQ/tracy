/**
 * Whether the person on this page holds a Viewer seat on the site (Tracy, TCH ADR 0028).
 *
 * The fork imports nothing of Tracy's: TCH `@tracy/dsh-chat-input` reads the seat's role on the site
 * (`GET /api/sites` `role`) and keeps `<html data-tracy-seat-viewer>` set while it is `viewer`, and
 * this module only reads that attribute. A Viewer may comment but the agent is read-only for them, so
 * the comment popover offers no "Ask Tracy to edit" and the pointing hint does not mention it.
 *
 * Absent attribute (an editor, an owner, a role not read yet, any surface without Tracy) = not a
 * Viewer: the page stays as every other seat sees it, and the server still refuses what a Viewer may
 * not do.
 */
import { useSyncExternalStore } from 'react'

/** The attribute Tracy keeps on `<html>` for a Viewer seat. */
export const SEAT_VIEWER_ATTR = 'data-tracy-seat-viewer'

/**
 * @param root - the page's `<html>`, or null where there is no document.
 * @returns true while the attribute is on it.
 */
export function isSeatViewer(root: Element | null): boolean {
  return root !== null && root.hasAttribute(SEAT_VIEWER_ATTR)
}

const rootOf = (): Element | null => (typeof document === 'undefined' ? null : document.documentElement)

/**
 * Call `onChange` whenever the attribute is set or removed on `<html>`.
 * @returns stop listening.
 */
export function subscribeSeatViewer(onChange: () => void): () => void {
  const root = rootOf()
  if (root === null || typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(root, { attributes: true, attributeFilter: [SEAT_VIEWER_ATTR] })
  return () => { observer.disconnect() }
}

/** @returns whether this page's seat is a Viewer, re-rendering when Tracy says otherwise. */
export function useSeatViewer(): boolean {
  return useSyncExternalStore(subscribeSeatViewer, () => isSeatViewer(rootOf()), () => false)
}
