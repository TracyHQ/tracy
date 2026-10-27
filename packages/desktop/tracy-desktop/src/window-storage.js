/**
 * A second app window keeps its own copy of the page's WINDOW-LEVEL storage keys.
 *
 * WHY. Every window of the app is the same origin, so they share one `localStorage`. The page saves a
 * few things that describe one window — the chat column's width, the transcript's width, the
 * conversation on screen — and reads them back when a window opens. Without this, dragging a column in
 * the second window changes how the main window opens next time.
 *
 * WHICH KEYS. Measured, not guessed: a trace of every Storage call while the app was used
 * (tasks/evidence/desktop-multi-window/spike/storage-trace.json, 09/10). Everything else stays shared on
 * purpose: theme, language, site history, per-conversation layouts, and drafts — a draft is the
 * person's text and must never be cut off from the other window (`dsh.conversation.<session>` holds a
 * draft and a view together, so it is shared whole).
 *
 * HOW (council 09/10, tasks/todo-desktop-multi-window.md):
 *   - seeded once per key from the shared value, then read from the window's own copy;
 *   - `setItem` / `removeItem` change only the copy (a removal is remembered, not forgotten);
 *   - the main window's `storage` events about these keys never reach this page;
 *   - nothing is written back when the window closes;
 *   - the copy lives in `sessionStorage`, so it survives a reload of the window and ends with it.
 *
 * WHERE IT RUNS. In the page's own world, before its first script: the preload hands this function to
 * `contextBridge.executeInMainWorld`, which sends its SOURCE. So it must reference nothing outside its
 * own body (test/window-storage.test.mjs rebuilds it from `toString()` to hold that).
 */

/** The page's window-level keys (dsh fork: ui-layout chat width, ui-conversation width, ui-workspace selection). */
const WINDOW_KEYS = Object.freeze([
  'dsh-layout:chat-width:v2',
  'dsh.conversation.contentWidth',
  'dsh.sessions.current'
])

/**
 * Give this document's window its own copy of `keys`. Call once per document, in the second window only.
 * @param {readonly string[]} keys - the window-level keys.
 * @param {any} [scope] - the page's global object; a test passes its own.
 */
function isolateWindowStorage(keys, scope = globalThis) {
  if (scope.__tracyWindowStorage === true) return
  scope.__tracyWindowStorage = true
  const owned = new Set(keys)
  const PREFIX = 'tracy-window:'
  const proto = scope.Storage.prototype
  const get = proto.getItem
  const set = proto.setItem
  const remove = proto.removeItem

  let shared = null
  try {
    shared = scope.localStorage
  } catch {
    return
  }
  // The copy: session storage, or this document's memory when the browser refuses it.
  let copy
  try {
    const session = scope.sessionStorage
    copy = {
      read: (key) => get.call(session, PREFIX + key),
      write: (key, raw) => set.call(session, PREFIX + key, raw)
    }
  } catch {
    const memory = new Map()
    copy = { read: (key) => memory.get(key) ?? null, write: (key, raw) => memory.set(key, raw) }
  }

  const ours = (storage, key) => storage === shared && owned.has(String(key))
  /** @returns {string | null} the window's value, seeding it from the shared one on first use. */
  const value = (key) => {
    const raw = copy.read(key)
    if (raw !== null) {
      try {
        const entry = JSON.parse(raw)
        if (entry !== null && typeof entry === 'object' && 'v' in entry) return entry.v
      } catch {
        /* an unreadable copy is seeded again */
      }
    }
    const seed = get.call(shared, key)
    copy.write(key, JSON.stringify({ v: seed }))
    return seed
  }

  proto.getItem = function getItem(key) {
    return ours(this, key) ? value(String(key)) : get.call(this, key)
  }
  proto.setItem = function setItem(key, item) {
    if (!ours(this, key)) return set.call(this, key, item)
    copy.write(String(key), JSON.stringify({ v: String(item) }))
  }
  proto.removeItem = function removeItem(key) {
    if (!ours(this, key)) return remove.call(this, key)
    copy.write(String(key), JSON.stringify({ v: null }))
  }
  // Registered before any page script, in the capture phase: it runs first and stops the event.
  scope.addEventListener(
    'storage',
    (event) => {
      if (event.storageArea === shared && owned.has(event.key)) event.stopImmediatePropagation()
    },
    true
  )
}

module.exports = { isolateWindowStorage, WINDOW_KEYS }
