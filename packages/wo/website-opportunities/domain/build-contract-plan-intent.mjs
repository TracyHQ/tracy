// The intent a Contract B build plan carries for the writer (#575, plan stage restore of the step chain's site plan):
// per page its `visitorQuestion`, `keyMessage`, `seo` (`titleIntent`, `descriptionIntent`, `searchTerms`) and
// `endAction` (the block of the page that leads to the main action, with the facts it carries); per block its
// `message` (its point in one line) and `carries` (the ids of the key messages it gets across); on the plan the brief's
// `keyMessages` (`{id, label}`), the `primaryAction` (the facts of the main button) and `later` (what the owner can
// send after approval, each with its code). Every one is optional, so a plan stored before them still reads. Intent
// lines are notes for the writer in note form, never final copy. Pure.
import { codeProblems, paramsProblems } from './build-contract-plan-codes.mjs'
import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import { idListProblems, isName, isObject, label } from './build-contract-shared.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every id of `ids` must name a fact of the plan (a fact or an item for `factIds`). */
function knownIds(ids, at, known, report) {
  for (const [i, id] of list(ids).entries()) {
    const entry = known.get(id)
    if (isName(id) && (!entry || entry.what === 'row'))
      report(`${at}[${i}]`, `${JSON.stringify(id)} is not a fact or item of the plan`)
  }
}

function keyMessagesProblems(plan, report) {
  const ids = new Set()
  if (plan.keyMessages === undefined) return ids
  if (!Array.isArray(plan.keyMessages)) {
    report('keyMessages', 'keyMessages must be a list of {id, label}')
    return ids
  }
  plan.keyMessages.forEach((m, i) => {
    const at = `keyMessages[${i}]`
    if (!isObject(m)) return report(at, 'a key message must be an object {id, label}')
    closedShapeProblems(m, 'key message', at, report)
    if (!isName(m.id)) report(`${at}.id`, 'a key message needs an id')
    else if (ids.has(m.id)) report(`${at}.id`, `id ${JSON.stringify(m.id)} is used twice`)
    else ids.add(m.id)
    textProblems(m.label, `${at}.label`, report, 'label', 'a key message needs a label')
  })
  return ids
}

function seoProblems(seo, at, report) {
  if (!isObject(seo))
    return report(at, 'seo must be an object {searchTerms, titleIntent?, descriptionIntent?}')
  closedShapeProblems(seo, 'page seo', at, report)
  for (const key of ['titleIntent', 'descriptionIntent'])
    if (seo[key] !== undefined)
      textProblems(seo[key], `${at}.${key}`, report, 'intent', `${key} is a short note`)
  if (!Array.isArray(seo.searchTerms) || seo.searchTerms.length === 0)
    return report(`${at}.searchTerms`, 'searchTerms lists the words a visitor searches for, at least one')
  seo.searchTerms.forEach((term, i) =>
    textProblems(term, `${at}.searchTerms[${i}]`, report, 'searchTerms[]', 'a search term is a text')
  )
  // The owner's marks (#575 plan card): the terms the owner added are among the page's terms, and the terms code makes
  // that the owner took off are not, so a later edit that makes the terms again keeps the owner's choice.
  for (const key of ['ownerAdded', 'ownerRemoved']) {
    if (seo[key] === undefined) continue
    if (!Array.isArray(seo[key])) {
      report(`${at}.${key}`, `${key} lists search terms`)
      continue
    }
    seo[key].forEach((term, i) => {
      if (!textProblems(term, `${at}.${key}[${i}]`, report, 'searchTerms[]', 'a search term is a text'))
        return
      if ((key === 'ownerAdded') !== seo.searchTerms.includes(term))
        report(
          `${at}.${key}[${i}]`,
          key === 'ownerAdded'
            ? 'a term the owner added is one of the search terms'
            : 'a term the owner took off is not one of the search terms'
        )
    })
  }
}

function pageProblems(page, at, { known, messages }, report) {
  for (const key of ['visitorQuestion', 'keyMessage'])
    if (page[key] !== undefined)
      textProblems(page[key], `${at}.${key}`, report, 'intent', `${key} is a short note`)
  if (page.seo !== undefined) seoProblems(page.seo, `${at}.seo`, report)
  const end = page.endAction
  if (end !== undefined) {
    if (!isObject(end)) report(`${at}.endAction`, 'endAction must be an object {block, factIds}')
    else {
      closedShapeProblems(end, 'end action', `${at}.endAction`, report)
      if (!list(page.blocks).some((b) => b?.id === end.block))
        report(`${at}.endAction.block`, 'endAction names a block of its own page')
      idListProblems(end.factIds, `${at}.endAction.factIds`, report, { allowEmpty: false })
      knownIds(end.factIds, `${at}.endAction.factIds`, known, report)
    }
  }
  list(page.blocks).forEach((block, j) => {
    if (!isObject(block)) return
    const blockAt = `${at}.blocks[${label(block.id, j)}]`
    if (block.message !== undefined)
      textProblems(
        block.message,
        `${blockAt}.message`,
        report,
        'intent',
        'message is the block point in one line'
      )
    if (block.carries === undefined) return
    idListProblems(block.carries, `${blockAt}.carries`, report)
    for (const [i, id] of list(block.carries).entries())
      if (isName(id) && !messages.has(id))
        report(`${blockAt}.carries[${i}]`, `${JSON.stringify(id)} is not a key message of the plan`)
  })
}

function laterProblems(later, report) {
  if (!Array.isArray(later)) return report('later', 'later must be a list of {what, reason, code}')
  later.forEach((entry, i) => {
    const at = `later[${i}]`
    if (!isObject(entry)) return report(at, 'a later entry must be an object {what, reason, code}')
    closedShapeProblems(entry, 'later entry', at, report)
    textProblems(entry.what, `${at}.what`, report, 'what', 'a later entry names what the owner can send')
    textProblems(entry.reason, `${at}.reason`, report, 'reason', 'a later entry says what it opens')
    if (!isName(entry.code)) report(`${at}.code`, 'a later entry needs its code')
    else codeProblems(entry.code, `${at}.code`, report)
    paramsProblems(entry, at, report)
  })
}

/** Report every problem of the plan's intent fields through `report(at, message)`. */
export function intentProblems(plan, known, report) {
  const messages = keyMessagesProblems(plan, report)
  list(plan.pages).forEach((page, i) => {
    if (isObject(page)) pageProblems(page, `pages[${label(page.id, i)}]`, { known, messages }, report)
  })
  const action = plan.primaryAction
  if (action !== undefined) {
    if (!isObject(action)) report('primaryAction', 'primaryAction must be an object {factIds}')
    else {
      closedShapeProblems(action, 'primary action', 'primaryAction', report)
      idListProblems(action.factIds, 'primaryAction.factIds', report, { allowEmpty: false })
      knownIds(action.factIds, 'primaryAction.factIds', known, report)
    }
  }
  if (plan.later !== undefined) laterProblems(plan.later, report)
}
