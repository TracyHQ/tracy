// What a person calls the rows of a list (ticket #584). Pure.
//
//   a child list:          {"name": "calendar", "label": "Class days", "items": ..., "itemsFrom": ..., "fields": ...}
//   a block's item list:   {"id": "class-cards", "itemsLabel": "Classes", "items": ..., "itemFields": ...}
//
// A label is a short English noun phrase in sentence case (a capital first letter, no closing full stop), at most
// LABEL_LIMIT characters: the words a form or an editor shows above the rows ("Class days", "Membership plans").
// Every child list carries `label`; every block with item fields carries `itemsLabel` (a block's `label` would read
// as the name of the block, not of its items).

export const LABEL_LIMIT = 40

/** The problem of a list label, or null. */
export function labelProblem(value) {
  if (typeof value !== 'string' || value.trim() === '')
    return 'name what a person calls the rows: a short noun phrase in sentence case'
  if (value !== value.trim() || /\s{2}/.test(value)) return 'a label has no leading, closing or double spaces'
  if (value.length > LABEL_LIMIT) return `a label is at most ${LABEL_LIMIT} characters`
  if (!/^[A-Z]/.test(value)) return 'a label starts with a capital letter (sentence case)'
  if (/[.:;!?]$/.test(value)) return 'a label is a noun phrase, with no closing punctuation'
  return null
}
