// The approved brand step prompt (brand bench, #320). brand-step.system.md is the owner's locked v10 text, copied byte
// for byte: never edit it here. A defect found while wiring is fixed in a tool or the orchestrator; a real need to
// change the prompt goes to the owner first. Every run records the sha256 below.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const BRAND_PROMPT_FILE = new URL('./brand-step.system.md', import.meta.url)

/** The sha256 the locked prompt must have. */
export const BRAND_PROMPT_SHA256 = 'c21e2a7d553165fba3479e0a42fd433f2fa8c0aedf15eb534943af866953ec53'

let loaded = null

/** The prompt text and the sha256 of its bytes, read once per process. */
export function brandPrompt() {
  if (loaded) return loaded
  const bytes = readFileSync(BRAND_PROMPT_FILE)
  loaded = Object.freeze({
    text: bytes.toString('utf8'),
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
  return loaded
}
