import { decodeEntities, profileSocial } from './website-crawler.mjs'

// PageSpeed stackPacks titles we show as "Built with" (a framework counts too); anything else is ignored.
export const STACK_PACK_NAMES = Object.freeze([
  'WordPress',
  'Joomla',
  'Drupal',
  'Wix',
  'Squarespace',
  'Shopify',
  'Magento',
  'Webflow',
  'Blogger',
  'Ghost',
  'TYPO3',
  'PrestaShop',
  'OpenCart',
  'Next.js',
  'Nuxt',
  'Gatsby',
  'Angular',
  'React',
  'Vue',
  'Ember',
  'Octopress',
  'AMP'
])
const BY_LOWER = new Map(STACK_PACK_NAMES.map((n) => [n.toLowerCase(), n]))
// Generator metas name the product with extras ("Joomla! - Open Source Content Management", "Drupal 10 (https://…)").
const GENERATOR_NAMES = [
  ['wordpress', 'WordPress'],
  ['joomla', 'Joomla'],
  ['drupal', 'Drupal'],
  ['typo3', 'TYPO3'],
  ['ghost', 'Ghost'],
  ['wix', 'Wix'],
  ['blogger', 'Blogger'],
  ['gatsby', 'Gatsby'],
  ['hugo', 'Hugo'],
  ['jekyll', 'Jekyll'],
  ['squarespace', 'Squarespace']
]
const HTML_FINGERPRINTS = [
  [/wp-content\//i, 'WordPress'],
  [/static\.wixstatic\.com|static\.parastorage\.com|_wix/i, 'Wix'],
  [/squarespace\.com|static1\.squarespace/i, 'Squarespace'],
  [/\/media\/jui\/|\/media\/system\/js\/|com_content/i, 'Joomla'],
  [/blogspot\.com|blogger\.com/i, 'Blogger'],
  [/webflow\.io|\bwf-/i, 'Webflow'],
  [/cdn\.shopify\.com/i, 'Shopify'],
  [/_next\//i, 'Next.js'],
  [/\/sites\/(default|all)\/files\//i, 'Drupal']
]
const HOST_FINGERPRINTS = [
  [/\.wixsite\.com$/i, 'Wix'],
  [/\.blogspot\.(com|[a-z]{2,3}(\.[a-z]{2})?)$/i, 'Blogger'],
  [/\.myshopify\.com$/i, 'Shopify'],
  [/\.webflow\.io$/i, 'Webflow'],
  [/\.wordpress\.com$/i, 'WordPress'],
  [/\.squarespace\.com$/i, 'Squarespace']
]
const COPYRIGHT = /(©|&copy;|\(c\)|copyright)\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?/gi
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Error-tracking DSNs look like emails (`<32 hex>@sentry.wixpress.com`, `…@o123.ingest.sentry.io`), and
// a site builder's own domain is never the restaurant's address.
const NOT_AN_EMAIL =
  /\.(png|jpe?g|gif|webp|svg|avif|css|js)$|^(no-?reply|donotreply|do-not-reply)@|^[0-9a-f]{32}@|@([a-z0-9-]+\.)*(example\.[a-z]+|wix\.com|wixpress\.com|sentry\.io|sentry\.com|ingest\.[a-z.]+)$/i

function fromStackPacks(packs) {
  for (const p of Array.isArray(packs) ? packs : []) {
    const title = typeof p === 'string' ? p : (p?.title ?? p?.id)
    const name = typeof title === 'string' ? BY_LOWER.get(title.trim().toLowerCase()) : null
    if (name) return name
  }
  return null
}

function fromGenerator(html) {
  const m =
    /<meta\b[^>]*\bname\s*=\s*["']?generator["']?[^>]*\bcontent\s*=\s*["']([^"']*)["']/i.exec(html) ??
    /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']?generator["']?/i.exec(html)
  if (!m) return null
  const content = decodeEntities(m[1]).trim()
  const lower = content.toLowerCase()
  const hit = GENERATOR_NAMES.find(([needle]) => lower.includes(needle))
  if (!hit) return null
  const version = /\d+(?:\.\d+)*/.exec(content.slice(lower.indexOf(hit[0]) + hit[0].length))?.[0] ?? null
  return { cms: hit[1], version }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function copyrightYearOf(text, now) {
  const max = now.getFullYear() + 1
  let best = null
  for (const m of text.matchAll(COPYRIGHT)) {
    const year = Number(m[3] ?? m[2])
    if (year >= 1995 && year <= max && (best === null || year > best)) best = year
  }
  return best
}

function emailsOf(html, text) {
  const out = new Set()
  const add = (raw) => {
    const email = raw.toLowerCase().replace(/\?.*$/, '')
    if (!NOT_AN_EMAIL.test(email)) out.add(email)
  }
  for (const m of html.matchAll(/href\s*=\s*["']?mailto:([^"'?>\s]+)/gi)) add(decodeURIComponent(m[1]))
  for (const m of text.matchAll(EMAIL)) add(m[0])
  return [...out]
}

function socialsOf(html) {
  const socials = {}
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = decodeEntities(m[1]).trim()
    let net = null
    try {
      net = profileSocial(url)
    } catch {
      continue
    }
    if (net && !socials[net]) socials[net] = url
  }
  return socials
}

/** What a fetched page says about itself; every string returned is untrusted page data. */
export function detectStack({ html, finalUrl, stackPacks = [], now = new Date() } = {}) {
  const src = String(html ?? '')
  const generator = fromGenerator(src)
  const host = hostOf(finalUrl)
  const cms =
    fromStackPacks(stackPacks) ??
    generator?.cms ??
    HTML_FINGERPRINTS.find(([re]) => re.test(src))?.[1] ??
    HOST_FINGERPRINTS.find(([re]) => re.test(host))?.[1] ??
    null
  const text = decodeEntities(src.replace(/<[^>]+>/g, ' '))
  return {
    cms,
    cmsVersion: cms && generator?.cms === cms ? generator.version : null,
    copyrightYear: copyrightYearOf(text, now),
    emails: emailsOf(src, text),
    socials: socialsOf(src)
  }
}
