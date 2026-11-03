// The picture step's prompts (ADR 0043): one per model role, the picker, the drawing template and the looker, loaded
// once per process with their hashes and recorded on every run. The code only run (#340) has no model yet, so every
// role's prompt is still empty and its hash is the hash of the empty text; the picker (#342), the drawer (#344) and
// the looker (#343) bring their prompts, and a run started on another prompt set is refused (the bench run loop
// compares the combined hash).
import { createHash } from 'node:crypto'
import { PROMPT_ROLES } from './manifest-shape.js'

const sha = (text) => createHash('sha256').update(text).digest('hex')

const TEXTS = Object.freeze({ picker: '', drawing: '', looker: '' })

let loaded = null

/** { text, sha256, roles }: `roles` each role's own hash (the manifest fingerprint's `prompts`), `sha256` all three. */
export function picturePrompts() {
  if (loaded) return loaded
  const roles = Object.fromEntries(PROMPT_ROLES.map((role) => [role, sha(TEXTS[role])]))
  loaded = Object.freeze({
    text: '',
    sha256: sha(PROMPT_ROLES.map((role) => `${role} ${roles[role]}`).join('\n')),
    roles: Object.freeze(roles)
  })
  return loaded
}
