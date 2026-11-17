/**
 * The stop card's Start over (#575): the existing start over door, `POST /api/build-draft/start-over` with
 * `{confirm: true}` (`apps/tracy-web/src/build-draft/start-over-route.js`), sent by the signed in browser after the
 * owner confirmed on the card. It names the chat it is pressed in (`x-tracy-session`), so a card in an older
 * conversation is refused rather than starting the current one over. The door is tracy-web's own, so the path is
 * absolute and not passed through dsh's site prefix.
 */
export const START_OVER_PATH = '/api/build-draft/start-over'
/** Where the new conversation opens when the door named none. */
const OPEN = '/new/build'

/**
 * @returns where the new conversation opens, or null when the door refused (a build runs, a site was built)
 */
export async function startOverDraft(
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const response = await fetchImpl(START_OVER_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-tracy-session': sessionId },
    body: JSON.stringify({ confirm: true })
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.started !== true) return null
  return typeof body.open === 'string' && body.open.startsWith('/') && !body.open.startsWith('//')
    ? body.open
    : OPEN
}
