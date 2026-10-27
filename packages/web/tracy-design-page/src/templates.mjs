/**
 * The finished sites on the public page: one Publish, two surfaces.
 *
 * An admin publishes a template's card onto its release; from that moment `GET /api/templates`
 * answers with it, and BOTH surfaces that draw Design inspiration cards show it at the next load —
 * the tab inside dsh, and this page. Nothing here is baked into `catalog.json`: that file is cut
 * when the image is built, so a card baked into it would wait for a build, and Publish would be a
 * button with no effect until someone ran CI (tasks/todo-design-inspiration-card-ops.md).
 *
 * The door needs no seat and sits on the origin that served this page, so the page asks it
 * directly. The mapping is the plugin's own — the same rows the tab draws.
 *
 * Plain `.mjs`, not `.ts`, so `test/templates.test.mjs` can import it, for the same reason
 * `community.mjs` is plain: every failure mode below is silent on a page nobody is watching.
 */

import { templateRows } from '../../../design/tracy-design-inspiration/src/client/templates.mjs'

/**
 * Where the finished sites are read from — tracy-web's own unadmitted door, on this origin.
 *
 * NOT under `/design-inspiration`: the doors under that prefix are this page's (`api/read`,
 * `api/brand/*`), while this one is the same door every lane's dsh asks, and one answer is the
 * whole point of publishing once.
 */
export const TEMPLATES_DOOR = '/api/templates'

/*
 * 🔒 THE PUBLIC PAGE SERVES NO PICTURE OF ITS OWN, and needs no rule of its own for that: the
 * mapping keeps only absolute `http(s)` pictures (`servedPicture`), so a picture the door named by
 * bare file — a file that lived beside a dsh, never behind this page — is null and draws no picture
 * rather than a broken-image icon.
 */

/**
 * The finished sites this deployment publishes, or an empty list.
 *
 * 🔒 EMPTY ON EVERY REFUSAL, AND THE PAGE KEEPS WORKING. A door that timed out must cost the
 * visitor the cards it would have added and nothing else — so the refusal is said once to the console, naming the door,
 * and the list goes on.
 * @param {typeof fetch} [fetchImpl]
 * @param {(message: string) => void} [warn]
 * @returns {Promise<any[]>}
 */
export async function fetchTemplates(fetchImpl = fetch, warn = console.warn) {
  try {
    const res = await fetchImpl(TEMPLATES_DOOR, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      warn(`${TEMPLATES_DOOR} answered ${res.status}: no finished sites on the list this load.`)
      return []
    }
    const rows = templateRows(await res.json())
    if (rows === null) {
      warn(`${TEMPLATES_DOOR} answered a body of another shape: no finished sites on the list.`)
      return []
    }
    return rows
  } catch (error) {
    warn(`${TEMPLATES_DOOR} could not be read (${error instanceof Error ? error.message : error}).`)
    return []
  }
}

/** Whether this deployment offers the design-system library — tracy-web's operator switch. */
export const DESIGN_SYSTEMS_DOOR = '/api/design-systems'

/**
 * Whether the 152 design systems are on the list this load.
 *
 * 🔒 ANYTHING BUT A PLAIN `shown: true` IS OFF. The switch defaults to off, and a page that cannot
 * tell must hide the library rather than show it: showing is the fail-open shape this repo refuses.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function fetchDesignSystemsShown(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(DESIGN_SYSTEMS_DOOR, { headers: { accept: 'application/json' } })
    return res.ok && (await res.json())?.shown === true
  } catch {
    return false
  }
}

/**
 * The whole list as drawn: the finished sites, then the design systems when the switch offers them.
 * No brand card and no Community shelf (Akemi, 03/10/2026): a measured brand is not a template.
 *
 * The switch drops the library by WHERE A ROW CAME FROM (`catalog.json`), never by id: a finished
 * site sharing an id with a design system (`ja-kinetic`) is a template card and stays.
 * @param {{ catalog: any[], templates: any[], systemsShown: boolean }} parts
 * @returns {any[]}
 */
export function listRows({ catalog, templates, systemsShown }) {
  return mergeTemplates(systemsShown ? catalog : [], templates)
}

/**
 * The list as drawn: the finished sites first, then the design systems.
 *
 * The same order the tab in dsh builds (`host/index.ts`: brands, then templates, then the 152) —
 * a finished site is the shortest way to a site, so it is not buried at row ninety. One id can
 * only be drawn once; the finished site wins its own id, because it is the one published today.
 * @param {any[]} catalog
 * @param {any[]} templates
 * @returns {any[]}
 */
/** The creation workspace's mount — `ONBOARDING_MOUNT` in `apps/tracy-web/src/workspace/scope.js`. */
const ONBOARDING_MOUNT = '/new'

export function mergeTemplates(catalog, templates) {
  const ids = new Set(templates.map((row) => row.id))
  return [...templates, ...catalog.filter((row) => !ids.has(row.id))]
}

/**
 * Where a visitor goes to build: the creation workspace, with the press carried on the address
 * (`?inspiration=&platform=`). The Build tab hands the id
 * to `POST /api/sites` as `design`, where a template id resolves to that platform's release
 * (`isTemplateId` / `templateRelease`) and a design system id resolves to a design plan — one door
 * for both, so a finished site needs no road of its own.
 *
 * 🔒 THIS LINK DOES NOT DECIDE ABOUT THE SESSION, AND THAT IS THE FIX. It used to read
 * `/login?next=/agent?…`: every press went through the sign-in form, and the sign-in door answers
 * with a form whether or not a session is present — so a visitor already signed in was asked to
 * sign in again, on the first press of the whole product (measured 19/09 on `cowork.tracy.site`).
 * `/new/` is the one road: it admits a signed-in visitor and redirects the rest to
 * `/login?next=/new/…`, which lands back here. `/agent` is gone from it too — `workspace/scope.js`
 * keeps that path only as a Worker-era alias it folds onto `/new/`.
 *
 * 🔒 A FINISHED SITE FORKS NOTHING. `?fork=` starts a brand extraction on the new site, which is
 * what a design system wants: it is about to wear the visitor's brand. A template IS the site,
 * words and all, so carrying the domain would set a job running that nothing ever reads.
 *
 * 🔒 THE CAMPAIGN RIDES ALONG (spec 4.7, sarahxbt 05/10/2026). A visitor who arrived with `utm_*` on
 * this page (the demo banner's link, an email, the blog) keeps them on the way to `/new/`, which hands
 * them to `/login?next=…`, where the first sign-in records them (`apps/tracy-web/src/lib/sign-in-source.js`
 * reads and cleans them; this only copies). Only the four keys it reads, nothing else of the page.
 * @param {string | null} domain the site the visitor had read, when they had one read
 * @param {{ id: string, template?: unknown }} inspiration the card they pressed Create with on
 * @param {string} platform
 * @param {string} [search] this page's query (`location.search`), passed in so tests need no window
 * @returns {string}
 */
export function buildUrl(domain, inspiration, platform, search = '') {
  const params = new URLSearchParams()
  if (domain && inspiration.template === undefined) params.set('fork', domain)
  params.set('inspiration', inspiration.id)
  params.set('platform', platform)
  const page = new URLSearchParams(search)
  for (const key of UTM_KEYS) {
    const value = page.get(key)
    if (value) params.set(key, value)
  }
  return `${ONBOARDING_MOUNT}/?${params.toString()}`
}

/** The source keys a first sign-in records; any other parameter of this page stays here. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']
