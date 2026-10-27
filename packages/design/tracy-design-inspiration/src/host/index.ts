/**
 * The Node half of `@tracy/dsh-design-inspiration`: the 152 inspirations are FILES IN THE CONTAINER
 * (`/opt/tracy/design-systems`, one copy in the image for every lane), and a browser cannot read
 * a container's disk. This half hands them over, plus the two things the tab needs that are not
 * in the image: the site's own content the agent read in step 1, and the customer's choice.
 *
 *   GET  /api/tracy-design-inspiration/catalog                  slim index: id · name · category · nav · hero —
 *                                                          the site folder's `Brand/<host>/` inspirations first
 *   GET  /api/tracy-design-inspiration/systems/<id>/<file>      tokens.css · components.html · DESIGN.md, nothing else
 *   GET  /api/tracy-design-inspiration/site                     docs/agents/design-preview.json of the site folder
 *   POST /api/tracy-design-inspiration/choose  { id }           records the customer's pick into that file
 *   GET  /api/tracy-design-inspiration/systems/<id>/artifact-slots/<kind>  the slot map of one artifact (shared for the 152; the brand's own)
 *   GET  /api/tracy-design-inspiration/copy/<id>                docs/agents/design-copy/<id>.json — the content versions per chip (§4h)
 *   POST /api/tracy-design-inspiration/copy/<id>/pages/<chip>/versions { prompt? }   one more take by the model → 202 { job }
 *   GET  /api/tracy-design-inspiration/copy/<id>/jobs/<job>                            working · done { version } · failed { message }
 *   DELETE /api/tracy-design-inspiration/copy/<id>/pages/<chip>/versions/<vid>       forget one
 *   PUT  /api/tracy-design-inspiration/copy/<id>/pages/<chip>/selected { selected }  remember the customer's choice
 *
 * Plus TWO agent tools. `tracy_design_copy({ action: 'form' | 'write', id, chip, … })` is how the agent
 * writes the customer's words INTO an inspiration's layout (spec §4f, §4h): `form` hands it the slot map
 * with the length each slot allows, `write` validates and stores a `rewritten` version on one chip of
 * `design-copy/<id>.json`, which the dialog reads.
 *
 * THE MODEL IS CALLED FROM HERE for "More version" (§4h decision 4): `ctx.llm.stream` on the lane's own
 * default model (`ctx.agentDefaultModel.currentSelection()`), one user message, no tools, the answer
 * parsed by `copy.mjs`. Nothing goes through the chat. Every take is stored with its prompt, model
 * and token usage — the audit is the file. The call runs as a JOB the dialog polls: a take can run
 * past 30 s, and the lane's proxy answered 502 at exactly 30 s when the route waited for the model
 * (measured on lucaswp, 06/09) — so the POST answers at once and the answer arrives by GET.
 *
 * And `tracy_design_propose({ picks: [{ id, why }] })`: the agent's three
 * inspirations for this site. The call is what the chat draws the three hero cards from (client
 * half, `picks.ts`), so the proposal is data, not prose — and it lands in `design-preview.json`
 * as `picks` for the next turn to read.
 *
 * 🔒 THE FILE ROUTE IS THE ONE PLACE THIS PLUGIN COULD GO WRONG. `gallery.mjs` decides which file
 * from (catalog ids, id, file) with no filesystem involved; this file only carries the answer.
 *
 * HOLDS NO SECRET, KNOWS NO SEAT: everything served is either shared image content or the
 * customer's own site folder, and dsh's gateway already decided who may reach this lane.
 */

import crypto from 'node:crypto'
import { createReadStream, promises as fs, readFileSync, realpathSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { siteDirFor } from '@tracy/core/site-dir'
import { switchesAtTracy } from '@tracy/core/ui-switches'
import { buildBrandSystem, renderTypography } from '@tracy/od-brand-engine'
// The slot reader the build script and the brand engine use, bundled in by relative path (like
// tracy-brand-engine); `linkedom` behind it is a runtime dependency of this plugin.
import { slotsOf } from '../../../../../scripts/lib/od-slots-dom.mjs'
import ARTIFACT_SLOTS from './artifact-slots.json'
import type { CopyFile } from './copy.mjs'
import {
  addVersion,
  agentVersion,
  buildCopyPrompt,
  buildShortenPrompt,
  canonicalChip,
  chipLayout,
  DEFAULT_PROMPTS,
  emptyCopy,
  normalizeCopy,
  parseModelCopy,
  promptOf,
  removeVersion,
  selectVersion,
  versionId
} from './copy.mjs'
import {
  ARTIFACT_TYPES,
  BRAND_DIR,
  brandHostOf,
  brandRows,
  COPY_DIR,
  chosenId,
  copyFileName,
  fitScore,
  inlineBrandFonts,
  parseRoute,
  resolveBrandFile,
  resolveSystemFile,
  SITE_FILE,
  slimCatalog,
  slotLimits,
  SYSTEM_FILES,
  systemsDirFor,
  validPicks
} from './gallery.mjs'
import {
  designSystemsShownFromTracy,
  pictureType,
  quickstartCandidates,
  readPicture,
  readQuickstarts,
  templatesFromTracy,
  wearDesignTraits,
  withBrandPlatforms
} from './templates.mjs'
import { brandFromSystem, seedOverridesFromSystem } from './library-brand.mjs'
import { defaultLibraryCacheDir, openRemoteLibrary } from './library-remote.mjs'
import type { Config, HostContext, WebRoute } from './types.js'
import { resolveSitesRoot, siteRootOf } from '../../../../tools/tracy-subprocess-docker/src/route.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-design-inspiration'

/**
 * 🔒 Every `ctx.<name>` must be listed here. cordis throws the moment a property outside
 * `inject` is READ, so a missing name is not a warning but a dead plugin — dsh still boots, half
 * the interface is gone, no error, no log.
 */
export const inject = ['webServer', 'tools', 'llm', 'agentDefaultModel']

const PREFIX = '/api/tracy-design-inspiration'
const MAX_BODY = 4 * 1024

/** Where the catalog is, in order of preference: the image's link, then the dev machine's. */
function catalogCandidates(config: Config): string[] {
  const out: string[] = []
  if (config.catalog) out.push(config.catalog)
  out.push('/opt/tracy/design-catalog.json')
  const home = process.env.DSH_HOME
  if (home) out.push(path.join(home, 'design-catalog.json'))
  return out
}

interface Library {
  systems: ReturnType<typeof slimCatalog>
  ids: Set<string>
  /**
   * Where the files come from. `remote`: the public page's static files, cached on disk under the
   * vendor commit (tasks/todo-thu-vien-mot-cho.md) — the one place a design system is fixed in.
   * `image`: the copy in the lane's image, the road back when the lane has no network on first boot.
   */
  source:
    | { kind: 'remote'; url: string; commit: string; offline: boolean }
    | { kind: 'image'; systemsDir: string }
  /** One file of one system (the host's closed list, plus `slots.json`); null when neither side has it. */
  readFile: (id: string, file: string) => Promise<Buffer | null>
  /** The text slots of a system's fixture (`slots.json`); empty on an image without one. */
  slotsOf: (id: string) => Promise<SlotRecord[]>
  /** `tokens.css` per system, read on first use for the fit score. Content of one commit: never stale. */
  tokens: Map<string, string>
}

/** The page every lane reads the library from, unless `libraryUrl` says otherwise. */
const DEFAULT_LIBRARY_URL = 'https://cowork.tracy.ai/design-inspiration'

/**
 * A setting of this dsh: the process env first, then the password gate's env file — the same two
 * places, in the same order, `tracy-add-site` and `tracy-site-tools` read `MCP_TRACY_ORIGIN` from.
 */
function dshSetting(name: string): string | null {
  const value = process.env[name]?.trim()
  if (value) return value
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
  if (!file) return null
  try {
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(file, 'utf8'))
    return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

/**
 * The Tracy surface this lane belongs to.
 *
 * Read off `libraryUrl` when it is set, because that already names the surface this lane reads its
 * 152 systems from — one setting, not two that can disagree. A lane with `libraryUrl: false` (image
 * only) has no surface to ask and goes straight to the catalogue.
 * @param {{ libraryUrl?: string | false, tracyOrigin?: string }} config
 */
function tracyOrigin(config: { libraryUrl?: string | false; tracyOrigin?: string }): string | null {
  if (config.tracyOrigin) return config.tracyOrigin
  // This dsh's own Tracy, before the library's: the library is one public page for every
  // deployment (production's, by default), but `/api/templates` is answered from THIS
  // deployment's releases table and its live demos. Read the way `tracy-add-site` reads it —
  // the process env, then the password gate's env file the fleet writes. Measured 16/09: with
  // only the library origin, dev's gallery showed production's cards and production's demo
  // addresses, and a template released an hour earlier was on dev's own list and not on the grid.
  const own = dshSetting('MCP_TRACY_ORIGIN')
  if (own) return own.replace(/\/+$/, '')
  const url = config.libraryUrl === false ? null : (config.libraryUrl ?? DEFAULT_LIBRARY_URL)
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * The operator's switch for the chat route to a design system (`chat-design-system`, `/ops` › User
 * Interface; off by default since 11/10/2026 — David: the Design system button in the site browser
 * toolbar is the only way in). Off — or unreadable, which is off — the agent proposes no design
 * inspiration for the site (`tracy_design_propose`) and the preview dialog's pick is not recorded
 * (`POST …/choose`): both start a redesign of the running site in the chat. The library stays
 * readable and the copy tool keeps writing PREVIEW versions, neither of which changes a site.
 */
const CHAT_DS_SWITCH = 'chat-design-system'

/** What the agent is told instead: the sentence tracy-web's Design system door refuses with. */
const CHAT_ROUTE_OFF = {
  ok: false,
  code: 'CHAT_DESIGN_SYSTEM_OFF',
  error:
    'Proposing or applying a design system through the chat is turned off. Change nothing; tell the ' +
    'customer in one plain sentence, in their language, to use the Design system row on the ' +
    "site's start screen. A new site gets its design when it is created (Add site)."
} as const

/** Null while the chat route is on, else the refusal. */
async function chatRouteOff(config: Config): Promise<typeof CHAT_ROUTE_OFF | null> {
  const on = await switchesAtTracy(tracyOrigin(config))
  return on?.(CHAT_DS_SWITCH) === true ? null : CHAT_ROUTE_OFF
}

/**
 * What the three chat tools answer for a design system while Tracy's switch is off — or cannot be
 * read, which is off. Null when the switch is on.
 *
 * The library is not offered; the agent is handed the finished templates published RIGHT NOW,
 * read at call time from the same door the tab reads. No template is named in code or in the
 * skill: a Publish or an Unpublish reaches the chat with no edit and no release. The agent gets
 * words, never cards — the chat draws no template card.
 */
async function designSystemsOff(config: Config): Promise<Record<string, unknown> | null> {
  const origin = tracyOrigin(config)
  if (await designSystemsShownFromTracy(origin)) return null
  const rows = await templatesFromTracy(origin)
  return {
    ok: false,
    code: 'DESIGN_SYSTEMS_OFF',
    error:
      'Design systems are off: do not propose, read or preview one. Introduce the finished templates ' +
      'in `templates` (published right now) in a line or two each, and invite the customer to open ' +
      'Design templates to see them and create a site from one. brand:<host> design templates still work. ' +
      (rows === null
        ? 'templates is null: Tracy could not be asked — say so, and name no template.'
        : 'Name no template that is not in this list.'),
    templates:
      rows?.map(
        (r: {
          id: string
          name: string
          category: string
          platforms: string[]
          template?: { blurb?: string | null }
        }) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          platforms: r.platforms,
          blurb: r.template?.blurb ?? null
        })
      ) ?? null
  }
}
/** How often a running process asks the page whether the library moved. */
const LIBRARY_RECHECK_MS = 60_000

interface SlotRecord {
  id: string
  role: string
  words: number
  chars: number
  text: string
  inNav?: boolean
}

/**
 * The library: the public page first (cached on disk, so a lane that saw it once keeps it with no
 * network), the image's copy when the page cannot be reached and nothing is cached. `libraryUrl:
 * false` is the image only — the tests, and a machine that must not go out.
 */
async function loadLibrary(config: Config): Promise<Library | null> {
  if (config.libraryUrl !== false) {
    const url = config.libraryUrl ?? DEFAULT_LIBRARY_URL
    const remote = await openRemoteLibrary({ url, cacheDir: config.libraryCache ?? defaultLibraryCacheDir() })
    if (remote !== null) {
      const slotsCache = new Map<string, Promise<SlotRecord[]>>()
      return {
        systems: remote.systems,
        ids: remote.ids,
        source: { kind: 'remote', url: remote.url, commit: remote.commit, offline: remote.offline },
        readFile: (id, file) => remote.read(id, file),
        slotsOf: (id) => {
          let p = slotsCache.get(id)
          if (!p) {
            p = remote.read(id, 'slots.json').then((body) => {
              if (body === null) return []
              try {
                const parsed = JSON.parse(body.toString('utf8')) as { slots?: SlotRecord[] }
                return parsed.slots ?? []
              } catch {
                return []
              }
            })
            slotsCache.set(id, p)
          }
          return p
        },
        tokens: new Map()
      }
    }
    console.warn(
      `[tracy-design-inspiration] library at ${url} is unreachable and nothing is cached — falling back to the image copy`
    )
  }
  return loadImageLibrary(config)
}

/**
 * The image's copy of the catalog. It is image content: the only way it changes is a new image,
 * which is a new process.
 */
async function loadImageLibrary(config: Config): Promise<Library | null> {
  for (const candidate of catalogCandidates(config)) {
    let real: string
    try {
      real = realpathSync(candidate)
    } catch {
      continue
    }
    try {
      let dark: Record<string, { safe?: unknown }> | null = null
      try {
        const parsed = JSON.parse(await fs.readFile(path.join(path.dirname(real), 'dark.json'), 'utf8')) as {
          systems?: Record<string, { safe?: unknown }>
        }
        dark = parsed.systems ?? null
      } catch {
        dark = null
      }
      const systems = slimCatalog(JSON.parse(await fs.readFile(real, 'utf8')), dark)
      let slots: Record<string, { slots: unknown[] }> | null = null
      try {
        const parsed = JSON.parse(await fs.readFile(path.join(path.dirname(real), 'slots.json'), 'utf8')) as {
          systems?: Record<string, { slots: unknown[] }>
        }
        slots = parsed.systems ?? null
      } catch {
        slots = null
      }
      const systemsDir = systemsDirFor(real)
      const ids = new Set(systems.map((s) => s.id))
      return {
        systems,
        ids,
        source: { kind: 'image', systemsDir },
        readFile: async (id, file) => {
          if (!ids.has(id)) return null
          if (file !== 'slots.json' && !Object.hasOwn(SYSTEM_FILES, file)) return null
          try {
            return await fs.readFile(path.join(systemsDir, id, file))
          } catch {
            return null
          }
        },
        slotsOf: async (id) => (slots?.[id]?.slots as SlotRecord[] | undefined) ?? [],
        tokens: new Map()
      }
    } catch (error) {
      console.warn(`[tracy-design-inspiration] catalog at ${real} is not readable: ${String(error)}`)
    }
  }
  return null
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

/**
 * The site this lane serves, from the env file the lane was created with (`MCP_TRACY_SITE_KEY`).
 * Read lazily and once — the same rule as `tracy-brand-engine`.
 */
let siteKey: string | null | undefined
function laneSiteKey(): string | null {
  if (siteKey !== undefined) return siteKey
  siteKey = process.env.MCP_TRACY_SITE_KEY?.trim() || null
  if (siteKey === null) {
    const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
    if (file) {
      try {
        const m = /^MCP_TRACY_SITE_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))
        siteKey = m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null
      } catch {
        siteKey = null
      }
    }
  }
  return siteKey
}

/**
 * The site folder: `config.siteDir` wins; otherwise where dsh stands (same rule as webroot-read).
 *
 * The HTTP handler never reads this off the plugin's own `config`: one dsh serves every site of a
 * host (ADR 0014) and stands at the sites ROOT, so it scopes `config` per request first —
 * `siteDirFor(config, req)` reads the folder the gate stamped for the caller's seat — and every
 * function below receives that scoped copy. It is the same rule `tracy-brand-engine` writes by;
 * the filesystem is the contract between the two, so they must not each decide differently.
 */
const siteDirOf = (config: Config): string => config.siteDir ?? path.resolve('.')

/**
 * ONE CONVERSATION, ONE SITE — for the agent's tools. The HTTP doors scope by the gate's header
 * (`siteDirFor`); a tool call has no request, so it scopes by its session's `header.cwd`, through the
 * path fence's own `siteRootOf`. A folder outside the sites root (the `/new/` creation workspace) is
 * its own; the sites root itself is no site (null). No cwd, or a bundle-set `siteDir`: as before.
 */
function scopedTo(config: Config, place: unknown): Config | null {
  if (config.siteDir !== undefined || typeof place !== 'string' || place === '') return config
  const root = resolveSitesRoot(undefined)
  if (place !== root && !place.startsWith(`${root}/`)) return { ...config, siteDir: place }
  try {
    return { ...config, siteDir: siteRootOf(place, root) }
  } catch {
    return null
  }
}
function siteFile(config: Config): string {
  return path.join(siteDirOf(config), SITE_FILE)
}

/**
 * The brand inspirations in the site folder, read on EVERY request — unlike the image, this folder
 * changes while the process runs (the customer presses Extract). A handful of directories and one
 * small JSON each; not worth a cache that could go stale.
 */
async function readBrands(config: Config): Promise<ReturnType<typeof brandRows>> {
  const root = path.join(siteDirOf(config), BRAND_DIR)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const found: { dir: string; manifest: unknown }[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      found.push({
        dir: e.name,
        manifest: JSON.parse(await fs.readFile(path.join(root, e.name, 'manifest.json'), 'utf8'))
      })
    } catch {
      /* an extraction in progress, or a failed one: not an inspiration yet */
    }
  }
  return brandRows(found)
}

/** Every id a request may name: the image's catalog plus the brands present right now. */
function allIds(l: Library, brands: ReturnType<typeof brandRows>): Set<string> {
  return brands.length === 0 ? l.ids : new Set([...l.ids, ...brands.map((b) => b.id)])
}

/** The slot map of an inspiration: the image's `slots.json` for a system, the brand's own file for `brand:<host>`. */
async function slotsFor(l: Library, config: Config, id: string): Promise<SlotRecord[]> {
  const host = brandHostOf(id)
  if (host !== null) {
    try {
      const parsed = JSON.parse(
        await fs.readFile(path.join(siteDirOf(config), BRAND_DIR, host, 'slots.json'), 'utf8')
      ) as { slots?: SlotRecord[] }
      return parsed.slots ?? []
    } catch {
      return []
    }
  }
  return l.slotsOf(id)
}

/**
 * The six sample products of a LIBRARY inspiration, built here with the brand engine instead of read
 * from the image: upstream ships one 6 KB hero card per kind, the same skeleton for all six (measured
 * 06/09 on Airbnb, Revolut and upstream `main`), while the engine builds what a customer's own brand
 * gets in Brand builder — a full landing page, an eleven-slide deck, a 3:4 poster, a form. The brand
 * is read off the inspiration's own tokens.css, DESIGN.md and catalog row; built once per process, since
 * the inputs are image content. `null` for a brand inspiration (its files are on disk) or an unknown id.
 */
const builtArtifacts = new Map<
  string,
  Promise<{ html: Record<string, string>; slots: Record<string, SlotRecord[]> } | null>
>()
function libraryArtifacts(
  l: Library,
  config: Config,
  id: string
): Promise<{ html: Record<string, string>; slots: Record<string, SlotRecord[]> } | null> {
  if (brandHostOf(id) !== null || !l.ids.has(id)) return Promise.resolve(null)
  let p = builtArtifacts.get(id)
  if (!p) {
    p = (async () => {
      const row = l.systems.find((s) => s.id === id)
      const tokensCss = await tokensFor(l, config, id)
      if (!row || tokensCss === null) return null
      // No DESIGN.md: the tagline falls back to the category.
      const designMd = (await l.readFile(id, 'DESIGN.md'))?.toString('utf8') ?? ''
      const system = buildBrandSystem(
        brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd }),
        {
          slug: id,
          // The inspiration's own text-on-accent; the engine derives one by contrast otherwise.
          seed: seedOverridesFromSystem({ tokensCss })
        }
      )
      // The seventh product is Tracy's: the specimen with the inspiration's DESIGN.md in its own tokens.
      system.files['artifacts/typography.html'] = renderTypography(
        brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd }),
        system.themes.default,
        { designMd }
      )
      const html: Record<string, string> = {}
      const slots: Record<string, SlotRecord[]> = {}
      for (const kind of ARTIFACT_TYPES) {
        const file = system.files[`artifacts/${kind}.html`]
        if (typeof file !== 'string') continue
        html[kind] = file
        slots[kind] = slotsOf(file, []) as SlotRecord[]
      }
      return { html, slots }
    })().catch((error) => {
      console.warn(
        `[tracy-design-inspiration] could not build the sample products of ${id}: ${String(error)}`
      )
      builtArtifacts.delete(id)
      return null
    })
    builtArtifacts.set(id, p)
  }
  return p
}

/**
 * The slot map of one artifact of an inspiration: the brand's own file for `brand:<host>` (its engine run
 * measured them), the shared template map bundled here for the 152 (`artifact-slots.json`, built by
 * scripts/build-od-slots.mjs from one system — one shape across all of them). `null` for a kind that
 * is not an artifact.
 */
async function artifactSlotsFor(
  config: Config,
  id: string,
  type: string,
  l: Library | null = null
): Promise<SlotRecord[] | null> {
  if (!ARTIFACT_TYPES.includes(type)) return null
  const host = brandHostOf(id)
  if (host !== null) {
    try {
      const parsed = JSON.parse(
        await fs.readFile(path.join(siteDirOf(config), BRAND_DIR, host, 'artifact-slots.json'), 'utf8')
      ) as { artifacts?: Record<string, SlotRecord[]> }
      return parsed.artifacts?.[type] ?? []
    } catch {
      return []
    }
  }
  if (l && l.source.kind === 'remote') {
    const measured = await remoteArtifactSlots(l, id, type)
    if (measured !== null) return measured
  }
  const built = l ? await libraryArtifacts(l, config, id) : null
  if (built?.slots[type]) return built.slots[type]
  return ((ARTIFACT_SLOTS as { artifacts: Record<string, SlotRecord[]> }).artifacts[type] ??
    []) as SlotRecord[]
}

/** The slots of a prebuilt artifact on the page, measured once per id/kind for the life of the library. */
const remoteSlots = new WeakMap<Library, Map<string, Promise<SlotRecord[] | null>>>()
function remoteArtifactSlots(l: Library, id: string, type: string): Promise<SlotRecord[] | null> {
  let map = remoteSlots.get(l)
  if (!map) {
    map = new Map()
    remoteSlots.set(l, map)
  }
  const key = `${id}/${type}`
  let p = map.get(key)
  if (!p) {
    // The page ships the measured map beside each prebuilt artifact; an older page (no such
    // file) is measured here from the artifact itself, the same numbers a little later.
    p = l.readFile(id, `artifact-slots/${type}.json`).then(async (measured) => {
      if (measured !== null) {
        try {
          const parsed = JSON.parse(measured.toString('utf8')) as { slots?: SlotRecord[] }
          if (Array.isArray(parsed.slots)) return parsed.slots
        } catch {
          // fall through to measuring
        }
      }
      const body = await l.readFile(id, `system/artifacts/${type}.html`)
      return body === null ? null : (slotsOf(body.toString('utf8'), []) as SlotRecord[])
    })
    map.set(key, p)
  }
  return p
}

/** `tokens.css` of an inspiration, for the fit score — image systems cached for the process, brands re-read. */
async function tokensFor(l: Library, config: Config, id: string): Promise<string | null> {
  const host = brandHostOf(id)
  if (host !== null) {
    try {
      return await fs.readFile(path.join(siteDirOf(config), BRAND_DIR, host, 'tokens.css'), 'utf8')
    } catch {
      return null
    }
  }
  const hit = l.tokens.get(id)
  if (hit !== undefined) return hit
  const body = await l.readFile(id, 'tokens.css')
  if (body === null) return null
  const css = body.toString('utf8')
  l.tokens.set(id, css)
  return css
}

/**
 * Catalog rows with a `fit` each, once the customer's OWN brand exists (spec §4f slice 3): how close a
 * inspiration sits to the brand — accent hue, canvas lightness, display face. Without a brand the rows
 * go out as they are and the library keeps its alphabetical order.
 */
async function withFit(
  l: Library,
  config: Config,
  brands: ReturnType<typeof brandRows>,
  rows: ReturnType<typeof slimCatalog>
): Promise<(ReturnType<typeof slimCatalog>[number] & { fit?: number })[]> {
  const own = brands.find((b) => b.category === 'Your brand')
  if (!own) return rows
  const brandTokens = await tokensFor(l, config, own.id)
  if (brandTokens === null) return rows
  const out = []
  for (const row of rows) {
    const css = row.id === own.id ? brandTokens : await tokensFor(l, config, row.id)
    out.push(css === null ? row : { ...row, fit: fitScore(brandTokens, css) })
  }
  return out
}

/**
 * The copy file of one inspiration — `design-copy/<id>.json` in the site folder (§4f contract), and
 * `<id>.<lang>.json` for each EXTRA language a multi-language site was built in.
 *
 * `lang` is `''` for the site's own first language, whatever that language is. Everything below
 * carries it rather than reading `file.lang`: a file's `lang` says what language its words are in,
 * which is not the same question as which of a site's files it is.
 */
function copyPath(config: Config, id: string, lang = ''): string {
  return path.join(siteDirOf(config), COPY_DIR, copyFileName(id, lang))
}

async function readCopy(config: Config, id: string, lang = ''): Promise<CopyFile | null> {
  try {
    return normalizeCopy(JSON.parse(await fs.readFile(copyPath(config, id, lang), 'utf8')), id)
  } catch {
    return null
  }
}

/**
 * Two "More version" presses on two chips of one inspiration land in the same file: writes to one
 * inspiration queue behind each other so neither read-modify-write loses the other's version.
 */
const queues = new Map<string, Promise<unknown>>()
function withCopy<T>(
  config: Config,
  id: string,
  lang: string,
  fn: (file: CopyFile) => Promise<T>
): Promise<T> {
  // One queue per FILE, not per inspiration: two languages of one inspiration are two files and
  // must not wait on each other.
  const key = `${id}\u0000${lang}`
  const prev = queues.get(key) ?? Promise.resolve()
  const read = async () => (await readCopy(config, id, lang)) ?? emptyCopy(id, lang || 'en')
  const next = prev.then(
    async () => fn(await read()),
    async () => fn(await read())
  )
  queues.set(key, next)
  return next
}

async function writeCopy(config: Config, file: CopyFile, lang = ''): Promise<boolean> {
  try {
    await fs.mkdir(path.join(siteDirOf(config), COPY_DIR), { recursive: true })
    await fs.writeFile(copyPath(config, file.system, lang), `${JSON.stringify(file, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

async function readSite(config: Config): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(siteFile(config), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * One take from the lane's default model: a system prompt, one user message, the text deltas joined.
 * Failures come back as a status the route answers with — the dialog shows the message, nothing retries.
 */
async function callModel(
  ctx: HostContext,
  prompt: { system: string; user: string }
): Promise<
  | {
      ok: true
      text: string
      model: string
      usage: { inputTokens: number; outputTokens: number } | null
      finish: string
    }
  | { ok: false; status: number; code: string; message: string }
> {
  let selection: { provider: string; model: string; reasoningEffort?: string }
  try {
    selection = ctx.agentDefaultModel.currentSelection()
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: 'NO_MODEL',
      message: `No default model on this lane: ${String(error)}`
    }
  }
  const model = `${selection.provider}/${selection.model}`
  // Copy needs no chain of thought, and a reasoning model spends the budget on one (lucaswp, 06/09:
  // deepseek-v4-flash, `max-tokens`, 0 characters). The lane's own effort is for the agent's chat,
  // not for this call: with the lane at `high` the same 0 characters came back through 16k tokens
  // (Lee's lane, 09/09, deepseek-v4-flash-vision-exp). So always `off` — and an adapter that does
  // not know `off` gets the call again without it.
  const effort = 'off'
  const first = await streamOnce(ctx, selection, effort, prompt)
  if (!first.ok && first.code === 'MODEL_FAILED' && /UNSUPPORTED_REASONING_EFFORT/.test(first.detail)) {
    const again = await streamOnce(ctx, selection, undefined, prompt)
    return again.ok ? { ...again, model } : again
  }
  return first.ok ? { ...first, model } : first
}

async function streamOnce(
  ctx: HostContext,
  selection: { provider: string; model: string },
  reasoningEffort: string | undefined,
  prompt: { system: string; user: string }
): Promise<
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } | null; finish: string }
  | { ok: false; status: number; code: string; message: string; detail: string }
> {
  let text = ''
  // An adapter that hands whole blocks instead of deltas still ends every text block with `block-end`.
  let blockText = ''
  let finish = 'none'
  let usage: { inputTokens: number; outputTokens: number } | null = null
  try {
    const stream = ctx.llm.stream({
      provider: selection.provider,
      model: selection.model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      system: prompt.system,
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: prompt.user }],
          source: { kind: 'user' }
        }
      ],
      temperature: 0.8,
      maxTokens: MODEL_MAX_TOKENS
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'block-end') {
        const block = chunk.block as { type?: string; text?: string } | undefined
        if (block?.type === 'text' && typeof block.text === 'string') blockText += block.text
      } else if (chunk.type === 'usage')
        usage = { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens }
      else if (chunk.type === 'finish') {
        finish = chunk.reason.kind
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
          const failure = chunk.reason.failure
          return {
            ok: false,
            status: 502,
            code: 'MODEL_FAILED',
            message: failure?.message ?? chunk.reason.kind,
            detail: `${failure?.code ?? ''} ${failure?.message ?? ''}`
          }
        }
      }
    }
  } catch (error) {
    return { ok: false, status: 502, code: 'MODEL_FAILED', message: String(error), detail: String(error) }
  }
  return { ok: true, text: text !== '' ? text : blockText, usage, finish }
}

/**
 * Room for ~30 slots of copy plus a title and a prompt, as JSON — AND the thinking of a reasoning model:
 * on lucaswp (deepseek-v4-flash, 06/09) 4000 tokens ended in `max-tokens` with 0 characters of answer,
 * the whole budget gone to reasoning.
 */
const MODEL_MAX_TOKENS = 16_000

/** One take in flight or just finished; `state` is what the dialog polls for. */
type CopyJob =
  | { state: 'working'; at: number }
  | {
      state: 'done'
      at: number
      version: CopyFile['pages'][string]['versions'][number]
      nextPrompt: string | null
    }
  | { state: 'failed'; at: number; code: string; message: string }
/** Finished jobs are kept this long for a poll that comes late; the file holds the version anyway. */
const JOB_TTL_MS = 10 * 60 * 1000
const jobs = new Map<string, CopyJob>()
function sweepJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) if (job.state !== 'working' && job.at < cutoff) jobs.delete(id)
}

export function apply(ctx: HostContext, bundleConfig: Config = {}): void {
  let library: Promise<Library | null> | null = null
  let checkedAt = 0
  const lib = (): Promise<Library | null> => {
    library ??= loadLibrary(bundleConfig).then((l) => {
      checkedAt = Date.now()
      return l
    })
    return library
  }
  /**
   * The catalog open asks the page again, at most once a minute, whether the library moved: a
   * fix deployed to the page reaches a running lane on the next open, not on the next restart.
   * A move is a new Library (new commit, empty token cache) and the built sample products go.
   */
  const libFresh = async (): Promise<Library | null> => {
    const current = await lib()
    if (current === null || current.source.kind !== 'remote' || Date.now() - checkedAt < LIBRARY_RECHECK_MS)
      return current
    checkedAt = Date.now()
    const next = await loadLibrary(bundleConfig)
    if (next === null) return current
    if (
      next.source.kind === 'remote' &&
      !next.source.offline &&
      next.source.commit !== current.source.commit
    ) {
      console.log(
        `[tracy-design-inspiration] library moved ${current.source.commit} → ${next.source.commit} (${next.systems.length} systems)`
      )
      builtArtifacts.clear()
      library = Promise.resolve(next)
      return next
    }
    return current
  }

  const route: WebRoute = {
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      // Which site this caller stands on — from the gate's header, not from where dsh stands.
      const scoped: Config = { ...bundleConfig, siteDir: siteDirFor(bundleConfig, req) }
      const parsed = parseRoute(PREFIX, req.method ?? 'GET', req.url ?? '')
      if (parsed === null) {
        writeJson(res, 404, { code: 'UNKNOWN_ROUTE' })
        return
      }
      void (parsed.kind === 'catalog' ? libFresh() : lib()).then(async (l) => {
        if (l === null) {
          // No catalog on this machine: say so, in one code the client can show as one sentence.
          writeJson(res, 503, { code: 'NO_LIBRARY' })
          return
        }
        switch (parsed.kind) {
          case 'catalog': {
            // Brands first (own, then references), then the templates (finished sites, by their
            // publisher), then the 152 when Tracy's switch offers them. `no-store`: the Brand/ folder changes under a running
            // process, and 15 KB per open of the tab is cheap. `library` tells the browser where
            // to read the 152's files itself (the page, versioned by commit) — null on an
            // image-only lane, where the host serves them.
            const brands = await readBrands(scoped)
            // 🔒 TRACY IS THE ONLY SOURCE OF A TEMPLATE CARD, and there is no road back on purpose
            // (Lee, 16/09). A card is published and unpublished with one press on the operations
            // screen; a second copy travelling in the image would need a commit and an image build
            // to follow each press, so an Unpublish would keep drawing the card it had removed.
            // Whether the 152 are offered is Tracy's switch, and a switch that cannot be read is
            // off. A lane that cannot reach Tracy therefore shows its brands and nothing else —
            // the honest state, since the create door is Tracy's too.
            const origin = tracyOrigin(bundleConfig)
            // The Design system panel asks with `?systems=all` (`parseRoute`): its library is the
            // systems Tracy's apply door can put on the site, whatever the gallery's switch says.
            const panel = 'systems' in parsed && parsed.systems === 'all'
            const [templates, systemsShown] = await Promise.all([
              // A card wearing a catalogue system filters by that system's traits (Lee, 29/09).
              templatesFromTracy(origin).then((rows) => wearDesignTraits(rows ?? [], l.systems)),
              panel ? Promise.resolve(true) : designSystemsShownFromTracy(origin)
            ])
            // A brand's Create buttons light only where a published quickstart can wear it.
            const brandCards = withBrandPlatforms(brands, templates as never[])
            const systems = await withFit(l, scoped, brandCards, [
              ...brandCards,
              ...(templates as never[]),
              ...(systemsShown ? l.systems : [])
            ])
            const library = l.source.kind === 'remote' ? { url: l.source.url, commit: l.source.commit } : null
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store'
            })
            res.end(JSON.stringify({ count: systems.length, systems, library }))
            return
          }
          case 'template': {
            const quickstarts = await readQuickstarts(quickstartCandidates(bundleConfig.quickstarts))
            const bytes = quickstarts ? await readPicture(quickstarts.dir, parsed.id, parsed.file) : null
            if (bytes === null) {
              writeJson(res, 404, { code: 'NO_PICTURE' })
              return
            }
            res.writeHead(200, {
              'content-type': pictureType(parsed.file),
              'cache-control': 'public, max-age=3600'
            })
            res.end(bytes)
            return
          }
          case 'system': {
            const host = brandHostOf(parsed.id)
            if (host !== null) {
              // A brand inspiration: served from the site folder, never cached — Extract again rewrites it.
              const file =
                parsed.file === 'slots'
                  ? {
                      path: path.join(siteDirOf(scoped), BRAND_DIR, host, 'slots.json'),
                      type: 'application/json; charset=utf-8'
                    }
                  : resolveBrandFile(siteDirOf(scoped), host, parsed.file)
              if (file === null) {
                writeJson(res, 404, { code: 'NO_SUCH_FILE' })
                return
              }
              try {
                if (file.type.startsWith('text/html')) {
                  // Self-hosted faces become data: URLs — a srcDoc frame cannot reach `../fonts/`.
                  const fontsDir = path.join(siteDirOf(scoped), BRAND_DIR, host, 'fonts')
                  const html = inlineBrandFonts(await fs.readFile(file.path, 'utf8'), (name) => {
                    try {
                      return readFileSync(path.join(fontsDir, name))
                    } catch {
                      return null
                    }
                  })
                  res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' })
                  res.end(html)
                  return
                }
                const stat = await fs.stat(file.path)
                res.writeHead(200, {
                  'content-type': file.type,
                  'content-length': String(stat.size),
                  'cache-control': 'no-store'
                })
                createReadStream(file.path).pipe(res)
              } catch {
                writeJson(res, 404, { code: 'NO_SUCH_FILE' })
              }
              return
            }
            if (parsed.file === 'slots') {
              // Not a file of the system: a slice of Tracy's slots.json. An id outside the catalog is
              // refused the same way a file would be; an image without slots.json answers an empty list.
              if (!l.ids.has(parsed.id)) {
                writeJson(res, 404, { code: 'NO_SUCH_FILE' })
                return
              }
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'private, max-age=86400, immutable'
              })
              res.end(JSON.stringify({ slots: await l.slotsOf(parsed.id) }))
              return
            }
            const artifact = /^system\/artifacts\/([a-z]+)\.html$/.exec(parsed.file)?.[1]
            if (artifact && l.ids.has(parsed.id) && l.source.kind === 'image') {
              // On the image the vendored artifacts are upstream's 6 KB skeletons: build the real
              // ones here. The page ships them prebuilt (build-assets), so remote reads the file.
              const built = await libraryArtifacts(l, scoped, parsed.id)
              const html = built?.html[artifact]
              if (typeof html === 'string') {
                res.writeHead(200, {
                  'content-type': 'text/html; charset=utf-8',
                  'cache-control': 'private, max-age=86400, immutable'
                })
                res.end(html)
                return
              }
            }
            const file = resolveSystemFile('', l.ids, parsed.id, parsed.file)
            const body = file === null ? null : await l.readFile(parsed.id, parsed.file)
            if (file === null || body === null) {
              writeJson(res, 404, { code: 'NO_SUCH_FILE' })
              return
            }
            // Content of one commit never changes under a running process: let the browser keep it.
            res.writeHead(200, {
              'content-type': file.type,
              'content-length': String(body.length),
              'cache-control': 'private, max-age=86400, immutable'
            })
            res.end(body)
            return
          }
          case 'site': {
            const site = await readSite(scoped)
            // The site key rides along: the brand's own landing chip is named after it (§4h decision 8).
            writeJson(
              res,
              200,
              site === null ? { present: false } : { present: true, site, siteKey: laneSiteKey() }
            )
            return
          }
          case 'artifactSlots': {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: 'UNKNOWN_ID' })
              return
            }
            const slots = await artifactSlotsFor(scoped, parsed.id, parsed.type, l)
            if (slots === null) {
              writeJson(res, 404, { code: 'NO_SUCH_FILE' })
              return
            }
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store'
            })
            res.end(JSON.stringify({ slots }))
            return
          }
          case 'copy': {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: 'UNKNOWN_ID' })
              return
            }
            // Always a file, even before anything was written: the dialog needs the default prompts
            // either way. Never cached: a take may have landed a second ago.
            const copy =
              (await readCopy(scoped, parsed.id, parsed.lang)) ?? emptyCopy(parsed.id, parsed.lang || 'en')
            writeJson(res, 200, { ...copy, defaultPrompts: DEFAULT_PROMPTS })
            return
          }
          case 'copyVersionCreate': {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: 'UNKNOWN_ID' })
              return
            }
            const body = await readBody(req)
            const freshBrief = Boolean(
              body && typeof body === 'object' && 'freshBrief' in body && body.freshBrief === true
            )
            // Build's explicit brief belongs to a new customer/site. Neither the workspace's
            // site facts nor an earlier selected take may leak into that generation.
            const site = freshBrief ? null : await readSite(scoped)
            const sitePages = (site?.pages as { path?: unknown; type?: unknown }[] | undefined) ?? []
            parsed.chip = canonicalChip(parsed.chip, sitePages)
            const layout = chipLayout(parsed.chip, sitePages)
            if (layout === null) {
              writeJson(res, 404, { code: 'NO_SUCH_CHIP' })
              return
            }
            const slots =
              'artifact' in layout
                ? await artifactSlotsFor(scoped, parsed.id, layout.artifact, l)
                : await slotsFor(l, scoped, parsed.id)
            if (!slots || slots.length === 0) {
              writeJson(res, 404, { code: 'NO_SLOTS' })
              return
            }
            const before =
              (await readCopy(scoped, parsed.id, parsed.lang)) ?? emptyCopy(parsed.id, parsed.lang || 'en')
            const chip = before.pages[parsed.chip]
            const ask = promptOf(body, chip, layout.kind)
            if (!ask.ok) {
              writeJson(res, 400, { code: 'BAD_PROMPT', message: ask.error })
              return
            }
            const current = freshBrief
              ? {}
              : (chip?.versions.find((v) => v.id === chip.selected)?.slots ?? {})
            /**
             * Which language to write in.
             *
             * 🔒 THE REQUEST WINS. `?lang=vi` names the file being written, so it must also name
             * the language of the words in it — the preview's `site.lang` is the language of the
             * site that was READ, and letting it win would have every extra language come back in
             * English: a build that succeeds, a file that exists, and nothing to see in a log.
             */
            const lang =
              parsed.lang !== '' ? parsed.lang : typeof site?.lang === 'string' ? site.lang : before.lang
            const prompt = buildCopyPrompt({
              kind: layout.kind,
              chip: parsed.chip,
              prompt: ask.prompt,
              slots,
              current,
              site,
              lang,
              factsOnly: freshBrief
            })
            sweepJobs()
            const jobId = versionId()
            const job: CopyJob = { state: 'working', at: Date.now() }
            jobs.set(jobId, job)
            // Answer now; the take lands in the job (and the file) whenever the model is done.
            writeJson(res, 202, { ok: true, job: jobId })
            void (async () => {
              const answer = await callModel(ctx, prompt)
              if (!answer.ok) {
                Object.assign(job, { state: 'failed', code: answer.code, message: answer.message })
                return
              }
              const read = parseModelCopy(answer.text, slots)
              if (!read.ok) {
                // What came back, in the job and the log: an unusable answer is a prompt problem, and
                // it cannot be fixed without seeing it.
                const sample = answer.text.replace(/\s+/g, ' ').slice(0, 300)
                console.warn(
                  `[tracy-design-inspiration] model answer unusable (${answer.model}, finish ${answer.finish}, ${answer.text.length} chars): ${sample}`
                )
                Object.assign(job, {
                  state: 'failed',
                  code: 'MODEL_ANSWER_UNUSABLE',
                  message: `${read.error} (${answer.model}, ${answer.finish}, ${answer.text.length} chars)`,
                  sample
                })
                return
              }
              // Over the ceiling on some slots: one short second ask for those alone, then the cut
              // only for what is still over. A cut headline reads broken; a rewritten one reads.
              let slotsOut = read.slots
              let trimmed = read.trimmed
              let usage = answer.usage
              if (read.trimmed.length > 0) {
                const again = await callModel(ctx, buildShortenPrompt(read.over, slots, lang))
                if (again.ok) {
                  const short = parseModelCopy(again.text, slots)
                  if (short.ok) {
                    slotsOut = { ...slotsOut, ...short.slots }
                    trimmed = read.trimmed.filter((id) => !(id in short.slots) || short.trimmed.includes(id))
                  }
                  if (usage && again.usage)
                    usage = {
                      inputTokens: usage.inputTokens + again.usage.inputTokens,
                      outputTokens: usage.outputTokens + again.usage.outputTokens
                    }
                }
              }
              const version = {
                id: versionId(),
                title: read.title,
                kind: 'llm' as const,
                prompt: ask.prompt,
                slots: slotsOut,
                at: new Date().toISOString(),
                model: answer.model,
                ...(trimmed.length > 0 ? { trimmed } : {}),
                ...(usage ? { usage } : {})
              }
              const ok = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
                addVersion(file, parsed.chip, version, read.nextPrompt)
                return writeCopy(scoped, file, parsed.lang)
              })
              if (ok) Object.assign(job, { state: 'done', version, nextPrompt: read.nextPrompt })
              else
                Object.assign(job, {
                  state: 'failed',
                  code: 'NOT_WRITTEN',
                  message: 'Could not write design-copy/<id>.json.'
                })
            })()
            return
          }
          case 'copyJob': {
            const job = jobs.get(parsed.job)
            if (!job) {
              writeJson(res, 404, { code: 'NO_SUCH_JOB' })
              return
            }
            writeJson(res, 200, job.state === 'working' ? { state: 'working' } : job)
            return
          }
          case 'copyVersionDelete': {
            const result = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
              if (!removeVersion(file, parsed.chip, parsed.vid)) return 404
              return (await writeCopy(scoped, file, parsed.lang)) ? 200 : 500
            })
            writeJson(
              res,
              result,
              result === 200 ? { ok: true } : { code: result === 404 ? 'NO_SUCH_VERSION' : 'NOT_WRITTEN' }
            )
            return
          }
          case 'copySelect': {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: 'UNKNOWN_ID' })
              return
            }
            const body = (await readBody(req)) as { selected?: unknown } | null
            const result = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
              if (!selectVersion(file, parsed.chip, body?.selected)) return 404
              return (await writeCopy(scoped, file, parsed.lang)) ? 200 : 500
            })
            writeJson(
              res,
              result,
              result === 200 ? { ok: true } : { code: result === 404 ? 'NO_SUCH_VERSION' : 'NOT_WRITTEN' }
            )
            return
          }
          case 'choose': {
            // The pick is what the agent's redesign of THIS site starts from (the skill's step 3):
            // the chat route, closed with the operator's switch.
            if ((await chatRouteOff(bundleConfig)) !== null) {
              writeJson(res, 403, { code: CHAT_ROUTE_OFF.code })
              return
            }
            const id = chosenId(await readBody(req), allIds(l, await readBrands(scoped)))
            if (id === null) {
              writeJson(res, 400, { code: 'UNKNOWN_ID' })
              return
            }
            const site = await readSite(scoped)
            if (site === null) {
              // Nothing to record into: the agent has not read the site yet (skill step 1).
              writeJson(res, 409, { code: 'SITE_NOT_READ' })
              return
            }
            site.chosen = { id, at: new Date().toISOString() }
            try {
              await fs.writeFile(siteFile(scoped), `${JSON.stringify(site, null, 2)}\n`)
              writeJson(res, 200, { ok: true, chosen: site.chosen })
            } catch {
              writeJson(res, 500, { code: 'NOT_WRITTEN' })
            }
            return
          }
        }
      })
    }
  }

  // 🔒 In `ctx.effect`: without it HMR or a plugin toggle leaves the old registration, and the
  // next load throws "duplicate route".
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'tracy-design-inspiration: host routes')

  // The library lives in dsh; the agent's shell lives in the site's web container (ADR 0014).
  // Keep these reads on the host instead of sending the agent to a nonexistent /opt/tracy.
  //
  // The three design tools' texts are sent on every step of every conversation; how a redesign uses them
  // is the `tracy-design-inspiration` skill's, loaded when one is asked for (bench flow D, 05/10/2026:
  // 4,019 characters of these schemas on all 445 steps of 55 runs, called in none).
  // `scripts/test/tool-schema-budget.test.mjs` holds the size and the parts. Keep `description:` within
  // 400 characters of `name:` — `scripts/build-agent-tools.mjs` reads it as text and gives up beyond that.
  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'tracy_design_library',
        description:
          "The design template catalog (no id), or one design template's DESIGN.md and tokens.css (id); read at most three. Files live in Tracy, not in the shell. While design systems are off it answers with the published templates instead. Workflow: the tracy-design-inspiration skill.",
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Catalog id, e.g. apple.' }
          },
          additionalProperties: false
        },
        output: {
          schema: {},
          render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
        },
        async execute(args: unknown) {
          const l = await lib()
          if (!l) return { ok: false, error: 'This host has no design library.' }
          const id = (args as { id?: unknown } | null)?.id
          if (typeof id !== 'string' || brandHostOf(id) === null) {
            const off = await designSystemsOff(bundleConfig)
            if (off) return off
          }
          if (id === undefined) return { ok: true, systems: l.systems }
          if (typeof id !== 'string' || !l.ids.has(id))
            return {
              ok: false,
              error:
                'Unknown design template id. Read the catalog first. For customer brands use tracy_brand.'
            }
          const [design, tokens] = await Promise.all([
            l.readFile(id, 'DESIGN.md'),
            l.readFile(id, 'tokens.css')
          ])
          return {
            ok: true,
            system: l.systems.find((s) => s.id === id),
            design: design?.toString('utf8') ?? null,
            tokens: tokens?.toString('utf8') ?? null
          }
        }
      }),
    'tracy-design-inspiration: library tool'
  )

  /**
   * The copy tool (spec §4f decision 6): the agent asks for the form, writes the words, the file lands
   * where the dialog polls. Plain object like the tool below, same peer-dependency reasoning.
   */
  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'tracy_design_copy',
        description:
          "Write the customer's words into a design template's layout: a PREVIEW version in the Design " +
          'templates dialog, never a change to the live site ("the pricing page in Stripe" is one). ' +
          'action="form" {id, chip} → that chip\'s slots and the length each allows; action="write" {id, chip, ' +
          "lang, slots, title?} stores one version, in the site's language; a text over its slot's length is " +
          'refused by name. Workflow: the tracy-design-inspiration skill.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['form', 'write'] },
            id: { type: 'string', description: 'Catalog id or brand:<host>.' },
            chip: {
              type: 'string',
              description:
                'A page path ("/", "/pricing/") or an artifact: landing, deck, poster, email, newsletter, form, typography. Default "/".'
            },
            lang: { type: 'string', description: 'BCP-47, e.g. "vi".' },
            slots: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'slot id → text, ids from form with the same chip.'
            },
            title: { type: 'string', description: 'write: 2–4 words naming the take.' },
            brief: {
              type: 'object',
              properties: { goal: { type: 'string' }, voice: { type: 'string' } },
              description: 'What the customer asked for, when they gave a brief.'
            }
          },
          required: ['action', 'id']
        },
        output: {
          schema: {},
          render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
        },
        async execute(args: unknown, exec?: { agent?: { session?: { header?: { cwd?: string } } } }) {
          const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd)
          if (config === null)
            return { ok: false, code: 'NO_SITE', error: "This conversation is not in a site's workspace." }
          const l = await lib()
          if (l === null) return { ok: false, error: 'This lane has no design library.' }
          const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
          const id = typeof a.id === 'string' ? a.id : ''
          if (brandHostOf(id) === null) {
            const off = await designSystemsOff(bundleConfig)
            if (off) return off
          }
          const brands = await readBrands(config)
          if (!allIds(l, brands).has(id)) {
            return {
              ok: false,
              error: `Not in the catalog: ${id || '(empty)'}. Use a catalog id or brand:<host>.`
            }
          }
          const site = await readSite(config)
          const sitePages = (site?.pages as { path?: unknown; type?: unknown }[] | undefined) ?? []
          const chip = canonicalChip(typeof a.chip === 'string' && a.chip !== '' ? a.chip : '/', sitePages)
          const layout =
            chipLayout(chip, sitePages) ?? (chip === '/' ? { fixture: true as const, kind: 'home' } : null)
          if (layout === null) {
            const paths = sitePages.map((p) => p.path).filter((p): p is string => typeof p === 'string')
            return {
              ok: false,
              error: `No such chip: ${chip}. The chips of this site are ${[...paths, ...ARTIFACT_TYPES].map((c) => `"${c}"`).join(', ')}. This tool writes a PREVIEW version only — never edit the live site for a design template.`
            }
          }
          const slots =
            'artifact' in layout
              ? await artifactSlotsFor(config, id, layout.artifact, l)
              : await slotsFor(l, config, id)
          if (!slots || slots.length === 0) {
            return {
              ok: false,
              error:
                'artifact' in layout
                  ? `${id} has no ${layout.artifact} artifact on this lane.`
                  : `No slot map for ${id} on this lane.`
            }
          }
          const copy = (await readCopy(config, id)) ?? emptyCopy(id)
          const page = copy.pages[chip]
          if (a.action === 'form') {
            return {
              ok: true,
              id,
              chip,
              layout:
                'artifact' in layout
                  ? { artifact: layout.artifact }
                  : { fixture: 'components.html', kind: layout.kind },
              slots: slots
                .filter((s) => !s.inNav)
                .map((s) => ({ id: s.id, role: s.role, text: s.text, ...slotLimits(s) })),
              navSlots: slots.filter((s) => s.inNav).map((s) => s.id),
              site: site ? { site: site.site, pages: site.pages, log: site.log } : null,
              written: page
                ? {
                    selected: page.selected,
                    versions: page.versions.map((v) => ({
                      id: v.id,
                      title: v.title,
                      kind: v.kind,
                      at: v.at,
                      slots: v.slots
                    }))
                  }
                : null,
              rule: "Write one text per slot that matters; stay within min..max (a text over max is refused). Invent from the site's data; write in the site's language."
            }
          }
          if (a.action !== 'write') return { ok: false, error: 'action must be "form" or "write".' }
          const v = agentVersion(args, slots)
          if (!v.ok) return { ok: false, error: v.error, offending: v.offending ?? [] }
          const ok = await withCopy(config, id, '', async (file) => {
            file.lang = v.lang
            if (v.brief) file.brief = v.brief
            addVersion(file, chip, v.version)
            return writeCopy(config, file)
          })
          if (!ok) return { ok: false, error: 'Could not write design-copy/<id>.json.' }
          return {
            ok: true,
            id,
            chip,
            version: { id: v.version.id, title: v.version.title },
            written: Object.keys(v.version.slots).length,
            warnings: v.warnings,
            note: 'The dialog shows the new version on its own; one line to the customer is enough.'
          }
        }
      }),
    'tracy-design-inspiration: copy tool'
  )

  /**
   * The agent's tool, as the PLAIN object `ctx.tools.register` takes: `name`, `description`,
   * `parameters` (raw JSON Schema), `output { schema, render }`, `execute`. dsh's `defineTool` is
   * only sugar over this shape, and importing it is a trap for a workspace plugin: pnpm auto-installs
   * peers for a new importer and `@deepseek-ai/dsh-tools` drags `dsh-llm` / `dsh-invariants @
   * >=0.1.3`, which no `-tracy.N` PRERELEASE satisfies (`ERR_PNPM_NO_MATCHING_VERSION`, 05/09);
   * declaring nothing fails the other way, Node cannot resolve the import from `lib/`
   * (`boot-graph` red, same day). `tracy-webroot-read` escapes only because its entry already
   * sits in the lockfile. ADR 0009 keeps `overrides` empty. So: no import, and our own validation
   * (`validPicks`) instead of the sugar's.
   */

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'tracy_design_propose',
        description:
          'Show one to three design templates for THIS site, drawn live on its own content: the chat renders ' +
          'the cards, never describe or paste them. Each pick is a catalog id (tracy_design_library) or ' +
          "brand:<host> (tracy_brand) with one line of why in the customer's words — one keeps the current " +
          'spirit, one upgrades it, one is bold; a named one alone. Workflow: the tracy-design-inspiration skill.',
        parameters: {
          type: 'object',
          properties: {
            picks: {
              type: 'array',
              description: 'In the order to show them.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Catalog id or brand:<host>.' },
                  why: { type: 'string', description: 'One line for the customer, ≤200 characters.' }
                },
                required: ['id'],
                additionalProperties: false
              }
            }
          },
          required: ['picks']
        },
        output: {
          schema: {},
          render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
        },
        async execute(args: unknown, exec?: { agent?: { session?: { header?: { cwd?: string } } } }) {
          const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd)
          if (config === null)
            return { ok: false, code: 'NO_SITE', error: "This conversation is not in a site's workspace." }
          const l = await lib()
          if (l === null) return { ok: false, error: 'This lane has no design library.' }
          const brands = await readBrands(config)
          // Switch off: only the customer's brands may be proposed.
          const off = await designSystemsOff(bundleConfig)
          const ids = off ? new Set(brands.map((b) => b.id)) : allIds(l, brands)
          const picks = validPicks(args, ids)
          if (picks === null) {
            // Name the offender: on 05/09 an agent spent four calls bisecting three valid ids
            // because the refusal did not say which pick — or whether the array itself — was wrong.
            const raw = (args as { picks?: unknown } | null)?.picks
            if (!Array.isArray(raw) || raw.length === 0) {
              return {
                ok: false,
                error: 'picks must be a non-empty array of { id, why }; one to three entries.'
              }
            }
            if (off) return off
            const bad = raw
              .map((p) =>
                p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string'
                  ? (p as { id: string }).id
                  : JSON.stringify(p)
              )
              .filter((id) => !ids.has(id))
            return {
              ok: false,
              error: `Not in the catalog: ${bad.join(', ')}. Every pick must be an id from tracy_design_library or a brand:<host> the customer extracted; give one to three.`
            }
          }
          // A valid proposal is a redesign of this site led in the chat: the operator's switch decides.
          const closed = await chatRouteOff(bundleConfig)
          if (closed) return closed
          const names = new Map([...brands, ...l.systems].map((s) => [s.id, s.name]))
          const site = await readSite(config)
          let recorded = false
          if (site !== null) {
            site.picks = picks
            try {
              await fs.writeFile(siteFile(config), `${JSON.stringify(site, null, 2)}\n`)
              recorded = true
            } catch {
              recorded = false
            }
          }
          return {
            ok: true,
            picks: picks.map((p) => ({ ...p, name: names.get(p.id) ?? p.id })),
            recorded,
            note: recorded
              ? 'Shown to the customer as three live cards.'
              : 'Shown to the customer as three live cards; design-preview.json is absent, so the cards carry no site content yet — read the site first.'
          }
        }
      }),
    'tracy-design-inspiration: propose tool'
  )
}
