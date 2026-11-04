// Fixtures for the brand stage of the write step: an invented brand file with its pictures, a made-up kit that declares
// the logo spots, the name slots, the favicon setting and the head block, and a fake site that answers the plugin
// actions the brand stage calls. Nothing here is a real business, template or picture.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy, fakeSite, KIT, plan, SITE } from './_write-step-run.mjs'

export const NAME = 'Quay Fitness Studio'
export const ACCENT_HTML =
  '<style id="tracy-ds-slot">/* tracy-ds-slot: brand:accent-only-0f7a6b */ :root{}</style>'

const spotFile = (id) => `spots/${id}.png`
const SPOTS = [
  ['logo-header-1', 'logo'],
  ['logo-header-2', 'logo'],
  ['logo-offcanvas-1', 'mark'],
  ['logo-offcanvas-2', 'mark'],
  ['logo-footer-1', 'logo']
]

export const brandFile = () => ({
  kind: 'brand-file',
  version: 10,
  kit: 'demo-gym@1.0.0',
  name: {
    value: NAME,
    from: 'brief.brand.name',
    slots: [
      {
        id: 'setting:global configuration sitename',
        kind: 'setting',
        where: 'cms',
        status: 'written',
        value: NAME
      },
      {
        id: 'setting:template site setting site_name (templates/demo_gym/etc/site/default.json)',
        kind: 'setting',
        where: 'template',
        status: 'written',
        value: NAME
      },
      { id: 'slot:block-88.0', kind: 'slot', where: 'block-88.0', status: 'written', value: NAME },
      {
        id: 'printed:title-attribute:header',
        kind: 'printed',
        where: 'title-attribute',
        status: 'written',
        value: NAME
      },
      {
        id: 'printed:document-title:page',
        kind: 'printed',
        where: 'document-title',
        status: 'handed-off',
        value: null,
        handOff: 'writer'
      }
    ]
  },
  colours: {
    decision: 'new-accent',
    accent: '#0f7a6b',
    module: {
      file: 'module-build-1.html',
      bytes: ACCENT_HTML.length,
      slot: 'joomla-demo-gym-modes@abc1234567'
    }
  },
  logo: {
    spots: SPOTS.map(([spot, shows]) => ({
      spot,
      shows,
      file: spotFile(spot),
      writable: spot !== 'logo-footer-1'
    }))
  },
  favicon: {
    ico: 'favicon/favicon.ico',
    png32: 'favicon/favicon-32.png',
    png512: 'favicon/favicon-512.png',
    phone180: 'favicon/apple-touch-icon-180.png'
  },
  ownerTasks: []
})

const kitSpot = (id, where, side, setting, frameId) => ({
  id,
  frameId,
  where,
  ground: { colour: side === 'light' ? '#ffffff' : '#111111', side },
  setting
})

/** The made-up kit, with what a brand file needs from it. */
export function brandKit() {
  const kit = KIT()
  kit.doc.quickstart = { product: 'demo-gym', version: '1.0.0' }
  kit.doc.blocks = [
    ...kit.doc.blocks,
    {
      id: 'block-88',
      role: 'footer',
      slots: [],
      lists: [],
      demoOwned: [
        { id: 'block-88.0', role: 'business.name' },
        { id: 'block-88.1', role: 'business.logo' }
      ]
    }
  ]
  kit.doc.site = {
    ...kit.doc.site,
    logoSpots: [
      kitSpot('logo-header-1', 'header', 'light', 'site_logo', 'siteSetting-1.0'),
      kitSpot('logo-header-2', 'header', 'dark', 'site_logo_dark', 'siteSetting-2.0'),
      kitSpot('logo-offcanvas-1', 'offcanvas', 'light', 'site_logo', 'siteSetting-1.0'),
      kitSpot('logo-offcanvas-2', 'offcanvas', 'dark', 'site_logo_dark', 'siteSetting-2.0'),
      kitSpot('logo-footer-1', 'footer', 'dark', null, 'block-88.1')
    ],
    favicon: { mechanism: { setting: 'template site setting other_faviconFile' } },
    nameSlots: [{ kind: 'setting', setting: 'template site setting site_name (a file)' }],
    head: { injection: { maxBytes: 65535, position: { block: 'block-88' } } }
  }
  return kit
}

const SMALL_ON = { site_logo: 'a', site_logo_dark: 'b', site_logo_small: 'c', site_logo_dark_small: 'd' }

/**
 * A site with the brand actions on top of the contract door of `fakeSite`. `refuse` maps an action (or
 * `content.update:<kind>`) to the answer it gets, once per call; `settings` is what the profile read answers, `busy` how
 * many times the first write answers `writer_busy`, `modules` what a module search lists. A write moves the revision, as
 * a module's content does on the real site.
 */
export function brandSite(over = {}) {
  const inner = fakeSite({ extraKeys: ['module-88.0', 'module-88.1'], ...over.contract })
  const log = []
  const uploads = new Map()
  const holds = { module: new Map([[88, '<a href="index.php"><img src="x.png"></a>']]) }
  const state = { identity: {}, profiles: over.settings ?? { default: { settings: SMALL_ON } } }
  let revision = 1
  let busy = over.busy ?? 0
  const refusal = (call) => over.refuse?.[`${call.action}:${call.params?.kind}`] ?? over.refuse?.[call.action]
  const door = {
    async apply(call) {
      log.push(call)
      if (over.throws === call.action) throw new Error('connect ECONNREFUSED')
      const { action, params } = call
      if (action === 'info') return inner.door.apply(call)
      if (action === 'content.contract') {
        const answer = await inner.door.apply(call)
        return params.operation === 'inspect' && answer.ok
          ? { ...answer, revision: `rev-${revision}` }
          : answer
      }
      if (action === 'content.get') return { ok: true, item: { content: holds.module.get(params.id) ?? '' } }
      if (action === 'content.list') return { ok: true, items: over.modules ?? [] }
      if (action === 'site.identity' && params.operation !== 'set')
        return { ok: true, fields: state.identity }
      if (action === 'template.siteSettings' && params.operation !== 'set')
        return refusal(call) ?? { ok: true, framework: 't4', profiles: state.profiles }
      if (params.operation === 'read') return { ok: false, error: 'unexpected_read' }
      if (busy > 0) {
        busy -= 1
        return { ok: false, error: 'writer_busy', message: 'another writer holds the site' }
      }
      const refused = refusal(call)
      if (refused) return refused
      if (action === 'media.upload') uploads.set(params.path, params.content_b64)
      if (action === 'site.identity') Object.assign(state.identity, params.fields)
      if (action === 'template.siteSettings')
        for (const [name, values] of Object.entries(params.profiles))
          Object.assign(state.profiles[name].settings, values)
      if (action === 'content.update') {
        revision += 1
        if (params.kind === 'module' && params.fields.content !== undefined)
          holds.module.set(params.id || 77, params.fields.content)
        return { ok: true, kind: params.kind, id: params.id || 77 }
      }
      return { ok: true }
    }
  }
  const writes = () =>
    log
      .filter((c) => c.action !== 'content.get' && c.action !== 'content.list')
      .filter(
        (c) =>
          c.params?.operation === 'set' || c.params?.operation === 'apply' || /update|upload/.test(c.action)
      )
  const of = (action, operation) =>
    log.filter((c) => c.action === action && (operation === undefined || c.params.operation === operation))
  /** The door the site check reads through: inspect names what each slot now holds. */
  const readDoor = {
    async apply(call) {
      const answer = await door.apply(call)
      if (call.action !== 'content.contract' || call.params.operation !== 'inspect') return answer
      const slots = answer.slots.map((s) => ({ ...s, current: inner.held[s.key] ?? '' }))
      return { ...answer, slots }
    }
  }
  return { door, readDoor, log, uploads, holds, state, writes, of, contract: inner }
}

/** The frozen files with a brand file and its pictures beside it. A picture named in `missing` is not written. */
export function frozenWithBrand({
  brand = brandFile(),
  planFile = plan(),
  copyFile = copy(),
  missing = [],
  module = ACCENT_HTML
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-brand-'))
  const put = (name, value) => {
    const where = path.join(dir, name)
    mkdirSync(path.dirname(where), { recursive: true })
    writeFileSync(where, value)
    return where
  }
  const files = {
    plan: put('plan.json', JSON.stringify(planFile)),
    copy: put('copy.json', JSON.stringify(copyFile)),
    brand: put('brand-file.json', typeof brand === 'string' ? brand : JSON.stringify(brand))
  }
  const pictures = [...SPOTS.map(([id]) => spotFile(id)), ...Object.values(brandFile().favicon)]
  for (const name of pictures)
    if (!missing.includes(name)) put(name, Buffer.from(`invented bytes of ${name}`))
  if (!missing.includes('module-build-1.html')) put('module-build-1.html', module)
  return { files, done: () => rmSync(dir, { recursive: true, force: true }) }
}

const PLACE = { title: 'Tracy design system', position: 'top-a', ordering: 0, style: 'System-none' }

/** The entry point with a brand file on the fake site; `line` finds a report line by its slot. */
export async function runBrand({ files = {}, site: siteOver = {}, deps = {} } = {}) {
  const site = brandSite(siteOver)
  const frozen = frozenWithBrand(files)
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit: brandKit(),
      contentMap: null,
      files: frozen.files,
      sleep: async () => {},
      accentPlace: async () => PLACE,
      ...deps
    })
    return {
      report,
      site,
      line: (slot) => report.slots.find((s) => s.slot === slot),
      parts: (part) => report.slots.filter((s) => s.part === part)
    }
  } finally {
    frozen.done()
  }
}
