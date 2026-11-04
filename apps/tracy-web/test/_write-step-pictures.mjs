// Fixtures for the picture stage of the write step: an invented picture package made of tiny generated images, a made-up
// kit that names a body background setting, and a fake site that answers what the stage calls. No real picture, template
// or version is used.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWriteStep } from '../src/write-step/write-step.js'
import { brandSite } from './_write-step-brand.mjs'
import { copy, KIT, plan, SITE } from './_write-step-run.mjs'

const ONE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/** A valid tiny picture of its own hash: bytes after a PNG's end are ignored by anything that draws it. */
export function picture(seed, size = 0) {
  const bytes = Buffer.concat([ONE_PIXEL, Buffer.from(seed), Buffer.alloc(size)])
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    bytes,
    entry: {
      sitePath: `images/tracy-content/${sha256}.png`,
      file: `files/${sha256}.png`,
      sha256,
      width: 1,
      height: 1
    }
  }
}

export const HERO = picture('hero')
export const FIGURE = picture('figure')
export const BACKGROUND = picture('background')
export const PREVIEW = picture('preview')

/** The package `exportPictureMapping` would give for the invented site, on the fixture kit's own contract. */
export const picturePackage = () => ({
  mapping: {
    contract: KIT().ref,
    revision: 'a label of the picture run, not the site',
    changes: {
      'module-2.pic': HERO.entry.sitePath,
      'article-7.5': HERO.entry.sitePath,
      'module-2.figure': FIGURE.entry.sitePath
    },
    evidence: {},
    pending: [],
    emptyLinks: []
  },
  uploads: [HERO.entry, FIGURE.entry],
  hidden: [
    { frame: 'block-2.gone', key: 'module-2.gone', reason: 'no picture of the owner fits this frame' }
  ],
  painted: [
    {
      frame: 'block-3.icon',
      key: 'module-3.icon',
      kind: 'icon',
      paint: { foreground: 'accent' },
      holds: 'light',
      draw: { icon: 'star', set: 'demo', weight: 'solid' },
      width: 1,
      height: 1,
      preview: PREVIEW.entry,
      previewDark: null
    },
    {
      frame: 'block-2.figure',
      key: 'module-2.figure',
      kind: 'backdrop',
      paint: { disc: 'surface', bands: 'accent' },
      holds: null,
      draw: { backdrop: { shape: 'disc' }, figure: FIGURE.entry.sitePath },
      width: 1,
      height: 1,
      preview: null,
      previewDark: null
    }
  ],
  siteSettings: [
    {
      frame: 'block-3.bg',
      writeDoor: 'none',
      source: 'drawn',
      ...BACKGROUND.entry,
      darkened: false,
      paint: null,
      preview: false,
      reason: 'drawn: no owner photo fits'
    }
  ],
  problems: []
})

const SITE_KEYS = [
  'module-2.pic',
  'article-7.5',
  'module-2.figure',
  'module-2.gone',
  'module-3.icon',
  'module-88.0',
  'module-88.1'
]

/** The made-up kit, with the setting one body background goes through. */
export function pictureKit(extraSite = {}) {
  const kit = KIT()
  kit.doc.site = {
    ...kit.doc.site,
    settingSlots: [
      {
        id: 'site.body-background',
        kind: 'template-background',
        writable: true,
        writeTo: { action: 'template.siteSettings', template: 'demo_gym', key: 'body_bg_img' },
        frames: ['block-3.bg', 'block-4.bg']
      }
    ],
    ...extraSite
  }
  return kit
}

/**
 * The brand fake with what the picture stage asks on top: the plugin's version, a `fields` settings write, and refusals
 * per uploaded path. `moves` makes the settings write move the revision.
 */
export function pictureSite({
  component = '9.9.9',
  refusePath = {},
  moves = false,
  throwsOn,
  contract = {},
  settings
} = {}) {
  const site = brandSite({
    settings,
    contract: { extraKeys: SITE_KEYS, ...contract }
  })
  const inner = site.door
  const profiles = site.state.profiles
  let revision = 'rev-1'
  const door = {
    async apply(call) {
      if (call.action === 'media.upload' && throwsOn === 'media.upload')
        throw new Error('connect ECONNREFUSED')
      if (call.action === 'info') {
        site.log.push(call)
        return { ok: true, info: { component } }
      }
      if (call.action === 'media.upload' && refusePath[call.params.path]) {
        site.log.push(call)
        return refusePath[call.params.path]
      }
      if (call.action === 'template.siteSettings' && call.params.operation === 'set' && call.params.fields) {
        site.log.push(call)
        for (const entry of Object.values(profiles)) Object.assign(entry.settings, call.params.fields)
        if (moves) revision = 'rev-after-settings'
        return { ok: true }
      }
      const answer = await inner.apply(call)
      const inspected = call.action === 'content.contract' && call.params.operation === 'inspect'
      return inspected && answer.ok ? { ...answer, revision } : answer
    }
  }
  return { ...site, door }
}

/** Frozen files with a picture package and its files beside it. A file named in `missing` is not written. */
export function frozenWithPictures({
  pictures = picturePackage(),
  planFile = plan(),
  copyFile = copy(),
  files: bytesOf = [HERO, FIGURE, BACKGROUND, PREVIEW],
  missing = []
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-pictures-'))
  const put = (name, value) => {
    const where = path.join(dir, name)
    mkdirSync(path.dirname(where), { recursive: true })
    writeFileSync(where, value)
    return where
  }
  for (const { bytes, entry } of bytesOf) if (!missing.includes(entry.file)) put(entry.file, bytes)
  return {
    dir,
    files: {
      plan: put('plan.json', JSON.stringify(planFile)),
      copy: put('copy.json', JSON.stringify(copyFile)),
      pictures: put('mapping.json', JSON.stringify(pictures))
    },
    done: () => rmSync(dir, { recursive: true, force: true })
  }
}

/** The entry point with a picture package on the fake site. */
export async function runPictures({ files = {}, site: siteOver = {}, kit = pictureKit(), deps = {} } = {}) {
  const site = pictureSite(siteOver)
  const frozen = frozenWithPictures(files)
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap: null,
      files: frozen.files,
      sleep: async () => {},
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
