// The picture step's prompts (ADR 0043): one per model role, the picker, the drawing template and the looker, loaded
// once per process with their hashes and recorded on every run. The picker's prompt (#342) is picker-prompt.md, a
// DRAFT until the owner approves real output, then locked by a hash test; the drawer (#344) and the looker (#343) still
// have an empty prompt, whose hash is the hash of the empty text. A run started on another prompt set is refused (the
// bench run loop compares the combined hash). The picker's text is the system prompt of the run's model calls.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PROMPT_ROLES } from './manifest-shape.js'

export const PICKER_PROMPT_FILE = new URL('./picker-prompt.md', import.meta.url)

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

let loaded = null

/**
 * { text, sha256, roles }: `text` the picker's prompt, `roles` each role's own hash of its bytes (the manifest
 * fingerprint's `prompts`), `sha256` the hash of all three together.
 */
export function picturePrompts() {
  if (loaded) return loaded
  const bytes = { picker: readFileSync(PICKER_PROMPT_FILE), drawing: '', looker: '' }
  const roles = Object.fromEntries(PROMPT_ROLES.map((role) => [role, sha(bytes[role])]))
  loaded = Object.freeze({
    text: bytes.picker.toString('utf8'),
    sha256: sha(PROMPT_ROLES.map((role) => `${role} ${roles[role]}`).join('\n')),
    roles: Object.freeze(roles)
  })
  return loaded
}
