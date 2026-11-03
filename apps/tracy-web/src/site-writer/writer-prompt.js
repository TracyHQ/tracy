// The site writer prompt (ADR 0042, #332). writer-prompt.md is a DRAFT: it is locked by a hash test only after the
// owner approves real output (#334). Every run records the sha256 below, so each result names the exact prompt
// bytes it was written with. How to call the bench's tools is said in the first user message, never here.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const WRITER_PROMPT_FILE = new URL('./writer-prompt.md', import.meta.url)

let loaded = null

/** The prompt text and the sha256 of its bytes, read once per process. */
export function writerPrompt() {
  if (loaded) return loaded
  const bytes = readFileSync(WRITER_PROMPT_FILE)
  loaded = Object.freeze({
    text: bytes.toString('utf8'),
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
  return loaded
}
