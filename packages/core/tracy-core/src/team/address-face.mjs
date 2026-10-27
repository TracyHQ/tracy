/**
 * The face a client draws for someone the server sent no face for — and the ONLY place a client
 * takes a person's letter itself.
 *
 * Every person who has a Tracy account wears the face the server decides (`personFace`,
 * `apps/tracy-web/src/lib/person-face.js`): the Team roster, comment authors, the Changes feed and
 * `/auth/me` all send it. What is left has no account to key a colour by: an address typed into the
 * invite wizard, a person a site record names but no seat backs, a comment drawn before the
 * server's answer brings its author. Such a face is the first character on a neutral grey — the
 * server's letter rule, and no colour, because a colour guessed in the browser would differ from the
 * one the person gets once they have an account.
 *
 * Plain JavaScript on purpose: plugins whose pure modules node runs as they are
 * (`@tracy/dsh-chat-input` `comment-view.mjs`) import it as `@tracy/core/team/address-face`;
 * `face.tsx` re-exports both names for React callers.
 */

/** The colour of a face the server named none for: a neutral grey, never a colour guessed here. */
export const NEUTRAL_FACE_COLOUR = 'var(--muted-foreground, #94a3b8)'

/**
 * The face of an address (or the name a record gives someone) that no Tracy account backs.
 * @param {string} address - an email address, else whatever names the person.
 * @returns {{ initial: string, color: string, avatarUrl: null }} the first character (a whole code
 *   point) upper case, `?` when there is none; {@link NEUTRAL_FACE_COLOUR}; no photo.
 */
export function addressFace(address) {
  const [first = '?'] = typeof address === 'string' ? address.trim() : ''
  return { initial: first.toUpperCase(), color: NEUTRAL_FACE_COLOUR, avatarUrl: null }
}
