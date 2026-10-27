/**
 * The plugin's host half, as the bench: same paths, same shapes, same refusals — shared by the
 * ported story (`DesignInspirations.stories.tsx`) and any mockup that wants the REAL fixture
 * thumbnails rather than a coloured box (the filter mockup, 06/09). `fetch` for
 * `/api/tracy-design-inspiration/…` answers from the same files the lane's image carries — the catalog
 * and each system's `tokens.css` / `DESIGN.md` / `components.html` under `vendor/tracy/od-design-system`,
 * loaded lazily — and `site` answers with the real `design-preview.json` an agent wrote for
 * lucaswp.tracy.ai on 05/09.
 */
/// <reference types="vite/client" />
import catalog from '../../../../../../vendor/tracy/od-design-system/catalog.json'
import dark from '../../../../../../vendor/tracy/od-design-system/dark.json'
import slotsDoc from '../../../../../../vendor/tracy/od-design-system/slots.json'
import artifactSlots from '../../../../../design/tracy-design-inspiration/src/host/artifact-slots.json'
import type { Inspiration, SitePreview } from '../../../../../design/tracy-design-inspiration/src/client/api'
import { DEFAULT_PROMPTS } from '../../../../../design/tracy-design-inspiration/src/host/prompts.mjs'
import lucaswp from '../../fixtures/design-preview.lucaswp.json'

export const SITE = { ...(lucaswp as unknown as SitePreview), siteKey: 'lucaswp' }
// The bench reads the same two files the image ships: the catalog, and the dark verdict per system.
/** The 152 design systems, published by Tracy — buildable on the CMSes whose Tracy theme wears them. */
const DESIGN_SYSTEMS: Inspiration[] = (catalog as { systems: Omit<Inspiration, 'dark'>[] }).systems.map(
  (s) => ({
    ...s,
    dark: (dark as { systems: Record<string, { safe: boolean }> }).systems[s.id]?.safe !== false,
    provider: 'Tracy',
    platforms: ['joomla', 'wordpress']
  })
)

/** The screenshots of the Business template, per layout — what the release will carry as `shots/`. */
const SHOT = import.meta.glob('./fixtures/tracy-business/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const shot = (name: string) => ({
  desktop: SHOT[`./fixtures/tracy-business/business-${name}-1440.png`]!,
  mobile: SHOT[`./fixtures/tracy-business/business-${name}-390.png`]
})

/**
 * Tracy Business, published by JoomlArt — a finished site, one card for both CMS builds. On the
 * bench the demo is the site the stand provisioned from the release; in the product, the fleet's.
 */
export const TRACY_BUSINESS: Inspiration = {
  id: 'tracy-business',
  name: 'Tracy Business',
  category: 'Professional & Corporate',
  nav: 'top-left',
  hero: 'split',
  dark: true,
  provider: 'JoomlArt',
  platforms: ['joomla', 'emdash'],
  template: {
    quickstarts: { joomla: 'tracy-business/j6', emdash: 'tracy-business/emdash' },
    version: '1.0.0',
    image: shot('home').desktop,
    demo: { url: 'http://127.0.0.1:52140', version: '1.0.0' },
    defaultTheme: 'light',
    languages: ['en', 'ru'],
    layouts: [
      { key: 'home', label: 'Home', path: '/', shots: shot('home') },
      { key: 'about', label: 'About', path: '/about', shots: shot('about') },
      { key: 'services', label: 'Services', path: '/services', shots: shot('services') },
      {
        key: 'service',
        label: 'Service',
        path: '/services/general-contracting',
        count: 12,
        shots: shot('service')
      },
      { key: 'projects', label: 'Projects', path: '/projects', shots: shot('projects') },
      {
        key: 'project',
        label: 'Project',
        path: '/projects/elektra-lipetsk',
        count: 20,
        shots: shot('project')
      },
      { key: 'news', label: 'News', path: '/news', shots: shot('news') },
      {
        key: 'article',
        label: 'Article',
        path: '/news/northgate-wins-the-zavolzhye-2-infrastructure-tender',
        count: 24,
        shots: shot('article')
      },
      { key: 'careers', label: 'Careers', path: '/careers', count: 12, shots: shot('careers') },
      { key: 'investors', label: 'Investors', path: '/investors', shots: shot('investors') },
      { key: 'contact', label: 'Contact', path: '/contact', shots: shot('contact') },
      { key: 'legal', label: 'Terms · Privacy', path: '/terms', count: 2, shots: shot('terms') },
      { key: 'ru', label: 'Русский', path: '/ru', shots: shot('home-ru') },
      { key: '404', label: 'Not found', path: '/nope-404', shots: shot('notfound') }
    ]
  }
}

/** The gallery's list: the template first — one card among the 153, told apart by its provider. */
export const INSPIRATIONS: Inspiration[] = [TRACY_BUSINESS, ...DESIGN_SYSTEMS]

/** Lazy: a system's three files load the first time a card or the dialog asks for them. */
const FILES = import.meta.glob(
  '../../../../../../vendor/tracy/od-design-system/systems/*/{tokens.css,DESIGN.md,components.html,preview/*.html,system/*.html,system/artifacts/*.html}',
  { query: '?raw', import: 'default' }
) as Record<string, () => Promise<string>>

const TYPES: Record<string, string> = {
  'tokens.css': 'text/css; charset=utf-8',
  'DESIGN.md': 'text/markdown; charset=utf-8',
  'components.html': 'text/html; charset=utf-8'
}

/**
 * The host half, as the bench: same paths, same shapes, same refusals. Installed once per page
 * (the story iframe), and only for the plugin's own prefix — everything else goes to the network.
 */
let installedFor: SitePreview | null | undefined
/** The copy files on this bench (`copy/<id>`, spec §4h), one v2 file per inspiration: a story seeds them, More version grows them. */
type ChipCopy = { versions: Record<string, unknown>[]; selected: string | null; nextPrompt: string | null }
type CopyFile = { pages: Record<string, ChipCopy>; [k: string]: unknown }
let copyFor: Record<string, CopyFile> = {}
const emptyCopy = (id: string): CopyFile => ({
  schemaVersion: 'tracy-design-copy/v2',
  system: id,
  writtenAt: '',
  lang: 'en',
  brief: null,
  pages: {}
})
/** What the bench's "model" answers a More version with: hand-written takes, in turn, after a pause. */
const TAKES: { title: string; nextPrompt: string; slots: Record<string, string> }[] = [
  {
    title: 'Plainer, shorter',
    nextPrompt: 'Now warmer and in the first person: say what we do for the reader, not what the product is.',
    slots: {
      'h1.0': 'Every site gets its own desk. You keep the last word.',
      'p.1':
        'Connect a Joomla, WordPress, WooCommerce or Shopify site and Tracy assigns it an agent that reads the site, checks what it finds, and proposes changes one by one. Nothing ships until you approve it.',
      'a.0': 'Get the desk',
      'a.1': 'See what it reads'
    }
  },
  {
    title: 'Warmer, first person',
    nextPrompt: 'Try it as a headline of numbers: how many platforms, how many skills, one price.',
    slots: {
      'h1.0': 'Your sites, read every day by someone who never gets tired.',
      'p.1':
        "We pair each site with an agent that reads it, flags what needs care, and proposes fixes in plain words. You approve, it applies — through the site's own component, never from outside.",
      'a.0': 'Download',
      'a.1': 'Browse skills'
    }
  }
]
let takes = 0
const jobs = new Map<string, Record<string, unknown>>()
export function installDoors(site: SitePreview | null, copy: Record<string, unknown> = {}): void {
  copyFor = Object.fromEntries(Object.entries(copy).map(([id, file]) => [id, file as CopyFile]))
  if (installedFor !== undefined) {
    installedFor = site
    return
  }
  installedFor = site
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const at = url.indexOf('/api/tracy-design-inspiration/')
    if (at < 0) return real(input, init)
    const rest = url.slice(at + '/api/tracy-design-inspiration/'.length).split(/[?#]/)[0] ?? ''
    const json = (status: number, body: unknown): Response =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (rest === 'catalog') return json(200, { count: INSPIRATIONS.length, systems: INSPIRATIONS })
    if (rest === 'site')
      return json(200, installedFor ? { present: true, site: installedFor } : { present: false })
    if (rest === 'choose')
      return json(installedFor ? 200 : 409, installedFor ? { ok: true } : { code: 'SITE_NOT_READ' })
    const cp = /^copy\/([a-z0-9:.-]+)$/.exec(rest)
    if (cp) return json(200, { ...(copyFor[cp[1]!] ?? emptyCopy(cp[1]!)), defaultPrompts: DEFAULT_PROMPTS })
    const cj = /^copy\/([a-z0-9:.-]+)\/jobs\/([^/]+)$/.exec(rest)
    if (cj) return jobs.has(cj[2]!) ? json(200, jobs.get(cj[2]!)) : json(404, { code: 'NO_SUCH_JOB' })
    const cv = /^copy\/([a-z0-9:.-]+)\/pages\/([^/]+)\/(versions(?:\/([^/]+))?|selected)$/.exec(rest)
    if (cv) {
      const file = (copyFor[cv[1]!] ??= emptyCopy(cv[1]!))
      const chip = decodeURIComponent(cv[2]!)
      const page = (file.pages[chip] ??= { versions: [], selected: null, nextPrompt: null })
      const method = init?.method ?? 'GET'
      if (cv[3] === 'versions' && method === 'POST') {
        // The bench has no model: the job answers at once, and a hand-written take lands after the
        // pause a real call takes — polled through `copy/<id>/jobs/<job>` like on a lane.
        const body = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string }
        const take = TAKES[takes++ % TAKES.length]!
        const jobId = `job-${takes}`
        jobs.set(jobId, { state: 'working' })
        window.setTimeout(() => {
          const version = {
            id: `v-bench-${takes}`,
            title: take.title,
            kind: 'llm',
            prompt: body.prompt ?? page.nextPrompt ?? DEFAULT_PROMPTS.home,
            slots: take.slots,
            at: new Date().toISOString(),
            model: 'bench/hand-written'
          }
          page.versions.push(version)
          page.selected = version.id
          page.nextPrompt = take.nextPrompt
          jobs.set(jobId, { state: 'done', version, nextPrompt: take.nextPrompt })
        }, 1500)
        return json(202, { ok: true, job: jobId })
      }
      if (cv[3]!.startsWith('versions/') && method === 'DELETE') {
        const vid = decodeURIComponent(cv[4]!)
        const before = page.versions.length
        page.versions = page.versions.filter((v) => v.id !== vid)
        if (page.selected === vid) page.selected = null
        return page.versions.length === before
          ? json(404, { code: 'NO_SUCH_VERSION' })
          : json(200, { ok: true })
      }
      if (cv[3] === 'selected' && method === 'PUT') {
        page.selected = (JSON.parse(String(init?.body ?? '{}')) as { selected: string }).selected
        return json(200, { ok: true })
      }
      return json(404, { code: 'UNKNOWN_ROUTE' })
    }
    const asl = /^systems\/([a-z0-9-]+)\/artifact-slots\/([a-z]+)$/.exec(rest)
    if (asl) {
      const shared = (artifactSlots as { artifacts: Record<string, unknown[]> }).artifacts[asl[2]!]
      return shared ? json(200, { slots: shared }) : json(404, { code: 'NO_SUCH_FILE' })
    }
    const sl = /^systems\/([a-z0-9-]+)\/slots$/.exec(rest)
    if (sl)
      return json(200, {
        slots: (slotsDoc as { systems: Record<string, { slots: unknown[] }> }).systems[sl[1]!]?.slots ?? []
      })
    const m = /^systems\/([a-z0-9-]+)\/([a-z./-]+\.(?:css|md|html))$/.exec(rest)
    if (m) {
      const key = Object.keys(FILES).find((k) => k.endsWith(`/systems/${m[1]}/${m[2]}`))
      if (!key) return json(404, { code: 'NO_SUCH_FILE' })
      const type = m[2]!.endsWith('.css')
        ? TYPES['tokens.css']!
        : m[2]!.endsWith('.md')
          ? TYPES['DESIGN.md']!
          : TYPES['components.html']!
      return new Response(await FILES[key]!(), { status: 200, headers: { 'content-type': type } })
    }
    return json(404, { code: 'UNKNOWN_ROUTE' })
  }
}
