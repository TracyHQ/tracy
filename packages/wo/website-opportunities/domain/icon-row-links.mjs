// The links the network icons of a child list stand for (ticket #595, Contract A as finalised on 13/11). A list's rows
// take the links of their own kind (the kind the row's `link` field declares: `person.social_url` for a team member's
// card, `contact.social_url` for the business's own links), from the row's item (`itemLists`) or from the block's data
// (`lists`), in order. Pure.
//
// A link that cannot fill a row never uses one up: a shortener, a host that is no known network, a bare handle, a
// second link to a network a row already shows, and every link beyond the rows the list holds are left out, each with
// its reason, so nothing is dropped without a note. The contract's rule that an icon with no known network is hidden
// with its link holds: such a link is never written into a row at all.
import { networkOf, socialReasonOf } from './icon-social.mjs'
import { itemSocialUrlsOf, SOCIAL_URL_KINDS, socialLinksOf } from './picture-block-places.mjs'

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The links that fill a list's rows, in order, and the links left out with why.
 * @param {string[]} urls the list's candidate links, in data order
 * @param {number} rows how many rows the list holds
 * @returns {{links: string[], left: Array<{link: string, reason: string}>}}
 */
export function rowLinksOf(urls, rows) {
  const links = []
  const left = []
  const seen = new Set()
  for (const link of urls) {
    const reason = socialReasonOf(link)
    if (reason) left.push({ link, reason })
    else if (seen.has(networkOf(link).network)) left.push({ link, reason: 'social_network_repeated' })
    else if (links.length >= rows) left.push({ link, reason: 'social_link_over_rows' })
    else {
      seen.add(networkOf(link).network)
      links.push(link)
    }
  }
  return { links, left }
}

/** The name and kind of a row's own link field, or null when the row declares none. */
export function linkFieldOf(fields) {
  const field = fields.find((f) => SOCIAL_URL_KINDS.includes(f?.kind))
  return field ? { name: field.name, kind: field.kind } : null
}

/**
 * The links of one list place (`picture-block-places.mjs` row places share it), read once per list place.
 * @param {{item?: string, max?: number, fields: object[]}} at a row place
 * @returns {{links: string[], left: Array<{link: string, reason: string}>}}
 */
export function listLinksOf(at, block, data) {
  const own = linkFieldOf(at.fields)
  const kinds = own ? [own.kind] : SOCIAL_URL_KINDS
  const urls = at.item
    ? itemSocialUrlsOf(data.byId.get(at.item), kinds)
    : socialLinksOf(block, data, kinds).map((l) => l.url)
  return rowLinksOf(urls, at.max ?? 0)
}

/** The written link of one row, or null. */
const writtenLink = (written, at, row, field) =>
  (written.get(`${at}${row}`) ?? []).find((c) => c.field === field && isText(c.value))?.value ?? null

/**
 * The link a social scope stands for, and whether it came from the written copy. When the writer writes any row link of
 * a list, the written links are that list's links: a row it leaves unwritten is empty, never filled from the plan.
 * @param {object} scope a social icon scope (`iconScopesOfPlan`)
 * @param {Map<string, Array<{field: string, value: string}>>} written the written copy by scope key (`writtenByScope`)
 * @returns {{url: string | null, written: boolean}}
 */
export function rowLinkOf(scope, written) {
  const field = scope.social?.linkField
  if (!field || !scope.row) return { url: scope.social?.url ?? null, written: false }
  const at = `${scope.page}|${scope.block}|${scope.item ?? ''}|`
  const listName = `${scope.row.replace(/\.\d+$/, '')}.`
  const ofList = (key) => {
    const row = key.slice(at.length)
    return key.startsWith(at) && row.startsWith(listName) && /^\d+$/.test(row.slice(listName.length))
  }
  const rows = [...written.keys()].filter((key) => ofList(key) && writtenLink(written, '', key, field))
  if (rows.length === 0) return { url: scope.social?.url ?? null, written: false }
  return { url: writtenLink(written, at, scope.row, field), written: true }
}
