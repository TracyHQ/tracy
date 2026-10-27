/**
 * The seed plan written into a WordPress working copy through `wp` (the way tracy-site-build's
 * theme and style stages do: `--path=<webroot> --allow-root`). Every page and post is looked up by
 * slug first, so a second run updates in place and never doubles a page. Everything the lane runs
 * goes through `run(cmd, args, stdin?)`, handed in — the tests see the commands, not WordPress.
 *
 * What it writes, in order: the pages of the plan (content, template, artifact kind), the Blog
 * page, the front page and posts page options, the Blog category and the posts (with their cover
 * image when the model drew one, and the image prompt as meta either way), then one navigation
 * post named Main in the menu order. `pages` narrows a rerun: `['all']`, or slugs — `posts` (or
 * `blog`) stands for the blog.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { wpCliOps } from './site-ops.mjs'
import { isWordpressSourceLocale, polylangSlugsFor, wpLocaleFor } from './wordpress-language-catalog.mjs'

/** @typedef {(cmd: string, args: string[], stdin?: string) => Promise<{ code: number, stdout: string, stderr: string }>} Run */

const TEMPLATE = { artifact: 'artifact', fixture: 'fixture', landing: 'landing', page: '' }

/** @param {string[]} pages @param {string} slug */
export function wanted(pages, slug) {
  if (!pages || pages.length === 0 || pages.includes('all')) return true
  if (slug === 'posts') return pages.includes('posts') || pages.includes('blog')
  return pages.includes(slug)
}

/**
 * A page body as one core `html` block. Without block markup WordPress treats the content as
 * classic and `wpautop` wraps its lines in <p> and <br> — measured 07/09: 13 paragraphs and 29
 * breaks added to a landing, enough to move every line below the header.
 * @param {string} body
 */
export function htmlBlock(body) {
  return `<!-- wp:html -->\n${body}\n<!-- /wp:html -->`
}

/** The block markup of a post: one paragraph block per paragraph. @param {string[]} paragraphs */
export function postContent(paragraphs) {
  return paragraphs
    .map((p) => `<!-- wp:paragraph -->\n<p>${escapeHtml(p)}</p>\n<!-- /wp:paragraph -->`)
    .join('\n\n')
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Posts are dated backwards from now, one day apart, so the listing keeps the model's order. */
export function postDate(i, now = Date.now()) {
  const d = new Date(now - i * 86400000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * @param {{ plan: any, run: Run, webroot?: string, pages?: string[], images?: Map<string, { mime: string, bytes: Buffer }>, now?: number, tmp?: string }} o
 * @returns {Promise<{ pages: Record<string, number>, posts: Record<string, number>, navigation: number | null, warnings: string[] }>}
 */
export async function applyWordPress({
  plan,
  run,
  webroot = '.webroot',
  pages = ['all'],
  images = new Map(),
  now = Date.now(),
  tmp,
  /**
   * Where the writes go. Absent: `wp` on this machine's working copy, as it always was. Given: the
   * seat door of a site this machine does not hold (`doorOps`) — the plan below is the same either
   * way, which is the whole point of the seam (tasks/todo-build-new-site.md §B4).
   */
  ops,
  /**
   * Every language the customer chose, first one first. One language (or none) is the site as it
   * has always been built and nothing below runs.
   */
  languages = [],
  /** The same plan written again in each EXTRA language: `[{ lang, plan }]`. */
  translations = []
}) {
  // Every write in this file goes through `site`. There is no `wp` here any more, and that is the
  // point: the same plan applies to the lane's own working copy and to a site this machine does not
  // hold, and a stray shell call would quietly write to the wrong one (measured 08/09).
  const site = ops ?? wpCliOps({ run, webroot })
  const warnings = []
  const idOf = (type, slug) => site.find(type, slug)
  const upsert = (type, slug, title, content, extra = {}) =>
    site.upsert({ type, slug, title, content, ...extra })

  const pageIds = {}
  for (const page of plan.pages) {
    if (!wanted(pages, page.slug)) {
      const id = await idOf('page', page.slug)
      if (id) pageIds[page.slug] = id
      continue
    }
    const id = await upsert('page', page.slug, page.title, htmlBlock(page.body))
    pageIds[page.slug] = id
    const template = TEMPLATE[page.kind] ?? ''
    if (template) await site.setMeta(id, '_wp_page_template', template)
    else await site.deleteMeta(id, '_wp_page_template')
    if (page.kind === 'artifact' && page.artifact) await site.setMeta(id, 'tracy_artifact', page.artifact)
  }

  // The blog page and the two options that make a static front page.
  let blogId = await idOf('page', 'blog')
  if (!blogId) blogId = await upsert('page', 'blog', 'Blog', '')
  pageIds.blog = blogId
  if (pageIds.home) {
    await site.setOption('show_on_front', 'page')
    await site.setOption('page_on_front', String(pageIds.home))
  }
  await site.setOption('page_for_posts', String(blogId))

  // ── Pretty permalinks, because every link the seeder writes assumes them ─────────────────────
  //
  // The menu this function builds points at `/product/`, `/blog/`, `/about/` — and so do the
  // buttons inside the landing artifact. A fresh WordPress has `permalink_structure` EMPTY, where
  // the only address that resolves is `/?p=<id>`: every one of those links then falls through to
  // the front page. Measured 08/09 on a site this seeder had just built — the pages, the posts and
  // the menu were all there, and the site still behaved as if it had one page.
  //
  // `rewrite_rules` is emptied in the same breath: WordPress caches the compiled rules in that
  // option and regenerates them when it finds none, which is the flush a door cannot call.
  await site.setOption('permalink_structure', '/%postname%/')
  await site.setOption('rewrite_rules', '')

  // The contact form's mail goes to the address the customer gave; the theme reads this option.
  if (plan.contact?.email) await site.setOption('tracy_contact_to', plan.contact.email)

  // Posts, in a Blog category, dated backwards, each with its cover when the model drew one.
  const postIds = {}
  if (wanted(pages, 'posts') && Array.isArray(plan.posts) && plan.posts.length > 0) {
    const cat = await site.category('Blog')
    if (cat === null) warnings.push('the blog posts are not in a category on this site')
    const dir = tmp ?? mkdtempSync(path.join(tmpdir(), 'tracy-seed-'))
    let i = 0
    for (const post of plan.posts) {
      const id = await upsert('post', post.slug, post.title, postContent(post.paragraphs), {
        excerpt: post.excerpt,
        date: postDate(i, now),
        categories: cat === null ? [] : [cat]
      })
      postIds[post.slug] = id
      if (post.imagePrompt) await site.setMeta(id, 'tracy_image_prompt', post.imagePrompt)
      const image = images.get(post.slug)
      if (image) {
        try {
          await site.cover({
            postId: id,
            slug: post.slug,
            title: post.title,
            bytes: image.bytes,
            mime: image.mime,
            dir
          })
        } catch (error) {
          warnings.push(`cover of ${post.slug}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      i++
    }
  }

  // One navigation named Main, in the menu order; links of kind post-type so WordPress marks the current page.
  let navigation = null
  if (wanted(pages, 'menu') || pages.includes('all')) {
    const links = plan.menu
      .map((m) => {
        if (m.slug === 'home') return '<!-- wp:home-link {"label":"Home"} /-->'
        const id = pageIds[m.slug]
        if (!id) return null
        return `<!-- wp:navigation-link {"label":"${m.label}","type":"page","id":${id},"url":"${m.url}","kind":"post-type"} /-->`
      })
      .filter(Boolean)
      .join('')
    navigation = await upsert('wp_navigation', 'main', 'Main', links)
  }

  // ── The other languages ──────────────────────────────────────────────────────────────────────
  //
  // A translated page is a page of its own with its own slug, tied to its twin by Polylang. The
  // slug carries the language because WordPress makes slugs unique per SITE: two pages both asking
  // for `product` become `product` and `product-2`, and the second one is a page nobody can guess
  // the address of.
  // 🔒 A CATALOGUE TAG IS NOT A POLYLANG SLUG. The answer says `vi-vn`, `zh-cn`, `pt-br` — one
  // spelling across both CMS — while Polylang files a language under a URL segment, the two-letter
  // base unless two of the site's languages share it. `polylangSlugsFor` makes that call once for
  // the whole build, and the slug is what goes into the page slug, into `pll_set_post_language`
  // and into both keys of a translation pair. Getting only one of the three right is how a page
  // ends up in a language group nobody is in: no error, it just stops appearing in the switcher.
  const slugOf = polylangSlugsFor([...languages, ...translations.map((t) => t.lang)])
  const slugFor = (tag) => slugOf.get(tag) ?? String(tag).toLowerCase()
  const primary = languages[0] === undefined ? '' : slugFor(languages[0])
  // The exact WordPress locale beside each slug: the plugin creates a new language under it, so a
  // `pt` slug is Brazilian or European as the customer chose, and `en-gb` is not filed as `en_US`.
  // A tag the catalogue does not know sends none and the plugin's default table decides.
  const localeFor = (tag) => {
    try {
      return wpLocaleFor(tag)
    } catch {
      return undefined
    }
  }
  const primaryLocale = languages[0] === undefined ? undefined : localeFor(languages[0])
  if (primary !== '' && translations.length > 0) {
    // The translation itself, before any page is marked: Polylang files a page under a language,
    // but WordPress only speaks that language once its core translation is on disk. A failure here
    // is a site whose extra pages are in the customer's words and whose menus and admin are still
    // in English — a site missing a translation, not a failed build, so it warns like the rest.
    for (const { lang: tag } of translations) {
      if (typeof site.installLocale !== 'function') break
      try {
        if (!isWordpressSourceLocale(tag)) await site.installLocale(wpLocaleFor(tag))
      } catch (error) {
        warnings.push(
          `the ${tag} translation was not installed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    if (typeof site.setLanguage !== 'function') {
      warnings.push('this site cannot be told what language a page is in, so it was built in one')
    } else {
      // The plugin resolves a language named only as a translation key without its locale, so
      // the first language is declared on its own page before any pair names it.
      let primaryDeclared = false
      for (const { lang: tag, plan: other } of translations) {
        const lang = slugFor(tag)
        const locale = localeFor(tag)
        /** @type {Record<string, number>} */
        const twinIds = {}
        for (const page of other.pages ?? []) {
          if (!wanted(pages, page.slug)) continue
          twinIds[page.slug] = await upsert('page', `${page.slug}-${lang}`, page.title, htmlBlock(page.body))
          const template = TEMPLATE[page.kind] ?? ''
          if (template) await site.setMeta(twinIds[page.slug], '_wp_page_template', template)
        }
        for (const [slug, id] of Object.entries(twinIds)) {
          const first = pageIds[slug]
          // Both sides name the pair: Polylang keeps ONE translation group, and a page told
          // nothing simply stops appearing in the language switcher — no error anywhere.
          const pair = first ? { [primary]: first, [lang]: id } : { [lang]: id }
          try {
            if (first && !primaryDeclared) {
              await site.setLanguage(first, primary, { [primary]: first }, primaryLocale)
              primaryDeclared = true
            }
            await site.setLanguage(id, lang, pair, locale)
            if (first) await site.setLanguage(first, primary, pair, primaryLocale)
          } catch (error) {
            // A component that does not know `content.language` yet says so. A site with its words
            // in one language is a site missing a translation, not a failed build.
            warnings.push(
              `${slug} was not marked as ${lang}: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      }
    }
  }

  await site.flush()
  return { pages: pageIds, posts: postIds, navigation, warnings }
}
