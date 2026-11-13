// The Tracy library blocks of the write order (ticket #597, #596): the reviews block is rendered here from the needs
// profile and the writer's words, so the write step only places its markup. Pure.
//
//   reviews   the profile items behind the block's data, the profile's sources, the heading and the listing label the
//             writer wrote, and the Google listing of the profile's Google source (`renderReviewsBlock`). Reviews it
//             sets aside are hidden items with its reason; too few to show (`no_reviews`) or no listing
//             (`listing_missing`) hide the whole block, never a failed step.
// The position stays a request (`content`, the declaration's first position): the write step resolves it through the
// template's mapping file (#584). The container class is left at its default until that mapping provides it.
import { tracyLibraryBlock } from './library.mjs'
import { ReviewsBlockError, renderReviewsBlock } from './library-reviews-render.mjs'
import { googleListingUrl } from './library-reviews-listing.mjs'
import { hideBlock } from './write-order-hide.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const writtenValue = (block, name) => block.fields.find((e) => e.field === name && e.from === 'writer')?.value

/**
 * Join a library block of the order with what it renders, in place.
 * @param {object} block the order block (`blockPlacesOf` with its own place merged in)
 * @param {object} description the block's declaration
 * @param {{profile: object, data: object, hidden: object[]}} ctx
 */
export function joinLibraryBlock(block, description, { profile, data, hidden }) {
  if (description?.type !== 'reviews') return
  const declaration = description.designVariables
    ? description
    : (tracyLibraryBlock(description.id) ?? description)
  const sources = list(profile?.sources)
  const google = sources.find((s) => s?.origin === 'google')
  const reviews = block.items.map((item) => data.byId.get(item.id)?.source ?? {})
  let rendered
  try {
    rendered = renderReviewsBlock(declaration, {
      reviews,
      sources,
      heading: writtenValue(block, 'heading'),
      listingLabel: writtenValue(block, 'listingLabel'),
      google,
      id: block.id
    })
  } catch (error) {
    if (!(error instanceof ReviewsBlockError)) throw error
    block.state = 'hidden'
    return hideBlock(block, error.code, hidden)
  }
  for (const { index, reason } of rendered.setAside) {
    const item = block.items[index]
    if (item) item.setAside = reason
  }
  const listing = block.fields.find((e) => e.field === 'listingUrl')
  if (listing) {
    const value = googleListingUrl(google)
    Object.assign(listing, { from: 'data', value, data: `source:${google.id}` })
    delete listing.action
    delete listing.fallback
  }
  block.library = {
    html: rendered.html,
    css: rendered.css,
    shown: rendered.shown,
    setAside: rendered.setAside
  }
}
