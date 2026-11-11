// The picture step's prompts (ADR 0043): one per model role, the picker, the drawing template and the looker, loaded
// once per process with their hashes and recorded on every run. The picker's prompt (#342) is picker-prompt.md, the
// looker's (#343) looker-prompt.md and the drawer's fixed template (#344) drawing-prompt.md, DRAFTS until the owner
// approves real output, then locked by a hash test. A run started on another prompt set is refused (the bench run loop
// compares the combined prompt and processing-policy hash). The picker's text is the system prompt of the run's model calls.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PROMPT_ROLES } from './manifest-shape.js'

export const PICKER_PROMPT_FILE = new URL('./picker-prompt.md', import.meta.url)
export const DRAWING_PROMPT_FILE = new URL('./drawing-prompt.md', import.meta.url)
export const LOOKER_PROMPT_FILE = new URL('./looker-prompt.md', import.meta.url)

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Processing semantics share the persisted lifetime fingerprint, while all three approved role prompts stay unchanged.
export const PICTURE_PROCESSING_POLICY = 'readability-retry/1'

let loaded = null

/**
 * The parts of the drawing template: the text under each `## <name>` heading, trimmed. The text before the first
 * heading describes the file and is never sent.
 */
export function drawingParts(text) {
  const parts = {}
  let name = null
  for (const line of String(text).split('\n')) {
    const heading = /^## (\w+)\s*$/.exec(line)
    if (heading) {
      name = heading[1]
      parts[name] = []
    } else if (name) parts[name].push(line)
  }
  return Object.freeze(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('\n').trim()])))
}

/**
 * { text, looker, drawing, sha256, roles }: `text` the picker's prompt, `looker` the looker's, `drawing` the drawer's
 * template parts, `roles` each role's own hash of its bytes (the manifest fingerprint's `prompts`), `sha256` the hash of
 * all three and the explicit processing policy together; `policy` names those processing semantics.
 */
export function picturePrompts() {
  if (loaded) return loaded
  const bytes = {
    picker: readFileSync(PICKER_PROMPT_FILE),
    drawing: readFileSync(DRAWING_PROMPT_FILE),
    looker: readFileSync(LOOKER_PROMPT_FILE)
  }
  const roles = Object.fromEntries(PROMPT_ROLES.map((role) => [role, sha(bytes[role])]))
  loaded = Object.freeze({
    text: bytes.picker.toString('utf8'),
    looker: bytes.looker.toString('utf8'),
    drawing: drawingParts(bytes.drawing.toString('utf8')),
    policy: PICTURE_PROCESSING_POLICY,
    sha256: sha(
      `policy ${PICTURE_PROCESSING_POLICY}\n${PROMPT_ROLES.map((role) => `${role} ${roles[role]}`).join('\n')}`
    ),
    roles: Object.freeze(roles)
  })
  return loaded
}
