/**
 * Everything the tab fetches, in one place, all through `dshUrl()`: these are doors of this
 * plugin's own host half, and under `cowork.tracy.ai/<siteKey>/` a root-absolute path knocks on
 * the Worker instead (gate `check-dsh-paths`).
 */
import { dshUrl } from './dsh-url'
import { withTokens } from './fixture'
import { libraryFileUrl } from './library-url.mjs'
import { REFERENCE_DONOR } from './reference-donor.mjs'
import { pictureAddress } from './templates.mjs'

export type NavKind = 'top-left' | 'top-centered' | 'brand-centered' | 'sidebar' | 'overlay'
export type HeroKind = 'split' | 'centered' | 'cover' | 'stack'

/** One row of the slim catalog the host serves. */
export interface Inspiration {
  id: string
  name: string
  category: string
  nav: NavKind
  hero: HeroKind
  /** Whether the dark override is enough for this fixture (`dark.json`); false = light blocks or ink on ink. */
  dark: boolean
  /** Closeness to the customer's own brand, 0..1 — present only once a brand was extracted (§4f). */
  fit?: number
  /**
   * Who publishes what this card installs: `Tracy` for the 152 design systems (Tracy builds a site
   * in this style), `JoomlArt` for a quickstart (a finished site, installed as seen). A label the
   * customer filters by — never a switch the code branches on; the branch is `template`.
   */
  provider?: string
  /** The CMSes a build of this card exists for. A CMS not here greys its Create with button. */
  platforms?: string[]
  /** Present when the card is a finished site (a quickstart), with what the preview frames. */
  template?: TemplateCard
}

/** A quickstart on the gallery: the live demo the preview frames, its layouts, its card picture. */
export interface TemplateCard {
  /** The catalogue's quickstart id per CMS — what Create with hands the create door. */
  quickstarts: Record<string, string>
  version: string
  /**
   * The card's picture, or null when there is none. Null is a real state, not a gap to paper
   * over: a picture tracy-web does not hold (#523, JA Restaurant) lives nowhere a surface can reach,
   * and a card with no picture is honest where a broken one is not.
   */
  image: string | null
  /** One sentence about the site, written by a person — null until someone writes it. */
  blurb?: string | null
  /**
   * The live demo the preview frames, and — when the list named one — the door a card asks before
   * it frames the demo in the grid (`DemoThumb`): absolute, so it is fetched as an address.
   */
  demo: { url: string; version: string; probe?: string }
  /** The side the demo opens on when no mode is asked; the preview starts on it. */
  defaultTheme: 'light' | 'dark'
  languages: string[]
  layouts: {
    key: string
    label: string
    path: string
    /** Where the page answers, when that is not `path` — a Joomla demo's `/index.php/...`. */
    address?: string
    count?: number
    shots?: { desktop: string | null; mobile?: string | null }
  }[]
}

/** One content version of one chip (spec §4h decision 5): the agent's (`rewritten`) or the model's (`llm`). */
export interface CopyVersion {
  id: string
  /** 2–4 words the writer named the take with; shown on hover in the strip. */
  title: string
  kind: 'rewritten' | 'llm'
  prompt: string | null
  slots: Record<string, string>
  at: string
  model: string | null
  /** Slot ids the host cut to the ceiling because the model went over. */
  trimmed?: string[]
}

/** The versions of one chip, which one the customer chose, and what the next "More version" opens with. */
export interface ChipCopy {
  versions: CopyVersion[]
  /** A version id, one of the built-ins (`yours`, `default`), or null = not chosen yet. */
  selected: string | null
  nextPrompt: string | null
}

/** `docs/agents/design-copy/<id>.json` v2, plus the ten default prompts the host owns. */
export interface Copy {
  schemaVersion: string
  system: string
  writtenAt: string
  lang: string
  brief: { goal: string; voice: string } | null
  pages: Record<string, ChipCopy>
  defaultPrompts: Record<string, string>
}

export type PageType = 'home' | 'listing' | 'article' | 'pricing'
/** The inspiration's six sample products a generated page may be drawn on (`system/artifacts/<kind>.html`). */
export type ArtifactType = 'landing' | 'deck' | 'poster' | 'email' | 'newsletter' | 'form' | 'typography'
export const ARTIFACT_TYPES: readonly ArtifactType[] = [
  'landing',
  'deck',
  'poster',
  'email',
  'newsletter',
  'form',
  'typography'
]
export const isArtifactType = (t: string): t is ArtifactType =>
  (ARTIFACT_TYPES as readonly string[]).includes(t)

/** `docs/agents/design-preview.json` — the shape is `references/design-preview.schema.md` of the skill. */
export interface SitePreview {
  site: {
    name: string | null
    url: string
    nav: string[]
    eyebrow: string | null
    headline: string | null
    sub: string | null
    cta: string | null
    cta2: string | null
    image: string | null
  }
  pages: { path: string; type: PageType; label: string; data: Record<string, unknown> }[]
  log?: { date: string; title: string; dek?: string; tag?: string }[]
  unmatched?: { path: string; why: string }[]
  picks?: { id: string; why: string }[]
  chosen?: { id: string; at: string }
  /** The lane's site key (`MCP_TRACY_SITE_KEY`), added by the host — names the brand's own landing chip (§4h decision 8). */
  siteKey?: string | null
}

/** A door of this plugin's host half, resolved against the page's `<base>` (gate `check-dsh-paths`). */
/**
 * Where a door lives. In dsh it is this plugin's host half under `dshUrl`; the public page (ADR
 * 0011, `packages/web/tracy-design-page`) swaps in a mapper that points the same requests at static
 * assets and the Worker's own doors — so the components are shared and only the address differs.
 */
let doorOf: (rest: string) => string = (rest) => dshUrl(`/api/tracy-design-inspiration/${rest}`)
export function setDoor(map: (rest: string) => string): void {
  doorOf = map
}
const door = (rest: string): string => doorOf(rest)
/**
 * A template card's picture as the browser may fetch it, or null when there is none to draw.
 *
 * 🔒 NO BARE NAME IS TURNED INTO A DOOR (#523). This used to resolve a bare file name against this
 * plugin's `template/<id>/<file>` door — a door that answers 404 for every name since the image
 * stopped carrying `quickstarts.json` (16/09), so a card naming a picture nobody held drew a broken
 * image. Now an absolute `http(s)` address (what tracy-web answers) or a same-origin rooted path (the
 * design bench's fixtures) is drawn as it is, and anything else is null: the card draws its empty
 * block. The rule is `pictureAddress` in `templates.mjs`, shared with the row mapping.
 */
export function pictureUrl(file: unknown): string | null {
  return pictureAddress(file)
}

/**
 * The library the catalog named: the public page's static files and their vendor commit
 * (tasks/todo-thu-vien-mot-cho.md). Set by `fetchCatalog`; null until then, or on an image-only
 * lane — and then every system file goes through the door, as before.
 */
export interface LibraryRef {
  url: string
  commit: string
}
let library: LibraryRef | null = null
export function setLibrary(ref: LibraryRef | null): void {
  library = ref
  texts.clear()
  slotsCache.clear()
  artifactSlotsCache.clear()
}
export const currentLibrary = (): LibraryRef | null => library
/** Where one file of one inspiration is read from: the page for the 152, the door for a brand. */
const fileUrl = (id: string, file: string): string => libraryFileUrl(library, door, id, file)

export class LibraryError extends Error {
  constructor(readonly code: 'NO_LIBRARY' | 'FAILED') {
    super(code)
  }
}

/**
 * The catalog: templates, brands and — while the operator offers them on Design inspiration — the
 * design systems. `systems: 'all'` is the Design system panel's read: every system, whatever the
 * gallery's switch says, because the panel applies through Tracy's door, which has its own switch.
 */
export async function fetchCatalog(opts: { systems?: 'all' } = {}): Promise<Inspiration[]> {
  const res = await fetch(door(opts.systems === 'all' ? 'catalog?systems=all' : 'catalog'), {
    headers: { accept: 'application/json' }
  })
  if (res.status === 503) throw new LibraryError('NO_LIBRARY')
  if (!res.ok) throw new LibraryError('FAILED')
  const body = (await res.json()) as { systems?: Inspiration[]; library?: LibraryRef | null }
  const ref = body.library
  const next =
    ref && typeof ref.url === 'string' && typeof ref.commit === 'string'
      ? { url: ref.url, commit: ref.commit }
      : null
  if (next?.url !== library?.url || next?.commit !== library?.commit) setLibrary(next)
  return body.systems ?? []
}

export async function fetchSite(): Promise<SitePreview | null> {
  try {
    const res = await fetch(door('site'), { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as { present: boolean; site?: SitePreview; siteKey?: string | null }
    return body.present && body.site ? { ...body.site, siteKey: body.siteKey ?? null } : null
  } catch {
    return null
  }
}

/**
 * The two text files of an inspiration, cached for the life of the page: the grid asks for a
 * system's tokens once per card, the dialog asks again — one request each is the right number.
 */
const texts = new Map<string, Promise<string>>()
function systemText(id: string, file: string): Promise<string> {
  const key = `${id}/${file}`
  let p = texts.get(key)
  if (!p) {
    p = fetch(fileUrl(id, file)).then((r) => {
      if (!r.ok) throw new Error(`${file} of ${id}: ${r.status}`)
      return r.text()
    })
    p.catch(() => texts.delete(key))
    texts.set(key, p)
  }
  return p
}
export const fetchTokens = (id: string): Promise<string> => systemText(id, 'tokens.css')
export const fetchDesign = (id: string): Promise<string> => systemText(id, 'DESIGN.md')

/**
 * The inspiration's own fixture page, as TEXT for `srcDoc` — not a URL for `src`. A `sandbox=""`
 * iframe has an opaque origin, so a document it loads by `src` goes out without the seat cookie
 * and the lane's gate answers 302 → a grey card (measured on fijitrips, 05/09). `fetch()` from
 * the page carries the cookie; the fixture is self-contained (no `<img>`, no `<link>`), so
 * `srcDoc` draws it identically.
 */
export const fetchFixture = (id: string): Promise<string> =>
  id.startsWith('brand:')
    ? Promise.all([systemText(REFERENCE_DONOR, 'components.html'), systemText(id, 'tokens.css')]).then(
        ([html, tokens]) => withTokens(html, tokens)
      )
    : systemText(id, 'components.html')
/** One nested file of an inspiration (`system/artifacts/*.html`); the host's closed list decides what exists. */
export const fetchSystemFile = (id: string, file: string): Promise<string> => systemText(id, file)

/**
 * The inspiration's slot map — where the customer's words go in its fixture (`slots.json`, built by
 * `scripts/build-od-slots.mjs`, served per system by the host half). Cached like the text files.
 */
const slotsCache = new Map<string, Promise<import('./fixture').Slot[]>>()
export function fetchSlots(id: string): Promise<import('./fixture').Slot[]> {
  // A brand is drawn in the donor's page (see `fetchFixture`), so it must be filled by the donor's
  // slot map: the numbering is `querySelectorAll(tag)[n]` against THAT document, and a map from the
  // component kit would land the site's words on whatever element happens to sit at that index.
  const from = id.startsWith('brand:') ? REFERENCE_DONOR : id
  let p = slotsCache.get(from)
  if (!p) {
    p = fetch(fileUrl(from, 'slots'), {
      headers: { accept: 'application/json' }
    }).then(async (r) => {
      if (!r.ok) throw new Error(`slots of ${from}: ${r.status}`)
      const body = (await r.json()) as { slots?: import('./fixture').Slot[] }
      return body.slots ?? []
    })
    p.catch(() => slotsCache.delete(from))
    slotsCache.set(from, p)
  }
  return p
}

export async function choose(id: string): Promise<boolean> {
  try {
    const res = await fetch(door('choose'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id })
    })
    return res.ok
  } catch {
    return false
  }
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string'
const isTextOrNull = (v: unknown): boolean => v === null || isText(v)
const isTextMap = (v: unknown): boolean => isRecord(v) && Object.values(v).every(isText)
/** A field the host does not promise on an older file: absent, or exactly its declared type. */
const absentOr = (v: unknown, is: (v: unknown) => boolean): boolean => v === undefined || is(v)

/** One version exactly as `CopyVersion` declares it (the host's `isVersion`, plus the rest). */
const isCopyVersion = (v: unknown): boolean =>
  isRecord(v) &&
  isText(v.id) &&
  v.id !== '' &&
  isText(v.title) &&
  (v.kind === 'rewritten' || v.kind === 'llm') &&
  isTextMap(v.slots) &&
  absentOr(v.prompt, isTextOrNull) &&
  absentOr(v.at, isText) &&
  absentOr(v.model, isTextOrNull) &&
  absentOr(v.trimmed, (l) => Array.isArray(l) && l.every(isText))

const isChipCopy = (c: unknown): boolean =>
  isRecord(c) &&
  Array.isArray(c.versions) &&
  c.versions.every(isCopyVersion) &&
  isTextOrNull(c.selected) &&
  isTextOrNull(c.nextPrompt)

/**
 * A 200 from the copy door as a copy the dialog can draw, or null.
 *
 * 🔒 ONE CONTRACT FOR THE WHOLE FILE, NOT A CHECK PER FIELD THAT ONCE BROKE (#800). The host always
 * answers this inspiration's own file in the shape `normalizeCopy` writes; this accepts that shape
 * and nothing else. A gateway's `{}`, another inspiration's file, or a version whose `title` is an
 * object is not a copy: the dialog draws every field named here (a title as a React child, slots
 * into the page), so a value of another type throws while drawing and takes the removal's own
 * message down with it. A field added to `Copy` is added here.
 */
function asCopy(value: unknown, id: string): Copy | null {
  if (!isRecord(value)) return null
  const ok =
    value.system === id &&
    isText(value.schemaVersion) &&
    isText(value.writtenAt) &&
    isText(value.lang) &&
    (value.brief === null ||
      (isRecord(value.brief) && isText(value.brief.goal) && isText(value.brief.voice))) &&
    isRecord(value.pages) &&
    Object.values(value.pages).every(isChipCopy) &&
    isTextMap(value.defaultPrompts)
  return ok ? (value as unknown as Copy) : null
}

/**
 * The copy of an inspiration — always a file, empty before anything was written. Never cached: a
 * take may have just landed. Null when the door did not answer with this inspiration's copy.
 */
export async function fetchCopy(id: string): Promise<Copy | null> {
  try {
    const res = await fetch(door(`copy/${encodeURIComponent(id)}`), {
      headers: { accept: 'application/json' },
      cache: 'no-store'
    })
    if (!res.ok) return null
    return asCopy(await res.json(), id)
  } catch {
    return null
  }
}

/**
 * A chip as one URL segment: slashes as `~` (`/about/` → `~about~`). `%2F` came back decoded through
 * the lane's Worker (lucaswp, 06/09) and split the route; the host reads `~` back to `/`.
 */
const chipToken = (chip: string): string => encodeURIComponent(chip.replace(/\//g, '~'))
const chipDoor = (id: string, chip: string, rest: string): string =>
  door(`copy/${encodeURIComponent(id)}/pages/${chipToken(chip)}/${rest}`)

/**
 * One more take of a chip by the lane's model (§4h decisions 3–4): the host starts it and answers with
 * a job id at once — a take can outlive the lane proxy's 30 s — and `fetchJob` says when it landed.
 */
export async function createVersion(
  id: string,
  chip: string,
  prompt: string | null
): Promise<{ ok: true; job: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(chipDoor(id, chip, 'versions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(prompt === null ? {} : { prompt })
    })
    const body = (await res.json()) as { ok?: boolean; job?: string; code?: string; message?: string }
    if (res.ok && body.job) return { ok: true, job: body.job }
    return { ok: false, message: body.message ?? body.code ?? String(res.status) }
  } catch (error) {
    return { ok: false, message: thrownText(error) }
  }
}

export type JobState =
  | { state: 'working' }
  | { state: 'done'; version: CopyVersion; nextPrompt: string | null }
  | { state: 'failed'; message: string; key?: 'version.forgotten' }

/** Where a take stands; a poll that fails on the wire reads as still working, not as failed. */
export async function fetchJob(id: string, job: string): Promise<JobState> {
  try {
    const res = await fetch(door(`copy/${encodeURIComponent(id)}/jobs/${encodeURIComponent(job)}`), {
      headers: { accept: 'application/json' },
      cache: 'no-store'
    })
    // Said in the reader's language by the dialog (`version.forgotten`); `message` is the English.
    if (res.status === 404)
      return {
        state: 'failed',
        message: 'The lane forgot this take (it restarted). Try again.',
        key: 'version.forgotten'
      }
    if (!res.ok) return { state: 'working' }
    const body = (await res.json()) as {
      state: 'working' | 'done' | 'failed'
      version?: CopyVersion
      nextPrompt?: string | null
      message?: string
      code?: string
    }
    if (body.state === 'done' && body.version)
      return { state: 'done', version: body.version, nextPrompt: body.nextPrompt ?? null }
    if (body.state === 'failed') return { state: 'failed', message: body.message ?? body.code ?? 'failed' }
    return { state: 'working' }
  } catch {
    return { state: 'working' }
  }
}

/**
 * What became of a removal. `refused` = the version is still there, in the host's own word: one of
 * the two codes its removal door answers when it wrote nothing (`NOT_REMOVED`). Not refused and not
 * ok = no answer the host stands behind (the request dropped, any other status or body — a
 * gateway's or the sign-in gate's included — or a 200 that does not say `{ ok: true }`), so the
 * version may or may not be gone.
 */
export type RemoveResult = { ok: true } | { ok: false; refused: boolean; message: string }

/** `copyVersionDelete` in `src/host/index.ts`: the status and code of each answer that wrote nothing. */
const NOT_REMOVED: Record<number, string> = { 404: 'NO_SUCH_VERSION', 500: 'NOT_WRITTEN' }

/** The answer when the request dropped and what was thrown carries no text: no status came back. */
const NO_ANSWER = '0'

/**
 * Why a request dropped, as text. What a rejected `fetch` hands over is not promised to be an
 * `Error`, and an `Error`'s `message` is not promised to be text: coercing either can throw inside
 * the very branch that reports the failure. Only text that is already text is used.
 */
function thrownText(thrown: unknown): string {
  if (typeof thrown === 'string' && thrown.trim() !== '') return thrown
  if (thrown instanceof Error && typeof thrown.message === 'string' && thrown.message.trim() !== '')
    return thrown.message
  return NO_ANSWER
}

/**
 * Remove one written take of a chip. Only the host's own `{ ok: true }` counts as removed (#800).
 * It never rejects: whatever goes wrong while sending or reading is an answer nobody stands behind.
 */
export async function deleteVersion(id: string, chip: string, vid: string): Promise<RemoveResult> {
  try {
    const res = await fetch(chipDoor(id, chip, `versions/${encodeURIComponent(vid)}`), {
      method: 'DELETE',
      headers: { accept: 'application/json' }
    })
    const body: unknown = await res.json().catch(() => null)
    const fields = isRecord(body) ? body : null
    if (res.ok)
      return fields?.ok === true ? { ok: true } : { ok: false, refused: false, message: String(res.status) }
    const code = isText(fields?.code) ? fields.code : null
    const said = isText(fields?.message) ? fields.message : code
    // A status alone says nothing about which side of the write it came from: something in between
    // can answer 4xx or 5xx for a request that went through. Only the host's own code at the status
    // it sends it with is its word that nothing was written.
    return {
      ok: false,
      refused: code !== null && NOT_REMOVED[res.status] === code,
      message: said ?? String(res.status)
    }
  } catch (error) {
    return { ok: false, refused: false, message: thrownText(error) }
  }
}

/** Remember the customer's choice on a chip: a version id or a built-in (`yours`, `default`). */
export async function selectVersion(id: string, chip: string, selected: string): Promise<boolean> {
  try {
    const res = await fetch(chipDoor(id, chip, 'selected'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ selected })
    })
    return res.ok
  } catch {
    return false
  }
}

/** The slot map of one artifact of an inspiration, cached like the fixture's slots. */
const artifactSlotsCache = new Map<string, Promise<import('./fixture').Slot[]>>()
export function fetchArtifactSlots(id: string, type: ArtifactType): Promise<import('./fixture').Slot[]> {
  const key = `${id}/${type}`
  let p = artifactSlotsCache.get(key)
  if (!p) {
    p = fetch(fileUrl(id, `artifact-slots/${type}`), {
      headers: { accept: 'application/json' }
    }).then(async (r) => {
      if (!r.ok) throw new Error(`artifact slots of ${id}/${type}: ${r.status}`)
      const body = (await r.json()) as { slots?: import('./fixture').Slot[] }
      return body.slots ?? []
    })
    p.catch(() => artifactSlotsCache.delete(key))
    artifactSlotsCache.set(key, p)
  }
  return p
}
