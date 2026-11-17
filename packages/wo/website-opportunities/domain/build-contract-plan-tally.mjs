// The picture counts of a plan's pictures summary (Contract B, #575 pictures gap audit; `picture-tally.mjs`): the
// owner's photos (`own.photos`), the photos placed (`own.placed`), the photos not used by coded reason (`own.unused`)
// and the spots left empty by coded reason (`pictures.empty`). All optional, for a plan made before them; when given,
// photos = placed + every unused count, so a card can say "12 of your 19 photos" and why the 7 others are not used.
import { codeProblems } from './build-contract-plan-codes.mjs'
import { isWhole } from './build-contract-shared.mjs'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Entries `{code, count}`: a code and a count of at least one each, no code twice. */
function countsProblems(entries, at, report) {
  if (entries === undefined) return 0
  if (!Array.isArray(entries)) {
    report(at, 'a list of {code, count}')
    return 0
  }
  const seen = new Set()
  let total = 0
  entries.forEach((e, i) => {
    if (!isObject(e) || !isWhole(e.count, 1) || Object.keys(e).some((k) => k !== 'code' && k !== 'count'))
      return report(`${at}[${i}]`, 'an entry is {code, count} with a count of at least 1')
    codeProblems(e.code, `${at}[${i}].code`, report)
    if (seen.has(e.code)) report(`${at}[${i}].code`, `${e.code} is counted twice`)
    seen.add(e.code)
    total += e.count
  })
  return total
}

/** The problems of the counts of `pictures.own` and of `pictures.empty`. */
export function tallyProblems(pictures, report) {
  const own = pictures.own
  countsProblems(pictures.empty, 'pictures.empty', report)
  const given = ['photos', 'placed', 'unused'].filter((k) => own[k] !== undefined)
  if (given.length === 0) return
  if (given.length < 3) return report('pictures.own', 'photos, placed and unused are given together')
  if (!isWhole(own.photos)) report('pictures.own.photos', 'a whole number of photos')
  if (!isWhole(own.placed)) report('pictures.own.placed', 'a whole number of photos')
  const unused = countsProblems(own.unused, 'pictures.own.unused', report)
  if (isWhole(own.photos) && isWhole(own.placed) && own.photos !== own.placed + unused)
    report('pictures.own', `photos (${own.photos}) must be placed (${own.placed}) plus unused (${unused})`)
}
