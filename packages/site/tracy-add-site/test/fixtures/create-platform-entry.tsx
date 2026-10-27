/**
 * Browser fixture for the "Create with <CMS>" regressions (#381, #386).
 *
 * Nothing here hands the wizard a `tab.meta` of its own making. The page runs, for real:
 *   - better-sidebar's store and service (`vendor/tracy/dsh-better-sidebar`), with its REAL native
 *     write face (`native/surface.ts`) and record registry (`native/tab-adapter.tsx`) — the rules a
 *     Tracy tab lives by since 0.21.1: every open goes to dsh's right column, ids are minted there,
 *     and a navigation of a tab already open refreshes `path`/`url` but never `meta`;
 *   - this plugin's `apply()`, which registers the Add site tab type;
 *   - `tracy-tab-link`'s `apply()`, which opens a press arriving as the intent cookie
 *     (`tracy-web`'s redirect), on the address (`/new/?inspiration=…`, forwarded as it stands —
 *     #392) or as the intent stash (a reload);
 *   - `tracy-design-inspiration`'s `markChosenDesign` + `landBuildTab`, the two calls `buildOpener`
 *     makes for a press inside the creation workspace.
 * Only dsh's right column itself (`ctx.sidebarRight`) is a double, keeping its page rules: one tab
 * per kind in a session's pane, an open of a kind already there focuses it and navigates it with the
 * new params, the landed tab is the active one, and a layout restored with the session carries NO
 * navigation params (`ui-sidebar-right` `tab-domain.ts` `sync`). The descriptor's component is
 * rendered with the record the side card keeps for that tab, the way `NativeTabBody` does. Only
 * `window.fetch` is mocked.
 *
 * The address sets the scene (read once, before any plugin runs):
 *   - `start=empty` (nothing open) · `plus` (the `+` list opened Add site, bare; the default) ·
 *     `press` (an earlier press of `prior` opened it) · `restored` (the session loads with an Add
 *     site tab in its layout — and, like every restored native tab, without the meta it had).
 *   - `prior=<card>:<platform>` — that earlier press (`start=press`).
 *   - `off=<platform>` — that platform switched off in the tab's gear (`pluginSettings`).
 *   - `workspace=fresh` — `tracy-tab-link` gets a `uiWorkspace` whose `startSession` returns BEFORE
 *     the new session (`fresh-session`) exists, as dsh's does; without it there is no workspace
 *     service and a press opens in the session in sight.
 * Every other parameter (`tab`, `design`, …) is the page's own address, read by the plugins.
 *
 * `window.__harness`: `press(card, platform, opts)` presses a card the way `buildOpener` does;
 * `holdTemplates()`/`releaseTemplates()` hold `/api/templates` answers and release them newest
 * first; `addSiteTabs()` lists the Add site tabs of the session in sight; `posts` holds every
 * `POST /api/sites` body; `session()` is the session the side card is bound to; `started` counts
 * `startSession` calls; `questionCalls` holds every `GET /api/sites/questions` address, which answers the questions
 * of the template asked about (`QUESTIONS`), or `questionsAnswer` when a test sets one (a status, or no questions).
 */
import { createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'
import { apply as applyTabLink } from '../../../../ui/tracy-tab-link/src/client/index'
import { createBetterSidebarService } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/service'
import { createSidebarStore } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/state'
import { createNativeSurface } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/native/surface'
import { createNativeTabRecords } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/native/tab-adapter'
import { landBuildTab } from '../../../../design/tracy-design-inspiration/src/client/build-handoff.mjs'
import { markChosenDesign } from '../../../../design/tracy-design-inspiration/src/client/dsh-url'

interface LaidTab {
  id: string
  type: string
  title?: string
  meta?: unknown
}

interface PressOptions {
  /** `pending`: only the first open; `ready`: only the second; absent: both, as a blank session does. */
  stage?: 'pending' | 'ready'
  pressedAt?: number
  /** Land it in this session instead of the one in sight (`landBuildTab`'s scope). */
  sessionId?: string
}

declare global {
  interface Window {
    __harness: {
      registered: boolean
      posts: Array<Record<string, unknown>>
      questionCalls: string[]
      questionsAnswer: { status: number; body: Record<string, unknown> } | null
      /** A copy of the questionnaire served for a template, for a test to change and serve as `questionsAnswer`. */
      served: (design: string) => Record<string, unknown>
      /** The role of every `POST /api/sites/brand-files`, in order. */
      uploads: string[]
      /** What the upload door answers; null answers 201 with a fresh id. */
      brandAnswer: { status: number; body: Record<string, unknown> } | null
      /** The texts sent to `POST /api/sites/brief/rewrite`, in order. */
      rewrites: string[]
      /** The `again` flag sent with each of them. */
      agains: boolean[]
      /** What the rewrite door answers; null answers `{ text: 'In clearer words: <text>' }`. */
      rewriteAnswer: { status: number; body: Record<string, unknown> } | null
      /** Hold every rewrite answer until `releaseRewrites`: a rewrite that comes back late. */
      holdRewrites: () => void
      releaseRewrites: () => void
      templateCalls: number
      holdQuestions: () => void
      releaseQuestions: () => void
      /** Design system doors: the quickstart tags the support door says yes to (none by default: every card dimmed). */
      dsSupported: string[]
      /** Every support question asked, as `<tag>|<platform>`. */
      dsSupportCalls: string[]
      /** The ids posted to `POST /api/sites/<key>/design-system`, in order. */
      dsApplies: string[]
      /** What the build's poll answers (the job door); the default is a build still running with no step. */
      jobAnswer: Record<string, unknown> | null
      /** `<tag>|<platform>|<id>` of every preview the popup asked for. */
      dsPreviewCalls: string[]
      /** The preview door answers "not available" (a platform it cannot preview, no demo). */
      dsPreviewUnavailable: boolean
      /**
       * How else the preview door answers: `unreadable` is 409 DEMO_UNREADABLE (the demo did not answer it),
       * `error` a 502, `hang` never (a request queued behind a full connection pool); null is the page.
       */
      dsPreviewAnswer: 'unreadable' | 'error' | 'hang' | null
      /**
       * The live frame's address: set, the door answers a popup's `live=1` with `{ live: true, src, mode: 'dark',
       * modes: true }` (a two-mode template, a system that declares dark); null: the static page.
       */
      dsPreviewLive: string | null
      /** The library door answers this many generated systems instead of its three (a large library). */
      dsLibraryCount: number
      press: (card: string, platform: string, opts?: PressOptions) => void
      holdTemplates: () => void
      releaseTemplates: () => void
      activeTab: () => { id: string; kind: string; meta?: unknown } | undefined
      addSiteTabs: () => LaidTab[]
      session: () => string | undefined
      started: number
      returnToAddSite: () => void
    }
  }
}

function t(key: string, params?: Record<string, string | number>): string {
  // A test may draw the form in another language: it sets `window.__tasStrings` before the page loads.
  const table = (window as unknown as { __tasStrings?: Record<string, string> }).__tasStrings ?? en
  const raw = table[key] ?? en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

const query = new URLSearchParams(window.location.search)
const SESSION = 'fixture-session'
const TYPE = 'tracy:add-site'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// The two cards as the catalogue names them: Tracy Base is template `tracy` (Joomla + WordPress),
// Tracy Business builds on all three. Absolute images, so the wizard shows its "Starts from" card.
const CARDS = [
  {
    id: 'tracy',
    label: 'Tracy Base',
    card: { category: 'Portfolio', image: `${window.location.origin}/base.png` },
    platforms: [{ platform: 'joomla', tag: 'tracy-base/joomla-6' }, { platform: 'wordpress' }]
  },
  {
    id: 'tracy-business',
    label: 'Tracy Business',
    card: {
      category: 'Business',
      image: `${window.location.origin}/business.png`,
      demo: {
        url: `${window.location.origin}/template-demo`,
        probe: `${window.location.origin}/api/templates/tracy-business/demo-frame`
      },
      layouts: [
        {
          key: 'home',
          path: '/template-demo',
          shots: { desktop: `${window.location.origin}/api/templates/tracy-business/shots/business-home.png` }
        }
      ]
    },
    platforms: [
      { platform: 'joomla', tag: 'tracy-business/joomla-6' },
      { platform: 'wordpress', tag: 'tracy-business/wordpress-7' },
      { platform: 'emdash', tag: 'tracy-business/emdash-0.x' }
    ]
  },
  // A template no content contract seals: its build keeps the template's own words, so the popup is not offered for it.
  {
    id: 'unsealed-demo',
    label: 'Unsealed demo',
    card: { category: 'Business', image: `${window.location.origin}/base.png` },
    platforms: [
      { platform: 'joomla', apply: false },
      { platform: 'wordpress', apply: true }
    ]
  },
  // A quickstart pack on a local stand: shots named by bare file name (no picture the page can
  // load), and a build for Joomla only — the card the form used to name nothing for.
  {
    id: 'long-languages',
    label: 'Long languages',
    card: { category: 'Education', image: `${window.location.origin}/base.png` },
    platforms: [{ platform: 'joomla' }]
  },
  {
    id: 'local-ja-kinetic',
    label: 'ja_kinetic (local)',
    card: {
      category: 'Portfolio',
      image: 'ja-kinetic-home-1440.png',
      layouts: [{ key: 'home', shots: { desktop: 'ja-kinetic-home-1440.png' } }]
    },
    platforms: [{ platform: 'joomla' }]
  }
]
const LABELS: Record<string, string> = {
  tracy: 'Tracy Base',
  'tracy-business': 'Tracy Business',
  'unsealed-demo': 'Unsealed demo',
  'long-languages': 'Long languages',
  'local-ja-kinetic': 'ja_kinetic (local)'
}

// The questionnaires `GET /api/sites/questions` serves, one per template, the way /ops makes them differ: Tracy Business
// asks for a name, a description, a sector (flagged required: the sheet lists it first with a Recommended tag; and, for
// one sector, a licence) and the site languages; Tracy Base asks two
// lines; a template with no set of its own falls to the CMS's two-line standard.
const set = (id: string, hash: string) => ({ id, revision: 1, contentHash: hash.repeat(64) })
const QUESTIONS: Record<string, Record<string, unknown>> = {
  'tracy-business': {
    source: 'quickstart',
    owner: 'tracy-business/emdash',
    quickstart: 'tracy-business/emdash',
    set: set('business-set', 'a'),
    questions: [
      {
        id: 'name',
        kind: 'text',
        step: 1,
        label: 'Company name',
        hint: 'Golden Crust',
        feeds: ['site.name', 'agent']
      },
      {
        id: 'about',
        kind: 'longtext',
        step: 1,
        label: 'What does the company do?',
        hint: 'We bake bread',
        feeds: ['copy.about', 'agent']
      },
      {
        id: 'sector',
        kind: 'choice',
        step: 1,
        label: 'Sector',
        required: true,
        options: ['construction', 'bakery', 'other'],
        optionLabels: { construction: 'Construction', bakery: 'Bakery', other: 'Something else' },
        feeds: ['agent']
      },
      {
        id: 'licence',
        kind: 'text',
        step: 1,
        label: 'Contractor licence number',
        feeds: ['agent'],
        showWhen: { all: [{ question: 'sector', is: 'construction' }] }
      },
      {
        id: 'languages',
        kind: 'languages',
        step: 2,
        label: 'Site language',
        options: ['en', 'ru', 'vi'],
        feeds: ['site.languages']
      }
    ]
  },
  tracy: {
    source: 'quickstart',
    owner: 'tracy/wordpress',
    quickstart: 'tracy/wordpress',
    set: set('base-set', 'b'),
    questions: [
      { id: 'name', kind: 'text', step: 1, label: 'Business name', feeds: ['site.name', 'agent'] },
      {
        id: 'about',
        kind: 'longtext',
        step: 1,
        label: 'One line about your business',
        feeds: ['copy.about', 'agent']
      }
    ]
  },
  // A quickstart that offers many languages (a Joomla one carries 49): the popup draws a search box, not a wall of pills.
  'long-languages': {
    source: 'quickstart',
    owner: 'long-languages/joomla',
    quickstart: 'long-languages/joomla',
    set: set('long-set', 'd'),
    questions: [
      { id: 'name', kind: 'text', step: 1, label: 'Company name', feeds: ['site.name', 'agent'] },
      {
        id: 'languages',
        kind: 'languages',
        step: 1,
        label: 'Site language',
        options: ['en', 'vi', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'pl', 'ru', 'ja', 'ko'],
        feeds: ['site.languages']
      }
    ]
  },
  // The seven default questions as the standard file serves them (07/10/2026, TracyHQ/tch#1013): brand uploads on, so
  // the logo (two tiles: JA Kinetic has a dark mode) and the favicon come; the pages arrive filled in from the template.
  'local-ja-kinetic': {
    source: 'standard',
    owner: 'joomla',
    quickstart: 'ja-kinetic/j6',
    set: set('seven-set', 'e'),
    languages: 'one',
    questions: [
      {
        id: 'name',
        kind: 'text',
        step: 1,
        label: 'Business name',
        hint: 'Write it exactly as customers should see it.',
        feeds: ['site.name', 'agent']
      },
      {
        id: 'logo',
        kind: 'logo',
        step: 1,
        label: 'Logo',
        hint: 'Add your logo for both light and dark themes.',
        variants: ['light', 'dark'],
        feeds: ['site.logo']
      },
      {
        id: 'favicon',
        kind: 'favicon',
        step: 1,
        label: 'Favicon',
        hint: 'The small icon in the browser tab.',
        feeds: ['site.favicon']
      },
      {
        id: 'about',
        kind: 'longtext',
        step: 1,
        label: 'One line about your business',
        hint: 'What you do, for whom, and what makes you the right choice.',
        feeds: ['copy.about', 'agent']
      },
      {
        id: 'pages',
        kind: 'multi',
        step: 1,
        label: 'Pages',
        hint: 'Every page in this design is included. Untick the ones you do not need.',
        options: ['home', 'features', 'pricing', 'contact'],
        optionLabels: { home: 'Home', features: 'Features', pricing: 'Pricing', contact: 'Contact' },
        locked: ['home'],
        feeds: ['site.pages']
      },
      {
        id: 'languages',
        kind: 'languages',
        step: 2,
        label: 'Site language',
        hint: 'Your site is written in this language.',
        options: ['en-gb', 'en-us', 'vi-vn', 'de-de', 'fr-fr'],
        feeds: ['site.languages']
      },
      {
        id: 'tone',
        kind: 'choice',
        step: 2,
        label: 'Tone',
        hint: 'Sets the writing style Tracy uses for the text on your site.\nPlain is direct, Warm is friendly, Bold is confident.',
        options: ['plain', 'warm', 'bold'],
        optionLabels: { plain: 'Plain', warm: 'Warm', bold: 'Bold' },
        feeds: ['copy.tone', 'agent']
      }
    ]
  },
  default: {
    source: 'standard',
    owner: 'wordpress',
    quickstart: null,
    set: set('standard-set', 'c'),
    questions: [
      { id: 'name', kind: 'text', step: 1, label: 'Business name', feeds: ['site.name', 'agent'] },
      {
        id: 'about',
        kind: 'longtext',
        step: 1,
        label: 'One line about your business',
        feeds: ['copy.about', 'agent']
      }
    ]
  }
}

let holding = false
const held: Array<() => void> = []
let holdingQuestions = false
const heldQuestions: Array<() => void> = []
let holdingRewrites = false
const heldRewrites: Array<() => void> = []

const harness: Window['__harness'] = {
  registered: false,
  posts: [],
  questionCalls: [],
  questionsAnswer: null,
  served: (design: string) => structuredClone(QUESTIONS[design] ?? QUESTIONS.default),
  uploads: [],
  brandAnswer: null,
  rewrites: [],
  agains: [],
  rewriteAnswer: null,
  holdRewrites: () => {
    holdingRewrites = true
  },
  releaseRewrites: () => {
    holdingRewrites = false
    for (const release of heldRewrites.splice(0)) release()
  },
  templateCalls: 0,
  holdQuestions: () => {
    holdingQuestions = true
  },
  releaseQuestions: () => {
    holdingQuestions = false
    for (const release of heldQuestions.splice(0)) release()
  },
  dsSupported: (window as unknown as { __dsSupported?: string[] }).__dsSupported ?? [],
  dsSupportCalls: [],
  dsApplies: [],
  jobAnswer: null,
  dsPreviewCalls: [],
  dsPreviewUnavailable:
    (window as unknown as { __dsPreviewUnavailable?: boolean }).__dsPreviewUnavailable === true,
  dsPreviewAnswer:
    (window as unknown as { __dsPreviewAnswer?: 'unreadable' | 'error' | 'hang' }).__dsPreviewAnswer ?? null,
  dsLibraryCount: (window as unknown as { __dsLibraryCount?: number }).__dsLibraryCount ?? 0,
  dsPreviewLive: (window as unknown as { __dsPreviewLive?: string }).__dsPreviewLive ?? null,
  press: () => undefined,
  holdTemplates: () => {
    holding = true
  },
  releaseTemplates: () => {
    holding = false
    // Newest first: an answer for an earlier press arriving LAST is the race a stale card loses.
    for (const release of held.splice(0).reverse()) release()
  },
  activeTab: () => undefined,
  addSiteTabs: () => [],
  session: () => undefined,
  started: 0,
  returnToAddSite: () => undefined
}
window.__harness = harness

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = new URL(url, window.location.href).pathname
  const method = (init?.method ?? 'GET').toUpperCase()
  if (path === '/auth/me') return json(200, { email: 'fixture@tracy.ai' })
  if (path === '/api/config') return json(200, { siteDomain: 'tracy.ai', sitePort: '' })
  if (path.endsWith('/demo-frame')) return json(200, { framable: !query.has('template-unframable') })
  if (path === '/api/templates') {
    harness.templateCalls += 1
    if (query.has('catalogue-failed')) return json(503, { error: 'Catalogue unavailable' })
    if (holding) await new Promise<void>((resolve) => held.push(resolve))
    // `template-light-only`: Tracy Business's demo has no dark mode (its card says `dark: false`).
    if (query.has('template-light-only'))
      return json(200, {
        templates: CARDS.map((row) =>
          row.id === 'tracy-business' ? { ...row, card: { ...row.card, dark: false } } : row
        )
      })
    return json(200, { templates: CARDS })
  }
  if (path === '/api/design-system/library' && harness.dsLibraryCount > 0)
    return json(200, {
      systems: Array.from({ length: harness.dsLibraryCount }, (_, i) => ({
        id: `refero:${String(i).padStart(4, '0')}`,
        kind: 'refero',
        name: `System ${i}`,
        description: 'Generated.',
        // The door's groups are the catalogue's industries, capitalised: one in ten Fintech, the rest SaaS, every
        // fiftieth with none (filed under Other).
        group: i % 50 === 49 ? null : i % 10 === 3 ? 'Fintech' : 'Saas',
        image: '/brand-screenshot.jpg',
        fonts: [],
        colors: ['#635bff'],
        ok: true
      }))
    })
  if (path === '/api/design-system/library')
    return json(200, {
      systems: [
        {
          id: 'stripe',
          kind: 'brand',
          name: 'Stripe',
          description: 'Calm fintech blues.',
          group: 'Fintech',
          // The library's own picture of the system (Refero's screenshot): the card's picture.
          image: '/brand-screenshot.jpg',
          fonts: ['Inter'],
          // Accent first, one repeat, one value that is not a colour: four dots, each once.
          colors: ['#635BFF', '#ffffff', '#0a2540', '#ffffff', 'blue', '#425466', '#f6f9fc'],
          ok: true
        },
        {
          id: 'airbnb',
          kind: 'brand',
          name: 'Airbnb',
          description: 'Refused.',
          group: 'Saas',
          image: null,
          fonts: [],
          ok: false
        },
        {
          id: 'editorial',
          kind: 'style',
          name: 'Editorial',
          description: 'Serif headlines.',
          group: 'Media',
          image: null,
          fonts: [{ family: 'Georgia' }],
          ok: true
        }
      ]
    })
  if (path === '/api/design-system/support') {
    const q = new URL(url, window.location.href).searchParams
    const tag = q.get('quickstart') ?? ''
    harness.dsSupportCalls.push(`${tag}|${q.get('platform') ?? ''}`)
    return harness.dsSupported.includes(tag)
      ? json(200, { supported: true, reason: null, need: null, have: null })
      : json(200, { supported: false, reason: 'no contract', need: null, have: null })
  }
  if (path === '/api/design-system/preview') {
    const q = new URL(url, window.location.href).searchParams
    harness.dsPreviewCalls.push(
      `${q.get('quickstart') ?? ''}|${q.get('platform') ?? ''}|${q.get('id') ?? ''}`
    )
    if (harness.dsPreviewUnavailable) return json(409, { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_DEMO' })
    if (harness.dsPreviewAnswer === 'unreadable')
      return json(409, { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'DEMO_UNREADABLE' })
    if (harness.dsPreviewAnswer === 'error') return json(502, { code: 'BAD_GATEWAY' })
    if (harness.dsPreviewLive && q.get('live') === '1')
      return json(200, { live: true, src: harness.dsPreviewLive, mode: 'dark', modes: true })
    if (harness.dsPreviewAnswer === 'hang')
      // Never answers; only the caller's own abort ends it, as it ends a real queued request.
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
    return new Response(
      `<!doctype html><html><head></head><body><h1 id="demo">Demo wearing ${q.get('id') ?? ''}</h1></body></html>`,
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // Stripe stands for a two-mode template's page (the door's header); Editorial for a one-look one.
          ...(q.get('id') === 'stripe' ? { 'x-tracy-ds-modes': 'both' } : {})
        }
      }
    )
  }
  if (/^\/api\/sites\/[^/]+\/design-system$/.test(path) && method === 'POST') {
    harness.dsApplies.push(String(JSON.parse(String(init?.body ?? '{}')).id))
    return json(200, { ok: true })
  }
  if (path === '/api/sites/questions') {
    harness.questionCalls.push(url)
    if (holdingQuestions) await new Promise<void>((resolve) => heldQuestions.push(resolve))
    const design = new URL(url, window.location.href).searchParams.get('design') ?? ''
    const set = harness.questionsAnswer
    return set ? json(set.status, set.body) : json(200, QUESTIONS[design] ?? QUESTIONS.default)
  }
  if (path === '/api/sites/brief/rewrite' && method === 'POST') {
    const sent = JSON.parse(String(init?.body ?? '{}')) as { text?: unknown; again?: unknown }
    const text = String(sent.text ?? '')
    harness.rewrites.push(text)
    harness.agains.push(sent.again === true)
    if (holdingRewrites) await new Promise<void>((resolve) => heldRewrites.push(resolve))
    const answer = harness.rewriteAnswer
    return answer ? json(answer.status, answer.body) : json(200, { text: `In clearer words: ${text}` })
  }
  if (path === '/api/sites/brand-files' && method === 'POST') {
    const form = init?.body as FormData
    harness.uploads.push(String(form.get('role')))
    const answer = harness.brandAnswer
    if (answer) return json(answer.status, answer.body)
    const id = `00000000-0000-4000-8000-${String(harness.uploads.length).padStart(12, '0')}`
    return json(201, { id, width: 1240, height: 320 })
  }
  if (path === '/api/sites' && method === 'POST') {
    harness.posts.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    if (harness.posts.at(-1)?.label === 'taken-domain') return json(409, { code: 'TAKEN' })
    return json(202, { siteKey: 'fresh.tracy.ai', jobId: 'job-fresh' })
  }
  if (path === '/api/sites') return json(200, { addressPrefix: '', sites: [] })
  if (/\/api\/sites\/[^/]+\/jobs\/[^/]+$/.test(path))
    return json(200, harness.jobAnswer ?? { state: 'running', step: '', output: '' })
  return json(404, {})
}) as typeof window.fetch

/** The meta `buildOpener` puts on the tab (`tracy-design-inspiration` `index.tsx`). */
const pressMeta = (card: string, platform: string, pressedAt: number): Record<string, unknown> => ({
  id: card,
  design: card,
  name: LABELS[card] ?? card,
  platform,
  pressedAt
})

const start = query.get('start') ?? 'plus'
const [priorCard, priorPlatform] = (query.get('prior') ?? '').split(':')

/** One tab of dsh's right column: its id, its kind, and the params its last navigation carried. */
interface NativeTab {
  id: string
  kind: string
  params: { title?: string; meta?: unknown } | undefined
}
/** The right column of each session: its page tabs, the active one, open or collapsed. */
const layouts = new Map<string, { tabs: NativeTab[]; active?: string; expanded: boolean }>()
const layoutOf = (sessionId: string) =>
  layouts.get(sessionId) ?? layouts.set(sessionId, { tabs: [], expanded: false }).get(sessionId)!
let minted = 0
const columnListeners = new Set<() => void>()
const changed = (): void => {
  for (const listener of columnListeners) listener()
}
const subscribeColumn = (listener: () => void): (() => void) => {
  columnListeners.add(listener)
  return () => columnListeners.delete(listener)
}
/** A page open: one tab per kind — focus and navigate the one there, or mint one — then expand. */
const place = (sessionId: string, kind: string, params: NativeTab['params']): void => {
  const layout = layoutOf(sessionId)
  let tab = layout.tabs.find((one) => one.kind === kind)
  if (tab === undefined) {
    minted += 1
    tab = { id: `tab-${minted}`, kind, params }
    layout.tabs.push(tab)
  } else tab.params = params
  layout.active = tab.id
  layout.expanded = true
  changed()
}
/** The session in sight: the page's own, until `workspace=fresh` starts another. */
let current = SESSION
const sidebarRight = {
  registerLauncher: () => () => undefined,
  mounted: { getSnapshot: () => current, subscribe: subscribeColumn },
  openTabs: { subscribe: subscribeColumn },
  openTab: (kind: string, options?: { params?: unknown }) => place(current, kind, options?.params as never),
  openTabIn: (sessionId: string, kind: string, options?: { params?: unknown }) =>
    place(sessionId, kind, options?.params as never),
  openResource: () => undefined,
  close: (tabId: string) => {
    const layout = layoutOf(current)
    layout.tabs = layout.tabs.filter((one) => one.id !== tabId)
    changed()
  },
  active: () => {
    const layout = layoutOf(current)
    const tab = layout.tabs.find((one) => one.id === layout.active)
    return tab && { id: tab.id, kind: tab.kind, meta: tab.params?.meta }
  },
  isExpanded: () => layoutOf(current).expanded,
  toggleExpanded: () => {
    layoutOf(current).expanded = !layoutOf(current).expanded
    changed()
  },
  focus: (tabId: string) => {
    if (layoutOf(current).tabs.some((one) => one.id === tabId)) layoutOf(current).active = tabId
    changed()
  }
}

// A layout restored with the session: the tab is there, its navigation params are not.
if (start === 'restored') {
  layoutOf(SESSION).tabs.push({ id: 'tab-restored', kind: TYPE, params: undefined })
  layoutOf(SESSION).active = 'tab-restored'
  layoutOf(SESSION).expanded = true
}

// dsh's session list, settled, with this page's session in the main view.
let list = { phase: 'ready', byId: { [SESSION]: { retainedBy: { mainView: 1 } } } }
const sessions = { list: { getSnapshot: () => list, subscribe: () => () => undefined } }
const getService = (name: string): unknown =>
  name === 'sidebarRight'
    ? sidebarRight
    : name === 'locale'
      ? { bind: () => t, register: () => () => undefined }
      : undefined

const store = createSidebarStore()
const service = createBetterSidebarService(store)
service.registerTab({
  id: 'tracy:design-inspiration',
  title: 'Design inspiration',
  component: () => null,
  single: true
})
const records = createNativeTabRecords()
service.setSurface(createNativeSurface({ get: getService, sessions } as never, records))
const off = query.get('off')
if (off) {
  const prefs = store.getPrefs()
  store.setPrefs({
    ...prefs,
    pluginSettings: { ...prefs.pluginSettings, [TYPE]: { [`platform_${off}`]: false } }
  })
}
store.setSession(SESSION)

/** The record the side card keeps for a native tab — minted on first sight, as `NativeTabBody` does. */
const recordOf = (tab: NativeTab): LaidTab =>
  records.ensure({
    id: tab.id,
    kind: tab.kind,
    title: 'Add site',
    params: tab.params,
    scope: { sessionId: current }
  }).tab as LaidTab

const addSiteTabs = (): LaidTab[] =>
  layoutOf(current)
    .tabs.filter((tab) => tab.kind === TYPE)
    .map((tab) => records.get(tab.id)?.tab ?? { id: tab.id, type: tab.kind, meta: tab.params?.meta })
harness.activeTab = sidebarRight.active
harness.addSiteTabs = addSiteTabs

const root = createRoot(document.getElementById('root') as HTMLElement)
const draw = (): void => {
  const descriptor = service.getTab(TYPE)
  const native = layoutOf(current).tabs.find((tab) => tab.kind === TYPE)
  if (!descriptor || !native) return
  if (layoutOf(current).active !== native.id) {
    root.render(null)
    return
  }
  root.render(
    createElement(descriptor.component as unknown as ComponentType<Record<string, unknown>>, {
      store,
      tab: recordOf(native),
      visible: true
    })
  )
}
store.subscribe(draw)
service.subscribe(draw)
records.subscribe(draw)
subscribeColumn(draw)
harness.returnToAddSite = () => {
  const tab = layoutOf(current).tabs.find((one) => one.kind === TYPE)
  if (tab) sidebarRight.focus(tab.id)
}

harness.press = (card, platform, opts = {}) => {
  const pressedAt = opts.pressedAt ?? Date.now()
  const meta = pressMeta(card, platform, pressedAt)
  const land = (setupPending: boolean, scope?: { sessionId: string }): void =>
    landBuildTab(
      service,
      sidebarRight,
      { type: TYPE, meta: { ...meta, setupFailed: false, setupPending } },
      scope
    )
  if (opts.sessionId !== undefined) {
    land(false, { sessionId: opts.sessionId })
    return
  }
  markChosenDesign(card)
  if (opts.stage !== 'ready') land(true)
  // A blank creation session is handed back as the fresh one (`buildOpener`): the second open is
  // scoped to the session already in sight.
  if (opts.stage !== 'pending') land(false, { sessionId: SESSION })
}

const ctx = {
  effect: (fn: () => unknown): void => {
    fn()
  },
  locale: { bind: () => t, register: () => undefined },
  // `sidebarRight` only. No `uiWorkspace`: a press opens in the session in sight, as it does once
  // `tracy-web` has made the session ahead of the redirect.
  get: getService
}
apply({ ...ctx, betterSidebar: service as never })
harness.session = () => store.getSnapshot().sessionId
// dsh's `startSession`: it returns at once, and the new session is listed, put in the main view,
// mounted in the right column and bound to the side card a beat later.
const workspace = {
  startSession: (): void => {
    harness.started += 1
    window.setTimeout(() => {
      list = {
        phase: 'ready',
        byId: { ...list.byId, [SESSION]: {}, 'fresh-session': { retainedBy: { mainView: 1 } } }
      }
      current = 'fresh-session'
      store.setSession('fresh-session')
      changed()
    }, 150)
  },
  openSession: (): void => undefined
}
applyTabLink({
  ...ctx,
  // No `uiWorkspace` by default: a press opens in the session in sight, as it does once `tracy-web`
  // has made the session ahead of the redirect.
  get: (name: string) =>
    name === 'uiWorkspace' && query.get('workspace') === 'fresh' ? workspace : getService(name),
  betterSidebar: service as never,
  sessions
})

// `seatOnlyTab` registers once `/auth/me` answers; then the scene is set.
const ready = window.setInterval(() => {
  if (!service.getTab(TYPE)) return
  window.clearInterval(ready)
  if (start === 'plus') service.openTab({ type: TYPE })
  if (start === 'press' && priorCard && priorPlatform)
    harness.press(priorCard, priorPlatform, { pressedAt: 1 })
  harness.registered = true
  draw()
}, 20)
