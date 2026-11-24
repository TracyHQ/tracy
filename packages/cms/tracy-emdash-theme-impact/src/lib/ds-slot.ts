// The design-system slot (tasks/ke-hoach-site-mac-dung-design-system.md). A site that wears a design
// system has one file, `data/ds-slot.css`, written by Tracy's build tools; this reads it per request
// so switching systems needs no rebuild. No file = no slot = the template looks exactly as it did.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type DsSlot = {
  css: string
  fontsHref: string | null
  id: string | null
  mode: 'light' | 'dark' | null
}

const DIR = process.env.SITE_DATA_DIR ?? './data'
const FILE = join(DIR, 'ds-slot.css')
// Only ever a Google Fonts stylesheet: the file is written by Tracy, but a request must never be able
// to make the page load a stylesheet from anywhere else.
const FONT_HREF = /^https:\/\/fonts\.googleapis\.com\/css2\?[A-Za-z0-9=&:;+@.%_-]+$/
// Keyed on mtime + size + inode: a rewrite that keeps the mtime (`cp -p`, `rsync -t`, a coarse clock)
// or a delete-and-recreate between two requests is still a new file.
const CACHE: { key: string; slot: DsSlot | null } = { key: '', slot: null }

export async function readDsSlot(): Promise<DsSlot | null> {
  let key: string
  try {
    const st = await stat(FILE)
    key = `${st.mtimeMs}:${st.size}:${st.ino}`
  } catch {
    CACHE.key = ''
    CACHE.slot = null
    return null
  }
  if (key === CACHE.key) return CACHE.slot
  let text = ''
  try {
    text = await readFile(FILE, 'utf8')
  } catch {
    return null
  }
  const head = /^\/\* tracy-ds-slot: (.+?) \(/.exec(text)
  // A file without the generated header (empty, half-written, written by hand) is not a worn system:
  // wearing it would hide the visitor's light/dark choice for nothing.
  if (!head) {
    CACHE.key = key
    CACHE.slot = null
    return null
  }
  const fonts = /^\/\* fonts: (\S+) \*\//m.exec(text)?.[1] ?? null
  // the side of light the system is (Tracy's emitter, #1315): the page opens on it; the visitor's own
  // switch still works, the other side being derived from the system
  const modeMatch = /^\/\* mode: (light|dark) \*\//m.exec(text)
  const mode = modeMatch ? (modeMatch[1] as 'light' | 'dark') : null
  // `</style` can never appear inside a stylesheet we generated; refuse a file that has it.
  if (/<\/style/i.test(text)) return null
  CACHE.key = key
  CACHE.slot = { css: text, fontsHref: fonts && FONT_HREF.test(fonts) ? fonts : null, id: head[1], mode }
  return CACHE.slot
}
