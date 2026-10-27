/** Content stays editable in Joomla modules; the active T4 template supplies typography and tokens. */
import { parseHTML } from 'linkedom'

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const fragment = (html) => parseHTML(`<html><body>${html ?? ''}</body></html>`).document
const words = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const safeUrl = (value) =>
  /^(https?:\/\/|mailto:|tel:|\/|#|\?|(?:index\.php|images\/))/i.test(value) &&
  !value.startsWith('//') &&
  !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char === '\\')
const TAGS = new Set(
  'a p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd div span section article blockquote strong em b i small br hr figure figcaption img picture source table thead tbody tfoot tr th td details summary address'.split(
    ' '
  )
)
const DROP = new Set(
  'script style iframe object embed form input textarea select option svg canvas noscript template'.split(' ')
)

/** Resolve only links the planner owns. External links and in-page anchors keep their meaning. */
export function rewriteLinks(html, menuIds, language) {
  const document = fragment(html)
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    const match = /^(?:\/index\.php)?\/(?:([a-z0-9-]+)\/?)?(#[^?]*)?$/i.exec(href)
    if (!match) continue
    const id = menuIds[`${match[1] || 'home'}:${language}`]
    if (id) anchor.setAttribute('href', `index.php?Itemid=${id}${match[2] || ''}`)
    else anchor.removeAttribute('href')
  }
  return document.body.innerHTML
}

/** Strip preview chrome and behavior; preserve customer text, images, links and semantic groups. */
export function contentHtml(html) {
  const document = fragment(html)
  const serialize = (node) => {
    if (node.nodeType === 3) return escape(node.textContent)
    if (node.nodeType !== 1) return ''
    const tag = node.localName.toLowerCase()
    if (DROP.has(tag)) return ''
    // The shared section library's WordPress placeholder is not shipped by T4 quickstarts.
    // Omit that empty illustration while retaining customer-provided local/remote images.
    if (
      tag === 'img' &&
      node.getAttribute('src') === '/wp-content/themes/tracy/assets/img/hero-placeholder.svg'
    )
      return ''
    const children = [...node.childNodes].map(serialize).join('')
    if (!TAGS.has(tag)) return children
    const attrs = []
    for (const key of ['id', 'alt', 'title', 'aria-label', 'colspan', 'rowspan'])
      if (node.hasAttribute(key)) attrs.push(`${key}="${escape(node.getAttribute(key))}"`)
    for (const key of ['href', 'src']) {
      const value = node.getAttribute(key)
      if (value && safeUrl(value)) attrs.push(`${key}="${escape(value)}"`)
    }
    if (tag === 'img') attrs.push('loading="lazy"')
    if (/\b(grid|cards)(?:\b|-)/.test(node.className ?? '') && node.children.length > 1)
      attrs.push('class="tracy-seeded-grid"')
    const opening = `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`
    return ['img', 'source', 'br', 'hr'].includes(tag) ? opening : `${opening}${children}</${tag}>`
  }
  return [...document.body.childNodes].map(serialize).join('')
}

/** Extract the hero once and retain every remaining content block in source order. */
export function homeContent(html) {
  const document = fragment(html)
  for (const node of document.querySelectorAll('script,style,nav,[role="navigation"]')) node.remove()
  const main = document.querySelector('main') ?? document.querySelector('[data-artifact]') ?? document.body
  const heading = main.querySelector('h1')
  const title = words(heading)
  const hero = heading?.closest('section,header,[class*="hero"]')
  const leadNode = (hero ?? heading?.parentElement ?? main).querySelector('p')
  const lead = words(leadNode)
  let cta = (hero ?? heading?.parentElement)?.querySelector('a[href]')
  if (!hero && cta?.closest('section,article')) cta = null
  const action = cta ? { text: words(cta), href: cta.getAttribute('href') } : null
  // Keep any additional paragraphs, lists and media in the hero. Only the two fields and
  // primary link rendered by the native ACM hero are removed from the content stream.
  heading?.remove()
  leadNode?.remove()
  cta?.remove()
  for (const node of main.querySelectorAll('header,footer')) {
    if (node === hero || node.querySelector('h2,h3')) continue
    node.remove()
  }
  const sections = []
  let loose = ''
  const add = (source, html) => {
    const clean = contentHtml(html)
    const parsed = fragment(clean)
    if (!words(parsed.body) && !parsed.querySelector('img')) return
    sections.push({ key: source || `section-${sections.length + 1}`, html: clean })
  }
  const flush = () => {
    if (loose) {
      add('', loose)
      loose = ''
    }
  }
  const collect = (node) => {
    if (node.nodeType !== 1) {
      if (node.nodeType === 3) loose += escape(node.textContent)
      return
    }
    if (['section', 'article'].includes(node.localName)) {
      flush()
      add(node.id, node.outerHTML)
    } else if (node.querySelector('section,article')) {
      for (const child of node.childNodes) collect(child)
    } else loose += node.outerHTML
  }
  for (const child of main.childNodes) collect(child)
  flush()
  const seen = new Set()
  for (const [index, section] of sections.entries()) {
    section.key = section.key.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || `section-${index + 1}`
    if (seen.has(section.key)) section.key += `-${index + 1}`
    seen.add(section.key)
  }
  return { title, lead, action, sections }
}

/**
 * Scoped rules use the installed design's tokens and never reset Joomla's page.
 *
 * ADR 0023: every colour and every size the system has a token for is written as that token, the
 * raw value only as the `var()` fallback for a template that compiled the tokens away (T4 keeps
 * none at runtime). `--fg`, not `--text`: only the 56 names every system declares are tokens, and a
 * name that is not one falls to its fallback on EVERY site (measured 29/09/2026: `--text` was never
 * defined, so the colour was `inherit` everywhere). The border fallback is a translucent mix of
 * the text colour rather than a hex, so a page without tokens still carries no colour of its own.
 */
export function sectionModule(html) {
  return `<style>.tracy-seeded-section{color:var(--fg,inherit);padding:var(--section-y-desktop,clamp(24px,4vw,64px)) 0;overflow-wrap:anywhere}.tracy-seeded-section h2{font-size:var(--text-3xl,clamp(28px,4vw,48px));letter-spacing:var(--tracking-display,-.025em);margin:0 0 var(--space-6,24px)}.tracy-seeded-section h3{font-size:var(--text-xl,clamp(20px,2.5vw,28px));margin:0 0 var(--space-3,12px)}.tracy-seeded-section p{line-height:var(--leading-body,1.6)}.tracy-seeded-section img{max-width:100%;height:auto;border-radius:var(--radius-lg,16px)}.tracy-seeded-section table{max-width:100%;display:block;overflow:auto}.tracy-seeded-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--space-6,24px)}.tracy-seeded-grid>div,.tracy-seeded-grid>article{padding:var(--space-6,24px);border:1px solid var(--border,color-mix(in srgb,currentColor 15%,transparent));border-radius:var(--radius-lg,16px)}</style><div class="container"><div class="tracy-seeded-section">${html}</div></div>`
}
