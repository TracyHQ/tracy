/**
 * Final checks of three site build rules that had a writer and no check (spec TracyHQ/tracy#189, registry
 * `website-opportunities/domain/build-rules.mjs`), read from the served pages of any CMS:
 *   - `icon-row-mixed` (rule 4): a row of alike cards whose icons are neither one per meaning (all different) nor one
 *     neutral icon for the whole row (all the same), but a mix of both;
 *   - `booking-button-target`: a button whose words name booking or contact that leads to a page of the site other than
 *     the Contact page the site plan keeps (`booking-button-targets.mjs` is the writer);
 *   - `demo-name-address`: a page served at an address that carries the name of a demo person the page no longer shows
 *     (`demo-name-aliases.mjs` is the writer; this check used to run only inside the Joomla engine).
 * Pure: pages in, findings out.
 */
import { parse } from 'parse5'
import { BOOKING_WORDS } from 'website-opportunities/domain/booking-button-targets.mjs'
import { carriesDemoName, demoNameSlugs } from 'website-opportunities/domain/demo-name-aliases.mjs'
import { plain, signature, walk } from './record-pages-check.js'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const elements = (node) => (node.childNodes ?? []).filter((n) => n.tagName)
/** Every node, the header and footer included (a booking button often sits in the header). */
const everyNode = (node) => [node, ...(node.childNodes ?? []).flatMap(everyNode)]
/** A row of cards has at least this many alike cards. */
const MIN_ROW = 3
/** A button as the CMSs render one: a Bootstrap or theme button class, or a block button link. */
const BUTTON = /\b(?:btn|button)\b|wp-block-button__link/i
const CHANNEL = /^(?:tel:|mailto:|sms:|https?:\/\/(?:wa\.me|api\.whatsapp\.com|ig\.me|m\.me)\/)/i
const bare = (path) =>
  String(path ?? '')
    .replace(/[?#].*$/, '')
    .replace(/^\/index\.php(?=\/|$)/, '')
    .replace(/\/+$/, '') || '/'

const served = (pages) =>
  (pages ?? [])
    .filter((p) => p.status === undefined || p.status === 200)
    .map((p) => ({ page: p, root: parse(String(p.html ?? '')) }))

/** The one icon a card shows, as a name: an icon font class, an inline mark's reference, or an icon picture. */
function iconOf(card) {
  const icons = walk(card).filter(
    (n) =>
      (n.tagName === 'i' && /\b(?:fa|fas|far|fab|bi|icon|ti|la)[-\s]/i.test(`${attr(n, 'class')} `)) ||
      (n.tagName === 'img' && /icon/i.test(`${attr(n, 'src')} ${attr(n, 'class')}`))
  )
  if (icons.length !== 1) return null
  const [icon] = icons
  return icon.tagName === 'img'
    ? attr(icon, 'src').split('?')[0]
    : attr(icon, 'class').trim().split(/\s+/).sort().join(' ')
}

/** Rule 4: rows whose icons are a mix of meanings and repeats. */
export function checkIconRows({ pages }) {
  const out = []
  for (const { page, root } of served(pages)) {
    const seen = new Set()
    for (const parent of walk(root)) {
      const row = elements(parent)
      if (row.length < MIN_ROW || new Set(row.map(signature)).size !== 1) continue
      const icons = row.map(iconOf)
      if (icons.some((i) => i === null)) continue
      const distinct = new Set(icons).size
      const where = signature(row[0])
      if (distinct === 1 || distinct === icons.length || seen.has(where)) continue
      seen.add(where)
      out.push({
        kind: 'icon-row-mixed',
        severity: 'minor',
        page: page.path,
        found: where,
        why: `A row of ${icons.length} cards shows ${distinct} icons: give each item an icon of its meaning, or one neutral icon to the whole row`
      })
    }
  }
  return out
}

/** A booking or contact button that leads to a page of the site other than the kept Contact page. */
export function checkBookingButtons({ pages, sitePlan, origin = null }) {
  if (!sitePlan) return []
  const contact = (sitePlan.pages ?? []).find(
    (p) => p?.role === 'contact' && p?.decision !== 'drop' && p?.path
  )
  const own = origin ? String(origin).replace(/\/+$/, '') : null
  const out = []
  for (const { page, root } of served(pages)) {
    for (const a of everyNode(root).filter((n) => n.tagName === 'a' && BUTTON.test(attr(n, 'class')))) {
      const label = plain(a)
      let href = attr(a, 'href').trim()
      if (!label || !BOOKING_WORDS.test(label) || !href || href.startsWith('#') || CHANNEL.test(href))
        continue
      if (own && href.startsWith(own)) href = href.slice(own.length) || '/'
      if (!href.startsWith('/') || href.startsWith('//')) continue
      if (contact && bare(href) === bare(contact.path)) continue
      if (/com_contact/i.test(href)) continue
      out.push({
        kind: 'booking-button-target',
        severity: 'major',
        page: page.path,
        found: `${label} -> ${href}`,
        why: `The button "${label}" names booking or contact but leads to ${href}, not to the Contact page`
      })
    }
  }
  return out
}

/** A page address that still carries a demo person's name the page does not show. */
export function checkDemoNameAddresses({ pages, contentMap }) {
  const slugs = demoNameSlugs(contentMap)
  if (slugs.length === 0) return []
  const out = []
  for (const { page, root } of served(pages)) {
    const path = bare(page.servedPath ?? page.path)
    const shown = ` ${plain(root)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')} `
    for (const segment of path.split('/').filter(Boolean)) {
      const slug = carriesDemoName(segment, slugs)
      if (!slug || shown.includes(` ${slug.replace(/-/g, ' ')} `)) continue
      out.push({
        kind: 'demo-name-address',
        severity: 'major',
        page: page.path,
        found: segment,
        why: `The address ${path} carries the demo name "${slug}" the page no longer shows`
      })
    }
  }
  return out
}
