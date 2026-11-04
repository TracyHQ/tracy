// Fixtures for the site check's page groups: invented pages of an invented club (Quay Fitness Studio), read by the REAL host
// judge (`runDemoQa` of tracy-host) through a fake `read`, so a verdict in these tests is the host's own. No browser opens.
import { demoQaBody, runDemoQa } from '../../tracy-host/src/demo-qa.js'
import { CONTRACT } from './_write-step-run.mjs'
import { checkSite, report, written } from './_site-check.mjs'

export const DEMO_WORDS = 'Become the fittest and healthiest version of yourself'
export const OWN_WORDS = 'Strength coaching for every level at Quay Fitness Studio'
export const DEMO_PICTURE = 'images/demo/hero-athlete.jpg'
export const OWN_PICTURE = 'images/tracy-content/quay-hall.jpg'

/** One page as the host's browser half reads it. */
export const pageRead = (path, over = {}) => ({
  path,
  url: `http://site.test${path}`,
  status: 200,
  error: null,
  loadMs: 120,
  blocks: [{ text: OWN_WORDS, selector: 'main p' }],
  images: [
    {
      src: `http://site.test/${OWN_PICTURE}`,
      sha256: 'bb22',
      width: 800,
      height: 400,
      broken: false,
      kind: 'img',
      selector: 'main img'
    }
  ],
  text: OWN_WORDS,
  ctas: [],
  labels: [],
  sheets: [],
  ...over
})

/** The same page still showing the template's demo. */
export const demoRead = (path, over = {}) =>
  pageRead(path, {
    blocks: [{ text: DEMO_WORDS, selector: 'main p' }],
    text: DEMO_WORDS,
    images: [
      {
        src: `http://site.test/${DEMO_PICTURE}`,
        sha256: 'aa11',
        width: 800,
        height: 400,
        broken: false,
        kind: 'img',
        selector: 'main img'
      }
    ],
    ...over
  })

/**
 * A host that answers as tracy-host does: `payload` goes through the host's own request reader and judge over `reads`
 * (path to page read). `measures(paths)` gives the browser measures it would add. Every payload is kept in `calls`.
 */
export function fakeHost(reads, { measures, fail } = {}) {
  const calls = []
  const host = async ({ timeoutMs: _timeoutMs, ...payload }) => {
    calls.push(payload)
    if (fail) throw new Error(fail)
    const asked = demoQaBody({ label: 'bench-abc', platform: 'joomla', ...payload })
    const out = await runDemoQa({
      asked,
      base: 'http://site.test',
      read: async (_url, asked) => {
        // Joomla answers `/index.php/<route>`; the pages here are named by their route.
        const path = asked.replace(/^\/index\.php(?=\/)/, '')
        return reads[path]
          ? { ...reads[path], path: asked }
          : pageRead(asked, { status: 404, blocks: [], images: [], text: '' })
      }
    })
    const paths = out.pages
    return { ...out, ...(measures ? { pageMeasures: measures(paths) } : {}) }
  }
  return { host, calls }
}

/** Kept pages for the site's inspect: home, then `about-1`... */
export const keptPages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    entity: `menuItem-${i + 1}`,
    route: i === 0 ? 'home' : `page-${i}`,
    link: 'index.php?view=featured',
    assignedModules: i === 0 ? [{ entity: 'module-2' }] : []
  }))

/** A site that holds its ordered words and lists `n` kept pages; `held` adds slots (key to current value). */
export function pagedSite(n, held = {}, extraSlots = []) {
  const slots = [
    { key: 'module-2.1', entity: 'module-2', type: 'text', current: OWN_WORDS },
    { key: 'module-2.9', entity: 'module-2', type: 'image', current: OWN_PICTURE },
    ...Object.entries(held).map(([key, current]) => ({
      key,
      entity: key.slice(0, key.lastIndexOf('.')),
      type: 'text',
      current
    })),
    ...extraSlots
  ]
  return checkSite(
    {},
    { inspect: { ok: true, contract: CONTRACT, revision: 'rev-1', pages: keptPages(n), slots } }
  )
}

/** The write report of a site that was ordered its own words (and one picture). */
export const writtenReport = (over = {}) =>
  report(
    [
      written('block-2.1', 'module-2.1', OWN_WORDS),
      written('block-2.9', 'module-2.9', OWN_PICTURE, { part: 'picture' })
    ],
    over
  )
