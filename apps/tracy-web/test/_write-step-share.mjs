// Fixtures for the share stage of the write step: the brand and picture fixtures together, a kit with two pages, and a
// fake site that also keeps menu items and template styles. All names, pictures and paths are invented.
import { runWriteStep } from '../src/write-step/write-step.js'
import { brandFile, brandKit, frozenWithBrand } from './_write-step-brand.mjs'
import { frozenWithPictures, pictureKit, pictureSite } from './_write-step-pictures.mjs'
import { SITE } from './_write-step-run.mjs'

/** Home shows the hero in block-2, About only a block with no picture, so it falls back to the logo. */
export function shareKit({ blocks } = {}) {
  const kit = brandKit()
  kit.doc.site = { ...pictureKit().doc.site, ...kit.doc.site }
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['header', 'block-2', 'block-3'] } },
    { id: 'page-about', path: '/about-us/coach', blocks: { 1440: ['header', 'block-9', 'block-88'] } }
  ].map((p) => ({ ...p, blocks: blocks?.[p.id] ?? p.blocks }))
  return kit
}

const menuRow = (id, over) => ({
  id,
  published: 1,
  home: 0,
  menutype: 'mainmenu',
  params: JSON.stringify({ page_title: 'Quay', show_icon: 1 }),
  ...over
})
const styleRow = (id, over) => ({
  id,
  template: 'demo_gym',
  client_id: 0,
  params: JSON.stringify({ system_t4frontendedit: '1' }),
  ...over
})

export const MENU = () => [menuRow(101, { home: 1, path: 'home' }), menuRow(102, { path: 'about-us/coach' })]
export const STYLES = () => [styleRow(11), styleRow(12), styleRow(13, { client_id: 1, template: 'admin_x' })]

/** The picture site, plus the records the share stage lists, reads and updates. `refuse` maps `kind` to an answer. */
export function shareSite({ menu = MENU(), styles = STYLES(), refuseKind = {}, ...over } = {}) {
  const site = pictureSite(over)
  const inner = site.door
  const rows = new Map([
    ...menu.map((r) => [`menuItem-${r.id}`, r]),
    ...styles.map((r) => [`templateStyle-${r.id}`, r])
  ])
  const kept = (kind) => ['menuItem', 'templateStyle'].includes(kind)
  const door = {
    async apply(call) {
      const { action, params = {} } = call
      if (!action.startsWith('content.') || action === 'content.contract' || !kept(params.kind)) {
        if (action === 'content.update' && kept(params.kind)) return { ok: true }
        return inner.apply(call)
      }
      site.log.push(call)
      if (action === 'content.list')
        return {
          ok: true,
          items: [...rows].filter(([key]) => key.startsWith(`${params.kind}-`)).map(([, r]) => r)
        }
      if (action === 'content.get') {
        const row = rows.get(`${params.kind}-${params.id}`)
        return row ? { ok: true, item: row } : { ok: false, error: 'not_found', message: 'no such row' }
      }
      if (refuseKind[params.kind]) return refuseKind[params.kind]
      const row = rows.get(`${params.kind}-${params.id}`)
      rows.set(`${params.kind}-${params.id}`, { ...row, ...params.fields })
      return { ok: true }
    }
  }
  const held = (kind, id) => rows.get(`${kind}-${id}`)
  const params = (kind, id) => JSON.parse(held(kind, id).params)
  return { ...site, door, held, params }
}

/** Brand and pictures in one folder: the brand file's pictures are written beside the picture package. */
export function frozenWithBoth({ pictures, brand = brandFile() } = {}) {
  const withPictures = frozenWithPictures(pictures ? { pictures } : {})
  brand.colours = { decision: 'kept-template', module: null }
  const withBrand = frozenWithBrand({ brand })
  return {
    files: {
      ...withBrand.files,
      pictures: withPictures.files.pictures,
      plan: withPictures.files.plan,
      copy: withPictures.files.copy
    },
    done: () => {
      withBrand.done()
      withPictures.done()
    }
  }
}

/** The entry point with brand, pictures and menu on the fake site; `line` finds a report line by its slot. */
export async function runShare({ site: siteOver = {}, kit = shareKit(), files = {}, withBrand = true } = {}) {
  const site = shareSite(siteOver)
  const frozen = frozenWithBoth(files)
  if (!withBrand) delete frozen.files.brand
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap: null,
      files: frozen.files,
      sleep: async () => {},
      accentPlace: async () => null
    })
    return { report, site, line: (slot) => report.slots.find((s) => s.slot === slot) }
  } finally {
    frozen.done()
  }
}
