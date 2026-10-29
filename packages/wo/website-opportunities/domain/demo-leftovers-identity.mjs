// Sharper reads of three leftover kinds (ticket #193 of spec #189): the demo post (C02), the demo logo (C13) and the demo
// social link or map (C18). They add to the slot reads of `demo-leftovers.mjs` what a content map cannot say: a post
// reached by its address, a logo picture the map has no slot for, a social icon drawn as a glyph. Rules by role and by
// markup, never by template. Pure.

/** A file a build uploaded for the business: never a demo file. */
const OWNER_UPLOAD = /(^|\/)images\/tracy[-_/]/i
const SOCIAL = /facebook|twitter|instagram|telegram|youtube|linkedin|tiktok|pinterest|whatsapp|x\.com/i
/** A link that shares the visited page, not a profile of the business. */
const SHARE = /sharer|share\?|intent\/tweet|share\.php|sharearticle|\/share\b/i
/** A picture whose file or class says it is a logo. */
const LOGO_FILE = /(^|[/_.-])logo([/_.\d-]|\.|$)/i

/** The `alias` of every demo post entity: pages of the blog reach a post by it. */
function postAliases(ctx) {
  const posts = new Set(
    ctx.demo.slots
      .filter(
        ({ slot }) => String(slot.entity).startsWith('article-') && String(slot.role).startsWith('article.')
      )
      .map(({ slot }) => slot.entity)
  )
  return (ctx.contentMap?.entities ?? [])
    .filter((e) => posts.has(e.key))
    .map((e) => e?.identity?.alias)
    .filter((a) => typeof a === 'string' && a.length > 4 && a.includes('-'))
}

/** C02: a link, on a page that is served, to a demo post by its address (the post is reachable even if its words changed). */
export function demoPostLeftovers(ctx) {
  const out = []
  const aliases = postAliases(ctx)
  for (const page of ctx.served)
    for (const link of page.links) {
      const path = String(link.href ?? '')
        .split(/[?#]/)[0]
        .split('/')
      const alias = aliases.find((a) => path.includes(a))
      if (alias) out.push({ page: page.path, place: link.href, found: alias })
    }
  return out
}

/** C13: a picture that is a logo and not the business's: a logo file the content map has no slot for, or the map's own. */
export function demoLogoLeftovers(ctx) {
  const out = []
  for (const page of ctx.served)
    for (const [tag] of page.html.matchAll(/<img\b[^>]*>/gi)) {
      const src = tag.match(/\ssrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? ''
      if (!src || src.startsWith('data:') || OWNER_UPLOAD.test(src)) continue
      const file = src.split(/[?#]/)[0]
      const cls = tag.match(/\sclass\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? ''
      if (LOGO_FILE.test(file) || /(^|[\s_-])logo([\s_-]|$)/i.test(cls))
        out.push({ page: page.path, place: `img ${file}`, found: file })
    }
  return out
}

/** C18: a social icon drawn as a glyph or an image (the link has no network word of its own), and a share-free read of the rest. */
export function demoSocialLeftovers(ctx) {
  const out = []
  for (const page of ctx.served)
    for (const link of page.links) {
      if (SHARE.test(link.href ?? '')) continue
      const inside = SOCIAL.exec(link.inner ?? '')?.[0]?.toLowerCase()
      if (!inside || SOCIAL.test(`${link.attrs} ${link.text}`)) continue
      const own = link.href && link.href !== '#' && ctx.demo.own.includes(String(link.href).toLowerCase())
      if (!own) out.push({ page: page.path, place: `${link.href || '#'} ${inside}`, found: inside })
    }
  return out
}
