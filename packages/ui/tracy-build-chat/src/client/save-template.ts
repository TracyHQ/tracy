/**
 * Write the chosen template to the account's build draft (`PUT /api/build-draft/template`, tracy-web, #603). The door
 * is tracy-web's own, not dsh's, so the path is absolute and not passed through dsh's site prefix.
 */
export const BUILD_DRAFT_TEMPLATE_PATH = '/api/build-draft/template'

/**
 * @param template - `{slug, name, version}` of the chosen template (`templateOfChoice`)
 * @param fetchImpl - the page's `fetch`; a test passes its own
 * @returns the draft tracy-web answered with; throws when the door refused
 */
export async function saveTemplateChoice(
  template: { slug: string; name: string; version: string },
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const response = await fetchImpl(BUILD_DRAFT_TEMPLATE_PATH, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template })
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(body?.code ?? response.status))
  return body?.draft ?? null
}
