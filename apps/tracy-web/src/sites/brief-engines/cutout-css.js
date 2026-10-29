/**
 * The site paths of the clear pictures a brief build wrote only to take a cut-out figure off (ladder step 2,
 * `website-opportunities/domain/cutout-ladder.mjs`). The contract needs a picture in every bound slot, so the slot takes a
 * clear one; the head block then hides it wherever it is shown (`leftoverHeadBlock` `pictures`), so it leaves no box and
 * the section's own ground carries the section. A slot the site set aside keeps what it had, so it is not listed.
 * @param {{shaped?: Array<{hide?: boolean, group: {slots: Array<{key: string}>}}>} | null} placed - `shapeReal`'s answer
 * @param {Record<string, string>} values - slot key → the path the upload wrote (`uploadPictures`)
 * @param {Set<string>} [refused] - slot keys the write set aside
 * @returns {string[]}
 */
export function takenOffPicturePaths(placed, values, refused = new Set()) {
  const out = new Set()
  for (const item of placed?.shaped ?? []) {
    if (item?.hide !== true) continue
    for (const { key } of item.group?.slots ?? []) {
      const path = values?.[key]
      if (typeof path === 'string' && path && !refused.has(key)) out.add(path.split('#')[0])
    }
  }
  return [...out]
}
