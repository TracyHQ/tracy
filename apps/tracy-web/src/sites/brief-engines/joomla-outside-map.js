/**
 * What a Joomla brief build writes or clears OUTSIDE the template's content map (spec TracyHQ/tracy#189, ticket #196), from
 * the site plan's `outside` decisions (`website-opportunities/domain/outside-map.mjs`):
 *
 *   showcase  every showcase entry of the menu (the contract's showcase-navigation map, and each entry whose address names a
 *             sample page) goes with the pages the customer did not pick, its articles with it (`showcaseOff`, read by the
 *             tidy-up), so its address answers 404 and no menu leads there
 *   credit    a `mod_footer` module becomes a custom module that says only the business's copyright; a custom module's credit
 *             line is taken out of its HTML (a module left empty is unpublished)
 *   aliases   an article whose address is still the demo's while its title is the business's takes an address made from the
 *             title (Joomla routes by id, so no link breaks; a fresh site has no outside link to redirect)
 *   head      one marked block in the template style's own head-code param (T4 `system_advancedCodeAfterHead`, T3
 *             `snippet_close_head`) repaints the demo backgrounds the template settings paint with the owner's picture (or
 *             none), hides the play buttons of demo videos (their still picture stays), the demo pictures of the not-found
 *             and offline pages, and the links into entries taken off that no door could empty
 *
 * 🔒 FRAMEWORK RULES, NEVER ONE TEMPLATE'S: the template style is told T4 or T3 by its own params; the backgrounds are read
 * from what the site serves; no template folder, module id or business is named here.
 * 🔒 ONLY A BRIEF BUILD: a site no brief build made has no site plan and nothing here runs. What the site cannot give or
 * refuses is a note, never a failed build; every write carries one apply id, so the build's undo takes it back.
 */
import {
  copyrightLine,
  demoBackgrounds,
  leftoverHeadBlock,
  planAliases,
  withHeadBlock,
  withoutCredit
} from 'website-opportunities/domain/outside-map.mjs'
import { pageRole } from 'website-opportunities/domain/page-plan.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ownStylesheets } from '../../lib/own-stylesheets.js'
import { readMenu, readModules, SKIPPED_MENUS, writeSteps } from './joomla-tidy.js'
import { emptyFrames, photoTiles } from './empty-frames.js'
import { writeHeadModule } from './joomla-head-module.js'
import { sweepDeadLinks } from './joomla-link-sweep.js'
import { brandColoursCss, withColoursBlock } from './joomla-brand-colours.js'

/** The head-code param each template framework prints raw into every page's head. */
export const HEAD_PARAMS = Object.freeze({ t4: 'system_advancedCodeAfterHead', t3: 'snippet_close_head' })
/** The most inner pages read for the backgrounds their template settings paint. */
/** Template folders of Joomla itself: never the site's design. */
const CORE_TEMPLATES = new Set(['atum', 'cassiopeia', 'cassiopeia_extended', 'system'])
const PAGES_READ = 4
const ARTICLE_PAGE = 100

const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const paramsOf = (/** @type {any} */ row) => {
  if (row?.params && typeof row.params === 'object') return { ...row.params }
  try {
    const parsed = JSON.parse(String(row?.params ?? ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** The content map of the contract a site is sealed by (its slots carry the demo's samples), or null. */
export function contentMapAt(/** @type {string | null | undefined} */ dir) {
  if (!dir) return null
  try {
    return JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
  } catch {
    return null
  }
}

/** The framework a template style's params say it runs on, or null. */
export function frameworkOf(/** @type {Record<string, unknown> | null} */ params) {
  if (!params) return null
  if (Object.keys(params).some((k) => k.startsWith('typelist-')) || 'system_advancedCodeAfterHead' in params)
    return 't4'
  if ('t3_template' in params || 'snippet_close_head' in params) return 't3'
  return null
}

/**
 * The menu entries of the template's showcase that a brief build takes off: each entry the showcase-navigation map put away,
 * each entry whose own address names a sample page (`pageRole`), and every entry under one. Never the home entry, never an
 * entry of a menu no visitor navigates by.
 * @param {{rows: any[], showcase: Set<number>, visible: Set<string>}} input
 * @returns {number[]}
 */
export function showcaseOff({ rows, showcase, visible }) {
  const live = rows.filter(
    (r) =>
      Number(r.id) > 1 &&
      Number(r.published) === 1 &&
      Number(r.home ?? 0) !== 1 &&
      !SKIPPED_MENUS.test(String(r.menutype ?? '')) &&
      (String(r.language ?? '*') === '*' || visible.has(String(r.language)))
  )
  const roots = live.filter(
    (r) => showcase.has(Number(r.id)) || (r.path && pageRole({ id: String(r.path) }) === 'sample')
  )
  const out = new Set(roots.map((r) => Number(r.id)))
  for (let grew = true; grew; ) {
    grew = false
    for (const r of live)
      if (!out.has(Number(r.id)) && out.has(Number(r.parent_id))) {
        out.add(Number(r.id))
        grew = true
      }
  }
  return [...out]
}

/**
 * The module steps that take the credit line off: a published `mod_footer` becomes a custom module that says the business's
 * copyright in the site's language (no year, so it never goes stale), or goes when no name is known; a custom module loses its credit element.
 * @param {{modules: any[], name: string | null, locale?: string}} input
 * @returns {Array<{kind: 'module', id: number, fields: Record<string, unknown>}>}
 */
export function creditSteps({ modules, name, locale = 'en' }) {
  const steps = []
  for (const m of modules) {
    if (Number(m.published) !== 1) continue
    const id = Number(m.id)
    if (m.module === 'mod_footer')
      steps.push(
        name
          ? {
              kind: /** @type {const} */ ('module'),
              id,
              fields: {
                module: 'mod_custom',
                content: `<div class="mod-footer"><div class="footer1">${escapeHtml(copyrightLine(name, locale))}</div></div>`
              }
            }
          : { kind: /** @type {const} */ ('module'), id, fields: { published: 0 } }
      )
    else if (m.module === 'mod_custom' && typeof m.content === 'string') {
      const { html, removed } = withoutCredit(m.content)
      if (removed === 0) continue
      const empty = html.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '') === ''
      steps.push({
        kind: /** @type {const} */ ('module'),
        id,
        fields: empty ? { published: 0 } : { content: html }
      })
    }
  }
  return steps
}

/** Every article row of the site (`content.list`), a page at a time. */
async function readArticles(/** @type {Function} */ apply, /** @type {string} */ siteKey) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += ARTICLE_PAGE) {
    const answer = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'article', limit: ARTICLE_PAGE, offset }
    })
    if (answer?.ok === false)
      throw new Error(String(answer.message ?? answer.error ?? 'the articles could not be listed'))
    const items = Array.isArray(answer?.items) ? answer.items : []
    rows.push(...items)
    if (items.length < ARTICLE_PAGE) break
  }
  return rows
}

/** The owner's picture a build already put on the home page (a contract slot's upload), as a site path, or null. */
export function ownerPictureOf(/** @type {string | null} */ html, /** @type {string[]} */ skip = []) {
  const off = new Set(skip.map((p) => String(p).replace(/^\/+/, '')))
  for (const m of String(html ?? '').matchAll(
    /["'(]\/?(images\/tracy-content\/[a-f0-9]{64}\.(?:jpe?g|png|webp))/gi
  ))
    if (!off.has(m[1])) return m[1]
  return null
}

/**
 * The values the site plan writes into contract slots the copy path does not fill: the brief's own video in a video slot.
 * @param {any} plan - the site plan
 * @returns {Record<string, string>}
 */
export function plannedSlotValues(plan) {
  return {
    ...Object.fromEntries(
      (plan?.outside?.videos ?? [])
        .filter((v) => v.decision === 'video' && v.value)
        .map((v) => [v.key, v.value])
    ),
    ...plannedAddressLines(plan)
  }
}

/**
 * The address line of every contact block the site plan fills with a fact (its address, else the areas served), by slot key.
 * A contact RECORD's lines are written by `contactSteps`, which cuts the address to the record's own lines.
 * @param {any} plan - the site plan
 * @returns {Record<string, string>}
 */
export function plannedAddressLines(plan) {
  return Object.fromEntries(
    (plan?.outside?.videos ?? [])
      .filter((v) => v.decision === 'video' && v.value)
      .map((v) => [v.key, v.value])
  )
}

/**
 * Write what the content map does not reach.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any} input.plan - the site plan (`receipt.sitePlan`); nothing runs without its `outside`
 * @param {{text: (url: string) => Promise<string>} | null} input.reader - the site as a visitor reads it
 * @param {any} input.contentMap
 * @param {(line: string) => void} input.note
 * @param {(key: string, n: number) => void} [input.time]
 * @param {string} input.applyId
 * @param {string} [input.locale] - the language the site is written in: the copyright line is said in it
 * @param {string[]} [input.pictures] - site paths of the clear pictures that take cut-out figures off (`cutout-css.js`)
 * @param {boolean} [input.headOnly] - write the head block only (the overlap safety net)
 * @returns {Promise<{credit: number, aliases: number, head: number, links: number}>}
 */
export async function writeOutsideMap({
  pictures = [],
  headOnly = false,
  locale = 'en',
  apply,
  siteKey,
  plan,
  reader,
  contentMap,
  note,
  time = () => {},
  applyId
}) {
  const done = { credit: 0, aliases: 0, head: 0, links: 0 }
  const outside = plan?.outside
  if (!outside) return done
  const say = (/** @type {string} */ what, /** @type {unknown} */ error) =>
    note(`${what}: ${error instanceof Error ? error.message : error}`)

  // The credit line and the addresses, in one batch.
  /** @type {Array<{kind: string, id: number, fields: Record<string, unknown>}>} */
  const steps = []
  // `headOnly`: the head block written again (the overlap safety net, `picture-overlap-net.js`), the records left as the
  // first write set them.
  if (!headOnly) {
    try {
      const credit = creditSteps({
        modules: await readModules(apply, siteKey),
        name: plan?.brand?.name?.value ?? null,
        locale
      })
      steps.push(...credit)
      done.credit = credit.length
    } catch (error) {
      say("the template's credit line could not be read", error)
    }
    try {
      const aliases = planAliases({ contentMap, articles: await readArticles(apply, siteKey) })
      steps.push(...aliases.map((a) => ({ kind: 'article', id: a.id, fields: { alias: a.alias } })))
      done.aliases = aliases.length
    } catch (error) {
      say('the page addresses could not be read', error)
    }
    if (steps.length > 0) {
      const wrote = await writeSteps({ apply, siteKey, steps, applyId })
      for (const line of wrote.notes.slice(0, 3)) note(line)
      const refused = new Set(wrote.refused.map((s) => `${s.kind}:${s.id}`))
      done.credit = steps.filter((s) => s.kind === 'module' && !refused.has(`module:${s.id}`)).length
      done.aliases = steps.filter((s) => s.kind === 'article' && !refused.has(`article:${s.id}`)).length
    }
    if (done.credit) time('creditLinesTakenOff', done.credit)
    if (done.aliases) time('aliasesWritten', done.aliases)

    // Links to pages taken off, and links that lead nowhere (`#`): rewritten to the kept page or removed in their records.
    done.links = await sweepDeadLinks({ apply, siteKey, plan, applyId, note })
    if (done.links) time('linksSwept', done.links)
  }

  // The head block: backgrounds read from what the site serves, videos and pictures from the plan, dead links from the menu.
  let backgrounds = /** @type {Array<{selector: string, file: string}>} */ ([])
  let picture = null
  let frames = /** @type {string[]} */ ([])
  let tiles = /** @type {Array<{selector: string, target: string, picture: string}>} */ ([])
  /** The served pages read for the head block: the leftovers module must show on each of them. */
  let pageHtml = /** @type {string[]} */ ([])
  let colours = ''
  if (reader) {
    try {
      const paths = [
        '/',
        ...(plan.pages ?? [])
          .filter((p) => p.decision === 'keep' && typeof p.path === 'string' && p.path !== '/')
          .map((p) => (p.path.startsWith('/') ? p.path : `/${p.path}`))
      ].slice(0, PAGES_READ + 1)
      const pages = []
      for (const path of paths) {
        const html = await reader.text(path).catch(() => null)
        if (html) pages.push({ html })
      }
      picture = ownerPictureOf(pages[0]?.html ?? null, pictures)
      pageHtml = pages.map((p) => p.html)
      // An emptied box among the photos of a grid shows an owner photo; every other empty frame is hidden.
      tiles = photoTiles(pageHtml, { skip: pictures })
      const painted = new Set(tiles.map((t) => t.selector))
      frames = emptyFrames(pageHtml).filter((s) => !painted.has(s))
      const styles = []
      for (const href of ownStylesheets(pages)) {
        const css = await reader.text(href).catch(() => null)
        if (css) styles.push({ css })
      }
      backgrounds = demoBackgrounds({ styles, pages, contentMap })
      // The template's brand colours repainted with the logo's (site plan `colours`, ADR 0023 amended 29/10/2026).
      colours = brandColoursCss({ plan, styles, pages, note })
    } catch (error) {
      say('the backgrounds the template paints could not be read', error)
    }
  }
  let links = /** @type {string[]} */ ([])
  try {
    links = (await readMenu(apply, siteKey))
      .filter((r) => Number(r.id) > 1 && Number(r.published) !== 1 && String(r.client_id ?? '0') === '0')
      .map((r) => `Itemid=${Number(r.id)}`)
  } catch (error) {
    say('the menu could not be read for links to pages taken off', error)
  }
  const leftovers = leftoverHeadBlock({
    backgrounds,
    picture,
    videos: (outside.videos ?? []).filter((v) => v.decision === 'still' && v.demo).map((v) => v.demo),
    files: (outside.errorPages ?? []).map((p) => p.file),
    links,
    frames,
    pictures,
    tiles
  })
  const block = withColoursBlock(leftovers, colours)
  if (!block) return done
  try {
    const list = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'templateStyle', limit: 200 }
    })
    if (list?.ok === false) throw new Error(String(list.message ?? list.error))
    // The list names a style (id, title, template, home) and carries NO params, so each site-template style is read whole
    // (`content.get`) before its head code is judged. Joomla's own templates are never touched.
    const styles = []
    for (const row of (Array.isArray(list?.items) ? list.items : []).filter(
      (r) =>
        String(r?.client_id ?? '0') === '0' && !CORE_TEMPLATES.has(String(r?.template ?? '').toLowerCase())
    )) {
      let params = paramsOf(row)
      if (!params) {
        const got = await apply({
          siteKey,
          action: 'content.get',
          params: { kind: 'templateStyle', id: Number(row.id) }
        })
        params = got?.ok === false ? null : paramsOf(got?.item)
      }
      if (params && frameworkOf(params)) styles.push({ row, params })
    }
    if (styles.length === 0)
      note('the site template has no head-code setting, so the demo backgrounds and videos stay')
    // T3 reads its head code from the style's own parameters; T4 reads `system_*` only from a template file and drops the
    // style's, so a T4 site carries the block as one custom module on every page (`joomla-head-module.js`).
    let viaModule = false
    for (const { row, params } of styles) {
      if (frameworkOf(params) === 't4') {
        viaModule = true
        continue
      }
      const key = HEAD_PARAMS.t3
      const value = withHeadBlock(String(params?.[key] ?? ''), block)
      if (value === String(params?.[key] ?? '')) continue
      const answer = await apply({
        siteKey,
        action: 'content.update',
        params: {
          kind: 'templateStyle',
          id: Number(row.id),
          apply_id: applyId,
          fields: { params: JSON.stringify({ ...params, [key]: value }) }
        }
      })
      if (answer?.ok === false)
        note(`template style ${row.id} refused its head code: ${answer.message ?? answer.error}`)
      else done.head += 1
    }
    if (viaModule)
      done.head += await writeHeadModule({ apply, siteKey, block, applyId, note, pages: pageHtml })
  } catch (error) {
    say('the template styles could not be written', error)
  }
  if (done.head) time('headBlocksWritten', done.head)
  return done
}
