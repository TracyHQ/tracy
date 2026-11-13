// The markup and the stylesheet of the Tracy reviews block (ticket #596). The stylesheet is the layout of
// `reviews-block.css` plus one rule that binds each block variable to the template design variables of the block's
// declaration (`designVariables` in `tracy-library.json`), so the block takes the template's colours and fonts in
// light and dark alike and never carries a colour of its own. Pure: content in, `{html, css}` out.
import { readFileSync } from 'node:fs'
import { REVIEW_MAX_STARS, reviewsToShow } from './library-reviews-content.mjs'
import { ReviewsBlockError } from './library-reviews-error.mjs'
import { checkedListingUrl, googleListingUrl } from './library-reviews-listing.mjs'

export { ReviewsBlockError } from './library-reviews-error.mjs'

export const REVIEWS_BLOCK_CSS_FILE = 'reviews-block.css'
const LAYOUT_CSS = readFileSync(new URL(`./library/${REVIEWS_BLOCK_CSS_FILE}`, import.meta.url), 'utf8')
export const REVIEWS_ROOT_CLASS = 'tracy-reviews'

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** `var(--a, var(--b, <fallback>))` for one binding of the declaration. */
export const bindingValue = ({ variables, fallback }) =>
  [...variables]
    .reverse()
    .reduce((inner, name) => (inner ? `var(${name}, ${inner})` : `var(${name})`), fallback ?? '')

/** The rule that binds every block variable to the template design variables. */
export function bindingCss(designVariables) {
  const lines = Object.entries(designVariables).map(
    ([role, binding]) => `  --${REVIEWS_ROOT_CLASS}-${role}: ${bindingValue(binding)};`
  )
  return `.${REVIEWS_ROOT_CLASS} {\n${lines.join('\n')}\n}\n`
}

/** The whole stylesheet of the block for its declaration. */
export const reviewsBlockCss = (declaration) => `${bindingCss(declaration.designVariables)}${LAYOUT_CSS}`

const fieldLimit = (declaration, list, name) =>
  declaration[list]?.find((f) => f.name === name)?.limit ?? Number.POSITIVE_INFINITY

function starsHtml(rating, labels) {
  const on = '★'.repeat(rating)
  const off = REVIEW_MAX_STARS - rating
  const offHtml = off ? `<span class="${REVIEWS_ROOT_CLASS}__star--off">${'★'.repeat(off)}</span>` : ''
  return `<p class="${REVIEWS_ROOT_CLASS}__stars" role="img" aria-label="${escapeHtml(labels.stars(rating))}"><span aria-hidden="true">${on}${offHtml}</span></p>`
}

const DEFAULT_LABELS = Object.freeze({
  stars: (n) => `${n} out of ${REVIEW_MAX_STARS} stars`,
  listing: 'See all reviews on Google'
})

/**
 * Render the block.
 * @param {object} declaration the block's declaration (`tracyLibraryBlock('tracy-reviews')`)
 * @param {{heading?: string, reviews: object[], sources?: Array<{id: string, origin: string}>, listingUrl?: string,
 *   google?: {ref?: string, name?: string}, listingLabel?: string, labels?: {stars?: (n: number) => string},
 *   id?: string, containerClass?: string}} content `reviews` are needs profile items (their source ids read through
 *   `sources`, the profile's sources) or plain `{text, author, rating, origin}`: only Google reviews are shown;
 *   `listingUrl` or the profile's Google source in `google`, both held to the same Google listing check
 *   (`library-reviews-listing.mjs`); `listingLabel` is written in the site's language by the
 *   page writer; `containerClass` is the template's own page width class (Bootstrap's `container` by default, which
 *   T4 and T3 templates share), so the block lines up with the sections around it
 * @returns {{html: string, css: string, shown: object[], setAside: object[]}}
 */
export function renderReviewsBlock(declaration, content) {
  const listingUrl =
    content?.listingUrl !== undefined
      ? checkedListingUrl(content.listingUrl)
      : googleListingUrl(content?.google)
  const sources = Array.isArray(content?.sources) ? content.sources : []
  const { shown, setAside } = reviewsToShow(content?.reviews, {
    textLimit: fieldLimit(declaration, 'itemFields', 'text'),
    authorLimit: fieldLimit(declaration, 'itemFields', 'author'),
    origins: new Map(sources.map((s) => [s?.id, s?.origin])),
    max: declaration.items?.max
  })
  if (shown.length < (declaration.items?.min ?? 1))
    throw new ReviewsBlockError('no_reviews', 'no review can be shown: the block is hidden', { setAside })
  const labels = { ...DEFAULT_LABELS, ...content?.labels }
  const href = escapeHtml(listingUrl)
  const link = (text) => `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`
  const id = `${REVIEWS_ROOT_CLASS}-${String(content?.id ?? 'block').replace(/[^\w-]/g, '')}`
  const heading = isText(content?.heading)
    ? `<h2 class="${REVIEWS_ROOT_CLASS}__heading" id="${id}-heading">${escapeHtml(content.heading.trim())}</h2>`
    : ''
  const items = shown.map(
    (r) =>
      `<li class="${REVIEWS_ROOT_CLASS}__item"><figure class="${REVIEWS_ROOT_CLASS}__figure">${starsHtml(r.rating, labels)}` +
      `<blockquote class="${REVIEWS_ROOT_CLASS}__quote"><p>${escapeHtml(r.text)}</p></blockquote>` +
      `<p class="${REVIEWS_ROOT_CLASS}__author">${link(r.author)}</p></figure></li>`
  )
  const more = `<p class="${REVIEWS_ROOT_CLASS}__more">${link(isText(content?.listingLabel) ? content.listingLabel.trim() : labels.listing)}</p>`
  const labelled = heading ? ` aria-labelledby="${id}-heading"` : ''
  const container = String(content?.containerClass ?? 'container')
    .replace(/[^\w -]/g, '')
    .trim()
  const inner = `${heading}<ul class="${REVIEWS_ROOT_CLASS}__list">${items.join('')}</ul>${more}`
  const html = `<section class="${REVIEWS_ROOT_CLASS}" id="${id}"${labelled}>${container ? `<div class="${container}">${inner}</div>` : inner}</section>`
  return { html, css: reviewsBlockCss(declaration), shown, setAside }
}
