/**
 * Host half: intentionally empty.
 *
 * Every door this feature uses is tracy-web's (`/api/website-opportunities/…`), reached by the
 * browser half with the session cookie; nothing runs in dsh's host process.
 */
export const name = '@tracy/dsh-website-opportunities'
export function apply() {}
