/**
 * The preview comment popover's turn builder (`buildCommentTurn` of `@tracy/dsh-chat-input`), reached the way this app
 * reaches other files it shares with `packages/` (lib/content-api.js): the image copies the module beside `src/` with the
 * two `@tracy/core` modules it imports (Dockerfile), a checkout reads the package in place. Step 9b (#448) builds its page
 * turns with it, so the site agent receives a repair exactly as it receives a person's comment. Never a second copy.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IN_IMAGE = new URL('../comment-turn/comment-turn.mjs', import.meta.url)
const IN_CHECKOUT = new URL(
  '../../../../packages/ui/tracy-chat-input/src/client/comment-turn.mjs',
  import.meta.url
)
const source = existsSync(fileURLToPath(IN_IMAGE)) ? IN_IMAGE : IN_CHECKOUT

export const { buildCommentTurn, parseCommentTurn } = await import(source.href)
