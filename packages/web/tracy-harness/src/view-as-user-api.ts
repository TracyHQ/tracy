/**
 * `/ops` › View as user — the one door the icon beside an email presses (`POST /api/ops/view-as`,
 * `apps/tracy-web/src/ops/view-as.js`). The answer is a code, never a sentence from the server.
 */
export type ViewAsAnswer = { ok: true; url: string } | { ok: false; code: string }

export async function startViewAs(email: string, fetchImpl: typeof fetch = fetch): Promise<ViewAsAnswer> {
  try {
    const res = await fetchImpl('/api/ops/view-as', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email })
    })
    const body = (await res.json().catch(() => null)) as { url?: unknown; code?: unknown } | null
    if (res.ok && typeof body?.url === 'string') return { ok: true, url: body.url }
    if (typeof body?.code === 'string') return { ok: false, code: body.code }
    return { ok: false, code: res.status === 403 ? 'FORBIDDEN' : 'FAILED' }
  } catch {
    return { ok: false, code: 'FAILED' }
  }
}

const ERROR_CODES = new Set(['NO_SUCH_ACCOUNT', 'STAFF_TARGET', 'SELF', 'FORBIDDEN'])

/** The dictionary key (`ns/team.ts`) for a refusal code; an unknown code reads as a failure. */
export function viewAsErrorKey(code: string): string {
  return `team.viewAs.error.${ERROR_CODES.has(code) ? code : 'FAILED'}`
}
