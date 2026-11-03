// The approved site writer prompt (ADR 0042, #332, #334). writer-prompt.md is the owner's locked text: never edit it
// here. A change is a new approved prompt, and the sha256 below changes with it (test/site-writer-prompt.test.mjs
// pins it), so every run records exactly which prompt bytes it was written with. How to call the bench's tools is said in the first user message, never here.
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
