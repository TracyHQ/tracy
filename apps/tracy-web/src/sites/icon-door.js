// POST /api/sites/:key/icons — the site agent's icon door (`tracy_site media.icon`, packages/tools/tracy-site-tools
// src/host/icon.mjs). The agent's dsh has no picture library and no image code, and this server has both: the icon set the
// build's icon step picks from and the code the write step draws a replaced icon with (lib/picture-paint/icons/icon-pick.js).
// So the door searches and draws, and writes nothing: the dsh uploads what it answers and writes the slots through the Apply
// door as the person it works for, so the change has its receipt in Changes and its undo like any other.
//
// Three operations, one body each:
// - `search` {query}: library names whose names or tags say the words;
// - `pair` {slot}: the icon slots that show this icon in each theme, from the site's template kit (`twinOf`);
// - `draw` {icon, files:[{slot, template_b64?, current_b64?}]}: each slot's icon drawn again with that glyph, in the look
//   of its template icon and the colours it shows now. The dsh reads both files from the site's own folder.
import { json } from '../lib/http.js'
import { iconPairOf, PHOSPHOR_SET, redrawIcon, searchIcons } from '../lib/picture-paint/icons/icon-pick.js'
import { kitOfContract } from '../lib/template-kit/reader.js'

/** A slot key of a contract: `article-2.18`, `home.hero.img`. */
const SLOT_KEY = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/
/** One icon file at most: a template icon is a few kilobytes, a photo sent by mistake is refused. */
const FILE_MAX = 2 * 1024 * 1024
/** The most slots one draw takes: an icon and its twins. */
const FILES_MAX = 4

const bytesOf = (b64) => {
  if (b64 === undefined || b64 === null || b64 === '') return null
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return undefined
  const bytes = Buffer.from(b64, 'base64')
  return bytes.length > FILE_MAX ? undefined : bytes
}

/**
 * @param {import('hono').Hono} app
 * @param {{ conversationSite: (c: any) => Promise<{ siteKey?: string, error?: Response }>,
 *   requireGrant: (c: any, siteKey: string, allowActor?: boolean) => Promise<{ error?: Response }>,
 *   siteByKey: (key: string) => Promise<any>,
 *   contractOfSite: (site: any) => { id: string, dir?: string } | null,
 *   kitOf?: (contract: { id: string, dir?: string } | null) => { state: string, doc?: any } }} deps
 */
export function mountSiteIcons(
  app,
  { conversationSite, requireGrant, siteByKey, contractOfSite, kitOf = kitOfContract }
) {
  app.post('/api/sites/:key/icons', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = /** @type {string} */ (held.siteKey)
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const operation = body?.operation

    if (operation === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : ''
      if (query === '')
        return json(c, { ok: false, code: 'BAD_PARAMS', error: 'query: what the icon shows, in words' }, 400)
      return json(c, { ok: true, set: PHOSPHOR_SET, icons: searchIcons(query) })
    }

    if (operation === 'pair') {
      const slot = typeof body.slot === 'string' ? body.slot.trim() : ''
      if (!SLOT_KEY.test(slot))
        return json(c, { ok: false, code: 'BAD_PARAMS', error: 'slot: a contract slot key' }, 400)
      const site = await siteByKey(siteKey)
      if (!site) return json(c, { ok: false, code: 'SITE_UNKNOWN' }, 404)
      const kit = kitOf(contractOfSite(site))
      if (kit.state !== 'read')
        return json(c, {
          ok: false,
          code: 'NO_KIT',
          error: "this site's template has no template kit, so which slots are icons is not known"
        })
      return json(c, iconPairOf(kit.doc, slot))
    }

    if (operation === 'draw') {
      const icon = typeof body.icon === 'string' ? body.icon.trim().toLowerCase() : ''
      const files = Array.isArray(body.files) ? body.files : []
      if (icon === '' || files.length === 0 || files.length > FILES_MAX)
        return json(c, { ok: false, code: 'BAD_PARAMS', error: 'icon and 1 to 4 files' }, 400)
      const pictures = []
      for (const file of files) {
        const slot = typeof file?.slot === 'string' ? file.slot : ''
        const template = bytesOf(file?.template_b64)
        const current = bytesOf(file?.current_b64)
        if (!SLOT_KEY.test(slot) || template === undefined || current === undefined)
          return json(
            c,
            {
              ok: false,
              code: 'BAD_PARAMS',
              error: 'each file: {slot, template_b64?, current_b64?}, at most 2 MiB'
            },
            400
          )
        const made = await redrawIcon({ glyph: icon, template, current })
        if (!made.ok) return json(c, { ...made, slot })
        pictures.push({
          slot,
          png_b64: made.bytes.toString('base64'),
          width: made.width,
          height: made.height,
          sha256: made.sha256,
          colour: made.colour
        })
      }
      return json(c, { ok: true, set: PHOSPHOR_SET, icon, pictures })
    }

    return json(c, { ok: false, code: 'BAD_PARAMS', error: 'operation: search, pair or draw' }, 400)
  })
}
