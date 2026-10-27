/**
 * Who is reading `/ops`, for the rail's footer — `GET /api/ops/me`.
 *
 * 🔒 A LEAF, for the same reason `cms/route.ts` is one: the shell imports it, so anything it
 * imported would land in the root chunk. It imports nothing.
 *
 * WHY NOT `/api/ops/team`. That door already answers `viewer: {email, role}`, and the rail is
 * drawn on every screen — so reading it here would read the whole staff roster on Agents, on Host
 * agents, on every cms screen, to render one line. `/api/ops/me` is the same `admit()` call
 * without anybody else's row (see its docstring in `apps/tracy-web/src/ops/route.js`).
 *
 * `null` is a real answer, not an error: a door that refuses (403) or a network that did not
 * answer both mean "the footer has nothing true to say", and the footer draws nothing rather than
 * a placeholder identity. Guessing a person's name is worse than leaving the line empty.
 */

export interface Viewer {
  email: string
  role: string
  /** What the DOOR decided, not what the screen guessed — see the route's own docstring. */
  writable: boolean
}

export async function fetchViewer(signal?: AbortSignal): Promise<Viewer | null> {
  try {
    const response = await fetch('/api/ops/me', { signal, headers: { accept: 'application/json' } })
    if (!response.ok) return null
    const body = (await response.json()) as Partial<Viewer>
    if (typeof body?.email !== 'string' || typeof body?.role !== 'string') return null
    return { email: body.email, role: body.role, writable: body.writable === true }
  } catch {
    return null
  }
}

/** Sign out, then land on the one sign-in door. A POST, because that is the shape of the door
 * (`identity/route.js`); a GET would let a prefetch or a link-checker end somebody's session. */
export async function signOut(): Promise<void> {
  await fetch('/auth/signout', { method: 'POST' }).catch(() => {})
  window.location.assign('/login')
}
