/**
 * Inner pages: the home page is one layout of many. A customer who picks a system sees it on every
 * page, so a pass (pass-joomla.mjs, pass-wordpress.mjs, `--inner <n>`) also measures up to n pages of
 * other kinds, picked off the running site:
 *
 *   1. a content page reached from the home page's own content (an article, a product, a service);
 *   2. a page from its menu, a list or a contact page first (a blog, a category, a shop, a form).
 *
 * Each is measured the way the home page is (flow.mjs --page): its default snapped, then the systems
 * (`--inner-systems`, a few, one dark and one light by default in the sweep) and both controls. A page
 * where the slot's module position does not render shows no system at all: flow.mjs reports it
 * as a miss, which is what a customer would see.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser } from './cdp.mjs'

// files, accounts, search, feeds and print views are not pages a visitor reads a layout on
const SKIP =
  /\.(jpe?g|png|gif|webp|svg|pdf|zip|docx?|xlsx?|mp4|mp3)(\?|$)|\/(wp-admin|wp-login|administrator|login|logout|register|cart|checkout|my-account|feed|search)\b|[?&](tmpl|format|print|option=com_users|task)=|\/component\/(users|search|finder)\b/i
// a menu page of a kind the home page is not: lists, contact forms, shops, services
const LISTISH =
  /contact|lien-?he|blog|news|tin-?tuc|categor|shop|product|store|service|portfolio|team|about|gioi-?thieu/i

/**
 * Up to `n` inner pages of the running site, as paths: content first, then the menu.
 * @param {string} site  origin of the running site
 * @param {{ start?: string, n?: number, cdp: number }} opts
 * @returns {Promise<{ path: string, kind: 'content' | 'menu' }[]>}
 */
export async function pickInnerPages(site, { start = '/', n = 2, cdp }) {
  const b = await browser(cdp)
  let links = []
  try {
    await b.open(`${site}${start}`, 1440)
    links = await b.evaluate(`(() => {
      // the page's own chrome, by landmark and by the ids the frameworks give it (T4 #t4-header, T3
      // #t3-mainnav, Gavern #gkHeader); not any class with "header" in it (a card's .card-header)
      const chrome = 'header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [id$="header" i], [id$="footer" i], [id*="mainnav" i], [id*="megamenu" i], [class*="megamenu" i], [class*="navbar" i], [id*="offcanvas" i], [class*="offcanvas" i]'
      const out = []
      for (const a of document.querySelectorAll('a[href]')) {
        let u
        try { u = new URL(a.getAttribute('href'), location.href) } catch { continue }
        if (u.origin !== location.origin) continue
        const r = a.getBoundingClientRect()
        const inMenu = !!a.closest(chrome)
        // T3's off-canvas drawer: its script moves it out of the header to the top of the body, and a drawer
        // on the right is display: none until its toggle opens it, so its links are neither chrome nor seen
        const drawer = !inMenu && !!a.closest('#t3-off-canvas, .t3-off-canvas')
        const hidden = r.width < 2 || r.height < 2
        // a hidden link is fine in a menu (a dropdown), not in the content (a hidden drawer's: the last resort below)
        if (!inMenu && hidden && !drawer) continue
        out.push({
          path: u.pathname + u.search,
          inMenu,
          drawer: drawer && hidden,
          inFooter: !!a.closest('footer, [role="contentinfo"], [id$="footer" i]'),
          titled: !!a.closest('h1, h2, h3, h4, h5, [class*="title" i], [class*="readmore" i], [class*="read-more" i]'),
          text: (a.textContent || '').trim().slice(0, 40)
        })
      }
      return out
    })()`)
  } finally {
    b.close()
  }
  const home = new Set(['/', '/index.php', '/index.php/', start, start.replace(/\/$/, '')])
  const usable = links.filter((l) => !home.has(l.path) && !SKIP.test(l.path) && !l.path.startsWith('/#'))
  // candidates in order: a titled link in the content, then any content link; a list or contact page
  // in the menu, then any menu page. The first of each kind that answers 200 is taken (a dead demo
  // link is no page to measure)
  const contentLinks = [
    ...usable.filter((l) => !l.inMenu && !l.drawer && !l.inFooter && l.titled),
    ...usable.filter((l) => !l.inMenu && !l.drawer && !l.inFooter && !l.titled)
  ]
  const menuLinks = usable.filter((l) => l.inMenu && !l.inFooter)
  const ordered = [
    ...menuLinks.filter((l) => LISTISH.test(l.path) || LISTISH.test(l.text)),
    ...menuLinks.filter((l) => !(LISTISH.test(l.path) || LISTISH.test(l.text)))
  ]
  const answers = async (path) => {
    const res = await fetch(`${site}${path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(180_000)
    }).catch(() => null)
    return res?.status === 200 && new URL(res.url).origin === new URL(site).origin
  }
  const live = []
  for (const [kind, list] of /** @type {const} */ ([
    ['content', contentLinks],
    ['menu', ordered]
  ])) {
    const seen = new Set(live.map((p) => p.path))
    for (const l of list.slice(0, 6)) {
      if (seen.has(l.path)) continue
      seen.add(l.path)
      if (await answers(l.path)) {
        live.push({ path: l.path, kind })
        break
      }
    }
  }
  // a one-page template whose menu only scrolls the home page (#about_me, #contact) and whose other pages hang off
  // a hidden drawer alone (JA Resume: Blog, Social Feed and Contact Us behind its "More" button, 15/10/2026):
  // the drawer's pages, a list or contact page first, only when nothing else answered
  if (!live.length) {
    const drawerLinks = usable.filter((l) => l.drawer)
    for (const l of [
      ...drawerLinks.filter((x) => LISTISH.test(x.path) || LISTISH.test(x.text)),
      ...drawerLinks.filter((x) => !(LISTISH.test(x.path) || LISTISH.test(x.text)))
    ].slice(0, 6))
      if (await answers(l.path)) {
        live.push({ path: l.path, kind: 'menu' })
        break
      }
  }
  return live.slice(0, n)
}

/**
 * Measure each picked page: default snapped, then the systems with both controls (flow.mjs).
 * @param {{ here: string, pages: { path: string, kind: string }[], snap: string[], common: string[], evidence: string, systems: string[] }} o
 *   snap: flow.mjs's arguments that read a page (cms, template, site, cdp); common: those plus what
 *   writes a system into this stand (its database or container)
 * @returns {{ page: string, kind: string, pass?: string, misses?: string[], lowContrast?: string[], scroll?: string[], left?: (number[] | null)[], error?: string }[]}
 */
export function measureInner({ here, pages, snap, common, evidence, systems }) {
  const out = []
  pages.forEach((p, i) => {
    const dir = join(evidence, `inner-${i + 1}`)
    mkdirSync(dir, { recursive: true })
    const flow = (args) =>
      spawnSync(process.execPath, [join(here, 'flow.mjs'), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 })
    flow([...snap, '--page', p.path, '--out', join(dir, 'baseline'), '--snap'])
    const run = flow([
      ...common,
      '--page',
      p.path,
      '--out',
      join(dir, 'final'),
      '--baseline',
      join(dir, 'baseline/default.json'),
      ...systems
    ])
    const file = join(dir, 'final/flow.json')
    if (!existsSync(file)) {
      out.push({ page: p.path, kind: p.kind, error: (run.stderr || run.stdout || '').slice(-300) })
      return
    }
    const f = JSON.parse(readFileSync(file, 'utf8'))
    const sys = f.verdicts.filter((v) => v.kind === 'system')
    out.push({
      page: p.path,
      kind: p.kind,
      pass: `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`,
      misses: [
        ...new Set(sys.flatMap((v) => (v.misses ?? []).map((m) => `${v.label}/${v.vw}:${m.split('=')[0]}`)))
      ],
      // the same reading as the home page's: under 4.5:1 and worse than the page's own default
      lowContrast: sys.flatMap((v) =>
        (v.contrast ?? [])
          .filter(
            (c) =>
              c.regressed ??
              (c.ratio < 4.5 &&
                c.ratio <
                  (f.rows[0].views[v.vw].contrast?.find((o) => o.name === c.name)?.ratio ?? 99) - 0.05)
          )
          .map((c) => `${v.label}/${v.vw}:${c.name} ${c.ratio}`)
      ),
      scroll: f.rows.slice(1).flatMap((r) =>
        Object.entries(r.views ?? {})
          .filter(([vw, v]) => v.horizontalScroll && !f.rows[0].views?.[vw]?.horizontalScroll)
          .map(([vw]) => `${r.label}/${vw}`)
      ),
      left: sys.map((v) => (v.left ? [v.left.first.share, v.left.page.share] : null))
    })
  })
  return out
}

/**
 * Pick and measure, never fatal: an inner page that cannot be found or measured is said in the
 * summary, and the home page's verdict stands.
 * @param {{ site: string, start?: string, n: number, cdp: number } & Omit<Parameters<typeof measureInner>[0], 'pages'>} o
 */
export async function innerPass({ site, start = '/', n, cdp, ...rest }) {
  try {
    const pages = await pickInnerPages(site, { start, n, cdp })
    if (!pages.length)
      return [{ page: null, kind: null, error: 'no inner page answers 200 off the home page' }]
    return measureInner({ pages, ...rest })
  } catch (e) {
    return [{ page: null, kind: null, error: String(e?.message ?? e).slice(0, 300) }]
  }
}
