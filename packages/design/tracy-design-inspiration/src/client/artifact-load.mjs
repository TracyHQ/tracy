/**
 * The two reads behind one artifact tab, kept independent on purpose.
 *
 * An artifact is a page (`system/artifacts/<kind>.html`) plus a slot map
 * (`artifact-slots/<kind>`) that says where the customer's words go. They used to be fetched in one
 * `Promise.all`, which made them one failure: on 08/09 the Worker's closed list did not name the
 * slot map, its 404 rejected the pair, and every artifact tab reported "This inspiration does not
 * ship this page" — about a page the same door was serving at 200 and 210KB.
 *
 * So the rule is: only the PAGE failing means there is no page. A missing slot map means the page
 * cannot be edited, which is a smaller loss and must not be reported as a bigger one.
 */

/**
 * @param {() => Promise<string>} readHtml - the artifact's page.
 * @param {() => Promise<unknown>} readSlots - its slot map.
 * @returns {Promise<{ html: string, slots: unknown[] }>} `html: ''` only when the page itself failed.
 */
export async function loadArtifact(readHtml, readSlots) {
  const [html, slots] = await Promise.all([readHtml().catch(() => null), readSlots().catch(() => null)])
  if (typeof html !== 'string' || html === '') return { html: '', slots: [] }
  return { html, slots: Array.isArray(slots) ? slots : [] }
}
