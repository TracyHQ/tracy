/**
 * The running build's own release notes (tasks/todo-desktop-update-policy.md D1/D5): the packaging
 * writes them into the bundle (build/release-notes-page.mjs `writeBundleNotes`) —
 * `<resources>/release-notes.txt`, the notes as text, and `<resources>/release-notes.json`,
 * `{ version, page: "X.Y", docsOrigin }` — so every copy has its notes, a fresh install and offline
 * included. Settings › Help & about shows them ("What's new in {version}", src/update-bridge.js).
 *
 * A bundle without them (a hand build, one from before) reads as nothing: the box hides, no error.
 */
const fs = require('node:fs')
const path = require('node:path')
const { normalizeReleaseNotes } = require('./update-state.js')

const PAGE = /^\d+\.\d+$/
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const NOTHING = Object.freeze({ releaseNotes: null, page: null, docsOrigin: null })

/** An origin the app may open: https (or http on this machine, for a test docs host), no path, no credentials. */
function cleanOrigin(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null
  if (url.pathname !== '/') return null
  if (url.protocol === 'https:') return url.origin
  return url.protocol === 'http:' && LOOPBACK.has(url.hostname) ? url.origin : null
}

/**
 * @param {string | undefined} resourcesPath - `process.resourcesPath`.
 * @returns {{ releaseNotes: string | null, page: string | null, docsOrigin: string | null }}
 */
function readBundleNotes(resourcesPath) {
  if (typeof resourcesPath !== 'string') return { ...NOTHING }
  const read = (name) => {
    try {
      return fs.readFileSync(path.join(resourcesPath, name), 'utf8')
    } catch {
      return null
    }
  }
  const text = read('release-notes.txt')
  let info = null
  try {
    info = JSON.parse(read('release-notes.json') ?? 'null')
  } catch {}
  const page = typeof info?.page === 'string' && PAGE.test(info.page) ? info.page : null
  return {
    releaseNotes: text === null ? null : normalizeReleaseNotes(text),
    page,
    docsOrigin: cleanOrigin(info?.docsOrigin)
  }
}

/**
 * The changelog page of a minor on the docs host, or null when either part is not what it must be.
 * @param {{ docsOrigin: string | null, page: string | null }} input
 */
function changelogUrl({ docsOrigin, page }) {
  const origin = cleanOrigin(docsOrigin)
  if (origin === null || typeof page !== 'string' || !PAGE.test(page)) return null
  return `${origin}/changelog/desktop/${page}/`
}

module.exports = { readBundleNotes, changelogUrl }
