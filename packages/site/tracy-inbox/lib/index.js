/**
 * Host half: intentionally empty.
 *
 * The notification log lives in tracy-web's Postgres and its doors (`/api/notifications…`) answer at
 * the host's root, signed by the session cookie. A host route here would be a second copy of that
 * log inside dsh, about people dsh does not know.
 */
export const name = '@tracy/dsh-inbox'
export function apply() {}
