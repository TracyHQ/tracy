// The approved site planner prompt (ADR 0041, #301). planner-prompt.md is the owner's locked text, copied byte for
// byte: never edit it here. A change is a new approved prompt, and the sha256 below changes with it, so every run
// records exactly which prompt it used. How to call the bench's tools is said in the first user message, never here.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const PLANNER_PROMPT_FILE = new URL('./planner-prompt.md', import.meta.url)

let loaded = null

/** The prompt text and the sha256 of its bytes, read once per process. */
export function plannerPrompt() {
  if (loaded) return loaded
  const bytes = readFileSync(PLANNER_PROMPT_FILE)
  loaded = Object.freeze({
    text: bytes.toString('utf8'),
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
  return loaded
}
