/**
 * PAGE-1: a page the customer unticked opens at no address any more (spec
 * `tasks/spec-template-customization-question-readiness.md`, PAGE-1).
 *
 * The template's side, four static parts per CMS: (1) each id of `tracy_site_pages.json` names
 * exactly one demo page (REL-2's index), the home the front page; (2) every translation of that
 * page is declared where a machine reads it (WordPress `editions.json` ids or `missing` of every
 * locale; EmDash a record of the same slug and a `localisedPath` in each `locales.all` locale);
 * (3) old addresses of a page live in data Tracy can clear (WordPress redirects option, Joomla
 * `#__redirect_links`, EmDash `redirects`), never in code; (4) the error page answers 404. Rows of
 * a redirect table that reach a page of the list are listed in `details` for Tracy.
 * On EmDash, hiding the page in every edition the site serves is Tracy's copy of the personalize tool (the theme's
 * `tools/personalize.mjs`, copied into the tracy-web image and run by Apply), so a clean EmDash release is `live-only`.
 */
import { demoLanguages } from '../readers/demo-languages.js'
import { themeRedirects } from '../readers/wordpress-addresses.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { demoTables } from '../readers/demo-tables.js'
import { findings, listed } from '../readers/rule-findings.js'
import { pagesFileFix, sitePagesOfRelease } from '../readers/site-pages-of-release.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'

const trimSlashes = (/** @type {string} */ p) => p.replace(/^\/?(index\.php\/)?|\/+$/g, '')

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpress(context, f, /** @type {string[]} */ ids) {
  const langs = /** @type {any} */ (await demoLanguages(context))
  const editions = langs.editions
  if (editions) {
    for (const [locale, l] of Object.entries(editions.locales ?? {})) {
      const known = new Set([...Object.keys(l?.ids ?? {}), ...(l?.missing ?? []).map(String)])
      const lost = ids.filter((id) => !known.has(`page-${id.split('/').pop()}`))
      if (lost.length) {
        f.owner('contract')
        f.problem(`editions.json locale ${locale} does not declare the translation of ${listed(lost)}`)
        break
      }
    }
  } else if (langs.carried.length > 1) {
    f.owner('contract')
    f.problem(
      'the demo has Polylang translations but the contract has no editions.json, so a translation of an unticked page stays open'
    )
  }
  const { option: name, rows } = themeRedirects(await wordpressDemo(context))
  for (const [from, to] of rows)
    if (ids.includes(trimSlashes(from)) || ids.includes(trimSlashes(to)))
      f.note(
        `Redirect ${from} → ${to} (option ${name}) reaches a page of the list: Tracy removes it with the page.`
      )
  await f.part('the theme files', async () => {
    const files = await templateSourceFiles(context)
    for (const [file, text] of files) {
      if (!file.endsWith('.php')) continue
      for (const m of text.matchAll(/wp_(?:safe_)?redirect\(\s*(?:home_url\(\s*)?['"]\/?([^'"]+)['"]/g))
        if (ids.includes(trimSlashes(m[1])))
          f.problem(`${file} redirects to /${m[1]} in code, out of Tracy's reach`)
    }
    if (!files.has('templates/404.html') && !files.has('404.php')) f.problem('the theme has no 404 template')
  })
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f, /** @type {string[]} */ ids) {
  const t = await demoTables(context)
  for (const r of t.rows('redirect_links')) {
    if (Number(r.published) !== 1) continue
    const hit = [r.old_url, r.new_url].map((u) =>
      trimSlashes(String(u ?? '').replace(/^https?:\/\/[^/]+/, ''))
    )
    if (hit.some((u) => ids.includes(u)))
      f.problem(`#__redirect_links row ${r.id} (${r.old_url} → ${r.new_url}) reaches a page of the list`)
  }
  await f.part('the template files', async () => {
    const error = (await templateSourceFiles(context)).get('error.php')
    if (error === undefined) f.problem('the template has no error.php')
    else if (/header\(\s*['"]Location|->redirect\(/.test(error))
      f.problem('error.php redirects instead of answering 404')
  })
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(context, f, /** @type {string[]} */ ids) {
  const model = await context.content.siteModel()
  const fallback = model.locales?.default ?? 'en'
  const others = (model.locales?.all ?? []).filter((/** @type {string} */ l) => l !== fallback)
  const items = (model.menus ?? []).find((/** @type {any} */ m) => m.name === 'primary')?.items ?? []
  const flat = (/** @type {any[]} */ list) => list.flatMap((i) => [i, ...flat(i.children ?? [])])
  for (const id of ids) {
    for (const locale of others) {
      if (!(model.records ?? []).some((/** @type {any} */ r) => r.slug === id && r.locale === locale))
        f.problem(`"${id}" has no ${locale} record, so its ${locale} page is not known to Tracy`)
      const item = flat(items).find(
        (i) =>
          String(i.path)
            .replace(/^\/|\/$/g, '')
            .split('/')
            .pop() === id
      )
      if (item && !item.localisedPath?.[locale])
        f.problem(`the menu entry of "${id}" has no ${locale} localisedPath`)
    }
  }
  for (const r of model.redirects ?? []) {
    const to = trimSlashes(String(r.to ?? r.destination ?? ''))
    if (ids.includes(to.split('/').pop() ?? ''))
      f.problem(
        `site-model.json redirect ${r.from ?? r.source} → ${r.to ?? r.destination} reaches a page of the list`
      )
  }
  await f.part('the theme files', async () => {
    const files = await templateSourceFiles(context)
    const notFound = files.get('src/pages/404.astro') ?? files.get('src/views/NotFound.astro') ?? ''
    if (!/Astro\.response\.status\s*=\s*404/.test(notFound))
      f.problem('the 404 page does not set Astro.response.status = 404')
  })
}

export const page1UntickedPageGone = {
  id: 'PAGE-1',
  title: 'A page the customer unticked opens at no address',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-1')
    // A missing or refused page list is REL-2's failure, and so is its fix.
    let noList = false
    await f.part('the page list and demo content', async () => {
      const a = await sitePagesOfRelease(context)
      if (!a.pages) {
        f.problem(a.reason)
        noList = true
        return
      }
      const ids = a.pages.filter((p) => !p.home).map((p) => p.id)
      const wrong = ids.filter((id) => a.count(id) !== 1).map((id) => `"${id}" (${a.count(id)})`)
      if (wrong.length) f.problem(`ids that do not name exactly one demo page: ${listed(wrong)}`)
      const home = a.pages.find((p) => p.home)
      if (home && a.home && home.id !== a.home)
        f.note(`The home "${home.id}" is not the front page "${a.home}" (REL-2); home is never hidden.`)
      const run = { wordpress, joomla, emdash }[context.release.platform]
      if (run) await run(context, f, ids)
    })
    return f.outcome({
      pass: 'each page id names one page, its translations and old addresses are in data, and the error page answers 404',
      liveOnly:
        context.release.platform === 'emdash'
          ? "hiding an unticked page in every edition served is Tracy's copy of the personalize tool (tools/personalize.mjs in the tracy-web image); the theme's 404 page answers its addresses, and only a built site shows it"
          : undefined,
      fix: noList
        ? pagesFileFix(context.release.tag)
        : `Make every page id name one demo page, declare each translation (${context.release.platform === 'emdash' ? 'seed/site-model.json' : 'the contract editions.json'}), keep old addresses in the redirect table, and let the error page answer 404.`
    })
  }
}
