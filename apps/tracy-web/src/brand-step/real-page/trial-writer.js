// The trial-site writer (brand bench real-page check, #322): puts a brand file on the ONE configured trial site, with
// the writers the product already has, so the page can be judged as a customer's would be:
//   - logos, favicon .ico and site name: `setSiteBrand` (sites/brief-engines/brand.js), which also puts the footer
//     logo in the footer's free-HTML module through the template's footer slot;
//   - the phone menu's own picture: the T4 small-logo settings (`site_logo_small`), the CSS fallback only when the
//     profile has no such setting;
//   - PNG 32, PNG 512 and the phone icon 180: the head injection block the kit declares (head-block.js);
//   - the accent: the accent-only Design system module, written the way the Design system step writes a module.
// It reaches the site through the Apply door as the internal account that holds a seat on it (`applyAs`). It refuses
// every other site (trial-guard.js). Nothing here is for a customer's site: that belongs to step 9.
import { createHash } from 'node:crypto'
import { headBlock, headModuleId, menuCssFor, withBlock } from './head-block.js'
import { assertTrialSite, guardedCall } from './trial-guard.js'

const FOLDER = 'images/tracy-brand'

export class RealPageWriteError extends Error {
  constructor(stage, reason) {
    super(`${stage}: ${reason}`)
    this.code = 'REAL_PAGE_WRITE'
    this.stage = stage
    this.reason = reason
  }
}

const said = (error) => String(error?.message ?? error).slice(0, 300)

/**
 * @param {{ trialLabel: string | null, findSite: (label: string) => Promise<any>,
 *   door: (call: { siteKey: string, action: string, params: object }) => Promise<any>,
 *   setSiteBrand: Function, accentJob: (site: any, payload: object) => Promise<{ ok: boolean, reason?: string }>,
 *   contractModule: (kit: object) => Promise<object | null> | object | null, stamp?: () => string }} deps
 *   `door` is the Apply door as the internal account; `accentJob` runs the host's design-system job on the site.
 */
export function createTrialWriter(deps) {
  const stamp = deps.stamp ?? (() => `t${Date.now().toString(36)}`)
  return async function writeTrial({ brandFile, files, kit }) {
    const site = assertTrialSite(await deps.findSite(String(deps.trialLabel ?? '')), deps.trialLabel)
    const door = guardedCall(site, deps.door)
    const id = `brand-${stamp()}`
    const siteKey = site.site_key
    const call = async (action, params) => {
      const answer = await door({ siteKey, action, params })
      if (answer?.ok === false) throw new Error(answer.message ?? answer.error ?? `${action} was refused`)
      return answer
    }
    const upload = async (role, bytes) => {
      const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
      const path = `${FOLDER}/${role}-${sha}-${id.replace(/[^\w-]/g, '')}.png`
      await call('media.upload', { apply_id: id, path, content_b64: Buffer.from(bytes).toString('base64') })
      return path
    }
    const spots = spotsOf(brandFile, kit, files)
    const written = []
    const skipped = []

    const pack = { name: brandFile?.name?.value ?? undefined, nameGiven: true, logo: {} }
    for (const side of ['light', 'dark']) {
      const spot = spots.find((s) => s.where === 'header' && s.side === side)
      if (spot) pack.logo[side] = spot.bytes
    }
    if (brandFile?.favicon?.ico) pack.favicon = files.read(brandFile.favicon.ico)
    const quick = { tag: site.quickstart_tag ?? null, version: site.quickstart_version ?? null }
    let done
    try {
      done = await deps.setSiteBrand({
        platform: site.platform,
        siteKey,
        release: quick.tag ? quick : null,
        pack,
        call: door,
        applyId: id,
        note: () => {}
      })
    } catch (error) {
      throw new RealPageWriteError('brand', said(error))
    }
    written.push(...done.written)
    skipped.push(...done.skipped)
    if (done.skipped.length)
      throw new RealPageWriteError('brand', done.skipped.map((s) => `${s.where}: ${s.reason}`).join('; '))

    const menu = await menuPictures({ spots, upload, call, id, kit, written }).catch((error) => {
      throw new RealPageWriteError('menu-logo', said(error))
    })
    await headStep({ brandFile, files, kit, upload, call, id, menu, written }).catch((error) => {
      throw new RealPageWriteError('head', said(error))
    })
    await accentStep({ brandFile, files, kit, site, deps, written }).catch((error) => {
      throw new RealPageWriteError('accent', said(error))
    })
    return { site: { label: site.label, siteKey }, applyId: id, written, skipped }
  }
}

/** The brand file's spots joined with the kit's: where, side and the picture's bytes. */
function spotsOf(brandFile, kit, files) {
  const byId = new Map((brandFile?.logo?.spots ?? []).map((s) => [s.spot, s]))
  return (kit?.doc?.site?.logoSpots ?? kit?.site?.logoSpots ?? []).flatMap((k) => {
    const s = byId.get(k.id)
    if (!s?.file || !files.has(s.file)) return []
    return [{ id: k.id, where: k.where, side: k.ground.side, shows: s.shows, bytes: files.read(s.file) }]
  })
}

// The phone menu shows the spot's own picture through the T4 small-logo settings; the CSS fallback is answered back
// (`menu.css`) when the profile has no such setting. `menu.mark` says which role the picture got (judge reads it).
async function menuPictures({ spots, upload, call, id, kit, written }) {
  const menuSpots = spots.filter((s) => s.where === 'offcanvas')
  if (!menuSpots.length) return { css: null }
  const folder = templateFolderOf(kit)
  const paths = {}
  for (const s of menuSpots)
    paths[s.side] = await upload(s.shows === 'mark' ? 'menu-mark' : 'menu-logo', s.bytes)
  const read = folder ? await call('template.siteSettings', { template: folder }).catch(() => null) : null
  const byProfile = {}
  let supported = false
  for (const [name, entry] of Object.entries(read?.profiles ?? {})) {
    const have = entry?.settings ?? {}
    const values = {}
    if (paths.light && 'site_logo_small' in have) values.site_logo_small = paths.light
    if (paths.dark && 'site_logo_dark_small' in have) values.site_logo_dark_small = paths.dark
    if (Object.keys(values).length) byProfile[name] = values
  }
  if (Object.keys(byProfile).length) {
    await call('template.siteSettings', {
      operation: 'set',
      apply_id: id,
      template: folder,
      profiles: byProfile
    })
    written.push('menu-logo-small')
    supported = true
  }
  return { css: supported ? null : menuCssFor(paths) }
}

const templateFolderOf = (kit) => {
  const slug = String((kit?.doc ?? kit)?.quickstart?.product ?? '')
  return slug ? slug.replace(/-/g, '_') : null
}

async function headStep({ brandFile, files, kit, upload, call, id, menu, written }) {
  const moduleId = headModuleId(kit?.doc ?? kit)
  const fav = brandFile?.favicon
  if (!fav || moduleId === null)
    throw new Error('the kit names no head block, or the brand file has no favicon set')
  const paths = {
    ico: await upload('favicon-ico', files.read(fav.ico)),
    png32: await upload('favicon-32', files.read(fav.png32)),
    png512: await upload('favicon-512', files.read(fav.png512)),
    phone180: await upload('phone-180', files.read(fav.phone180))
  }
  const got = await call('content.get', { kind: 'module', id: moduleId })
  const item = got?.item ?? got
  const current = item?.content ?? item?.fields?.content ?? ''
  const next = withBlock(current, headBlock({ ...paths, menuCss: menu.css }))
  if (Buffer.byteLength(next) > 65535) throw new Error('the head block does not fit the block limit')
  await call('content.update', { kind: 'module', id: moduleId, apply_id: id, fields: { content: next } })
  written.push('head-block')
}

const MARKER = /tracy-ds-slot:\s*(brand:[0-9a-f]{6}-(?:[0-9a-f]{6})?-[0-9a-f]{6})/

async function accentStep({ brandFile, files, kit, site, deps, written }) {
  const file = brandFile?.colours?.module?.file
  if (!file) return // the safe version keeps the template's own accent: nothing to write
  const html = files.read(file).toString('utf8')
  const system = MARKER.exec(html)?.[1]
  const module = await deps.contractModule(kit)
  if (!system || !module)
    throw new Error('the accent module has no brand id, or the template has no module slot')
  const out = await deps.accentJob(site, { system, html, module })
  if (!out?.ok) throw new Error(out?.reason ?? 'the design system job failed')
  written.push('accent')
}
