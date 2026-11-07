// `site.createdPageLayouts.legal` of a kit (card AN): the article layout a legal page the write step creates prints through. A
// template's content pages often print through a file of their own (JA Boxing's class pages: `ja_boxing:classes`, with its
// booking bars), and a privacy page must not print those. A person reads the template's article layouts when packaging and names
// the plain one (`cli.mjs legal-layout --layout ja_boxing:default`), or says `--none`: the page then prints through the
// component's default article. The write step reads it (apps/tracy-web/src/write-step/content-page-route.js legalLayoutOf).
//
//   "createdPageLayouts": { "legal": { "articleLayout": "ja_boxing:default", "why": "<what the file prints>" } }

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** A WordPress block template: its slug, or `<theme>//<slug>` as the Site Editor writes it. */
const WP_TEMPLATE = /^(?:([a-z0-9_-]+)\/\/)?([a-z0-9_-]+)$/i

/** A kit of a WordPress quickstart names its contract `<slug>/wp<major>/<version>`. */
const isWordpressKit = (kit) => /\/wp\d+\//.test(String(kit?.contract ?? ''))

/**
 * The block templates of a theme: the slugs of the `.html` files in its `templates` folder, or null when the theme has
 * none on this web root. (A template only edited in the Site Editor lives in the database and is not listed.)
 * @param {string} webroot
 * @param {string} theme
 * @returns {string[] | null}
 */
export function themeTemplatesOf(webroot, theme) {
  try {
    return readdirSync(join(webroot, 'wp-content', 'themes', theme, 'templates'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.slice(0, -5))
      .sort()
  } catch {
    return null
  }
}

/** A Joomla layout as `article_layout` holds it: `<template or _>:<file>`, both plain names. */
const LAYOUT = /^(?:_|[a-z0-9_-]+):[a-z0-9_-]+$/i

/**
 * Names the layout, or none with `none`. Changes the kit in place.
 * @param {object} kit
 * @param {{ layout?: string, why?: string, none?: boolean, templates?: string[] | null }} order `templates` is the theme's
 *   block templates (`themeTemplatesOf`), asked of a WordPress kit only
 * @returns {{ error: string | null, changed: boolean }}
 */
export function declareLegalLayout(kit, { layout, why, none = false, templates = null }) {
  if (!kit?.site || typeof kit.site !== 'object') return { error: 'the kit has no site part', changed: false }
  const articleLayout = none ? null : String(layout ?? '').trim()
  if (!none && isWordpressKit(kit)) {
    const theme = kit.template?.name
    const parts = WP_TEMPLATE.exec(articleLayout)
    if (!parts)
      return {
        error: 'a WordPress layout is a block template, such as page-plain or <theme>//page-plain, or --none',
        changed: false
      }
    if (parts[1] && parts[1] !== theme)
      return { error: `the template ${articleLayout} is not of the kit's theme ${theme}`, changed: false }
    if (!templates)
      return {
        error: `no templates to check ${articleLayout} against: give --webroot <dir> holding the theme`,
        changed: false
      }
    if (!templates.includes(parts[2]))
      return {
        error: `${parts[2]} is not a template of ${theme} (it has ${templates.join(', ')})`,
        changed: false
      }
  } else if (!none && !LAYOUT.test(articleLayout))
    return { error: 'a layout is <template>:<file>, such as ja_boxing:default, or --none', changed: false }
  if (typeof why !== 'string' || !why.trim())
    return { error: 'say why that file suits a legal page (--why)', changed: false }
  const entry = { articleLayout, why: why.trim() }
  const held = kit.site.createdPageLayouts?.legal
  if (held?.articleLayout === entry.articleLayout && held?.why === entry.why)
    return { error: null, changed: false }
  kit.site.createdPageLayouts = { ...kit.site.createdPageLayouts, legal: entry }
  return { error: null, changed: true }
}
