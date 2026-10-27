/**
 * The code a person compares between the desktop app's waiting window and the `/signin` page
 * before approving a desktop sign-in round (`tasks/todo-desktop-signin-package.md`).
 *
 * WHY ONE FUNCTION. `POST /auth/link/browser` hands the code to the app and `GET /signin` prints it
 * for the person; if the two ever computed it differently, every honest round would show two codes
 * that do not match and teach people to approve anyway. Both doors call this, and nothing else
 * derives the code.
 *
 * WHAT IT PROVES. It is derived from the nonce, so it is no secret: it tells a person that the page
 * in front of them belongs to the round their own app opened, not to one somebody else opened and
 * sent them a link to.
 */
import { createHash } from 'node:crypto'

/** 32 characters with no look-alikes: no 0/O, no 1/I. Upper case only. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/**
 * @param {string} nonce - the round's nonce, as `POST /auth/link/browser` answered it.
 * @returns {string} `ABCD-EFGH`: eight characters (40 bits) of SHA-256 over a labelled nonce.
 */
export function matchCode(nonce) {
  const digest = createHash('sha256').update(`tracy-desktop-match:${nonce}`).digest()
  let chars = ''
  for (let i = 0; i < 8; i++) chars += ALPHABET[digest[i] % ALPHABET.length]
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}
