// `site.createdPageLayouts.legal` of a kit (card AN): the article layout a legal page the write step creates prints through. A
// template's content pages often print through a file of their own (JA Boxing's class pages: `ja_boxing:classes`, with its
// booking bars), and a privacy page must not print those. A person reads the template's article layouts when packaging and names
// the plain one (`cli.mjs legal-layout --layout ja_boxing:default`), or says `--none`: the page then prints through the
// component's default article. The write step reads it (apps/tracy-web/src/write-step/content-page-route.js legalLayoutOf).
//
//   "createdPageLayouts": { "legal": { "articleLayout": "ja_boxing:default", "why": "<what the file prints>" } }

/** A Joomla layout as `article_layout` holds it: `<template or _>:<file>`, both plain names. */
const LAYOUT = /^(?:_|[a-z0-9_-]+):[a-z0-9_-]+$/i

/**
 * Names the layout, or none with `none`. Changes the kit in place.
 * @param {object} kit
 * @param {{ layout?: string, why?: string, none?: boolean }} order
 * @returns {{ error: string | null, changed: boolean }}
 */
export function declareLegalLayout(kit, { layout, why, none = false }) {
  if (!kit?.site || typeof kit.site !== 'object') return { error: 'the kit has no site part', changed: false }
  const articleLayout = none ? null : String(layout ?? '').trim()
  if (!none && !LAYOUT.test(articleLayout))
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
