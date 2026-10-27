/**
 * A question Tracy asks in a voice conversation is asked out loud and answered out loud, as a person
 * would (`voice-mode.mjs`): the question is read with its choices ({@link askedLine}), and the words
 * the person says next answer dsh's question card through its own verb (`PendingQuestion.answer`,
 * `ui-user-questions/src/client/contract/slots.ts`) — the same answer a press on the card gives, so
 * the chat shows it the same way. Sent as a message instead, the words would wait in the queue behind
 * a turn that waits on the card.
 *
 * Kept free of React so `test/voice-answer.test.mjs` can hold it.
 */
import { confirmReply, isPoliteOnly } from './voice-turn-taking.mjs'

/**
 * One question of a pending request, as far as the voice reads it (dsh `AskUserQuestionItem`).
 * @typedef {{ id: string, question?: string, options?: readonly ({ label?: string } | string)[], multiSelect?: boolean }} AskedItem
 * @typedef {{ answers: { id: string, selected: string[], custom?: string }[], note?: string }} SpokenAnswer
 */

/** The most choices read out; the rest are on the card. */
export const CHOICES_READ = 5

/** @param {{ label?: string } | string} option */
const labelOf = (option) =>
  (typeof option === 'string' ? option : typeof option?.label === 'string' ? option.label : '').trim()

/**
 * A choice as the card shows it: dsh draws a trailing "(Recommended)" as a badge, not as words
 * (`parseRecommendedLabel`, `ui-user-questions/src/client/QuestionComposer.tsx`), so it is neither read
 * out nor needed in what the person says. The answer still carries the label as written.
 * @param {string} label
 */
export const shownLabel = (label) =>
  label.replace(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/iu, '')

/**
 * The choices of a question, as their labels.
 * @param {AskedItem | undefined} item
 * @returns {string[]}
 */
export function choicesOf(item) {
  return (item?.options ?? []).map(labelOf).filter((label) => label !== '')
}

/**
 * The choices said as one list, "A, B or C" in the language given (`Intl.ListFormat`, disjunction).
 * @param {readonly string[]} choices
 * @param {string} language
 */
export function choiceList(choices, language) {
  const read = choices.slice(0, CHOICES_READ).map(shownLabel)
  if (read.length === 0) return ''
  try {
    return new Intl.ListFormat(language, { type: 'disjunction' }).format(read)
  } catch {
    return read.join(', ')
  }
}

/**
 * The line that asks: the card's own phrase, the question, then its choices.
 * @param {string} lead - "I have a question for you on screen."
 * @param {string} question
 * @param {readonly string[]} choices
 * @param {string} language
 */
export function askedLine(lead, question, choices, language) {
  const list = choiceList(choices, language)
  const ask = question === '' ? '' : /[.?!。？！]$/u.test(question) ? question : `${question}?`
  return [lead, ask, list === '' ? '' : `${list}.`].filter((part) => part !== '').join(' ')
}

/**
 * One spelling for the two ways Vietnamese places a tone mark ("huỷ"/"hủy", "xoá"/"xóa", "hoà"/"hòa"):
 * a word's letters, then its marks. The speech service and the agent's card each pick either (on the
 * stand, 19/10/2026, both wrote "hủy"); a "Huỷ" said to a card labelled "Hủy" must still pick it, or
 * it is taken for a stop and the whole turn ends.
 * @param {string} word
 */
const oneSpelling = (word) => {
  const parts = [...word.normalize('NFD')]
  const marks = parts.filter((c) => /\p{M}/u.test(c))
  if (marks.length === 0) return word
  return `${parts.filter((c) => !/\p{M}/u.test(c)).join('')}${marks.sort().join('')}`
}

/** @param {string} text */
const plain = (text) =>
  ` ${String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:…。，！？、；：“”"«»()]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(oneSpelling)
    .join(' ')} `

/**
 * The choices named in what was said: a label heard whole ("màu đỏ nhé" names "Đỏ"); a label that is
 * part of a longer one also heard is the longer one's ("Đỏ đậm", not "Đỏ").
 * @param {readonly string[]} choices
 * @param {string} said
 */
export function namedChoices(choices, said) {
  const heard = plain(said)
  const shown = (/** @type {string} */ label) => plain(shownLabel(label))
  const named = choices.filter((label) => shown(label).trim() !== '' && heard.includes(shown(label)))
  return named.filter(
    (label) => !named.some((other) => other !== label && shown(other).includes(shown(label)))
  )
}

/**
 * The one choice the words are, whole ("Huỷ.", "Cancel", "取消。"): the label alone, as the card shows
 * it, case and punctuation aside — never a choice named inside more words. Taken before a stop
 * command (council 18/10/2026: a card offering "Huỷ" asks for that word as its answer), so it must be
 * exact; null when the words are not one choice.
 * @param {readonly string[]} choices
 * @param {string} said
 */
export function exactChoice(choices, said) {
  const heard = plain(said).trim()
  if (heard === '') return null
  const same = choices.filter((label) => plain(shownLabel(label)).trim() === heard)
  return same.length === 1 ? /** @type {string} */ (same[0]) : null
}

/** Words said beside the choices named that still leave the answer just the choice ("chọn đỏ nhé"). */
export const BESIDE_CHOICE = 2

/**
 * The answer the spoken words give a request. One question: the choice named when that is all that was
 * said, else the person's words as their own answer (a multi-select keeps the choices named beside
 * them) — nothing said is lost. Several: each question takes the choice named for it, and the words go
 * whole as the request's note, so Tracy reads everything said. A request with a question of Tracy's
 * own (`confirm-…`) is answered only by a choice or a clear yes or no ({@link confirmAnswer}); null
 * when the words are neither — the card is asked again, and nothing is sent.
 * @param {readonly AskedItem[]} questions
 * @param {string} said
 * @returns {SpokenAnswer | null}
 */
export function spokenAnswer(questions, said) {
  const text = String(said).trim()
  if (questions.some(isConfirm)) return confirmAnswer(questions, text)
  const pick = (/** @type {AskedItem} */ item) => {
    const named = namedChoices(choicesOf(item), text)
    return item.multiSelect === true ? named : named.length === 1 ? named : []
  }
  if (questions.length === 1) {
    const [item] = questions
    const selected = pick(item)
    if (selected.length > 0 && besideChoices(selected, text) <= BESIDE_CHOICE)
      return { answers: [{ id: item.id, selected }] }
    return {
      answers: [{ id: item.id, selected: item.multiSelect === true ? selected : [], custom: text }]
    }
  }
  return { answers: questions.map((item) => ({ id: item.id, selected: pick(item) })), note: text }
}

/**
 * The words said beside a choice named, as they were said (the label taken out word by word, in the
 * spelling the match used). @param {string} label @param {string} text
 */
function besideText(label, text) {
  const words = plain(text).trim().split(' ')
  const said = String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:…。，！？、；：“”"«»()]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
  const want = plain(shownLabel(label)).trim().split(' ')
  for (let at = 0; at + want.length <= words.length; at += 1)
    if (want.every((word, k) => words[at + k] === word))
      return [...said.slice(0, at), ...said.slice(at + want.length)].join(' ')
  return said.join(' ')
}

/**
 * The words said beside the choices named, counted.
 * @param {readonly string[]} selected
 * @param {string} text
 */
function besideChoices(selected, text) {
  let rest = plain(text)
  for (const label of selected) rest = rest.split(plain(shownLabel(label))).join(' ')
  return rest.trim() === '' ? 0 : rest.trim().split(' ').length
}

/**
 * A question Tracy wrote to confirm a change it refused to make unasked (D34; `tracy-site-tools`
 * `call-memory.mjs` `CONFIRM_QUESTION_PREFIX`): its FIRST option goes ahead, its second keeps things
 * as they are, and the host reads only which option was chosen.
 * @param {AskedItem} item
 */
export const isConfirm = (item) => typeof item?.id === 'string' && item.id.startsWith('confirm-')

/**
 * 🔒 A CONFIRMATION CARD IS ANSWERED BY A CHOICE OR A CLEAR YES OR NO, NEVER BY FREE WORDS (council
 * 20/10/2026, D5.1). The one question of the request, Tracy's `confirm-…` with two options: a choice
 * named, as for any card, comes first ("No, keep it.") — with nothing beside it but a polite word, or
 * a yes or a no of its own kind ("don't delete" never picks "Delete"); else a whole clear yes picks
 * the FIRST option and a whole clear no the SECOND, in any of the eight languages
 * (`voice-turn-taking.mjs` `confirmReply`: "Đồng ý.", "Ja bitte.", "不，保留。") — not when the card's
 * own labels say otherwise (a first option that reads as a no, or a second as a yes: the order is not
 * trusted then). Anything else is null: the card is asked again; words sent as its answer would read
 * as a refusal, and the agent would ask anew on a card of its own. Never a plan's review
 * (`pendingPlan`), never a question the agent wrote: those keep their own ways.
 * @param {readonly AskedItem[]} questions
 * @param {string} text
 * @returns {SpokenAnswer | null}
 */
function confirmAnswer(questions, text) {
  if (questions.length !== 1) return null
  const [item] = /** @type {[AskedItem]} */ (questions)
  if (item.multiSelect === true) return null
  const choices = choicesOf(item)
  const [go] = /** @type {[string, string]} */ (choices)
  const ordered = takesYesOrNo(questions)
  const named = namedChoices(choices, text)
  if (named.length === 1 && besideChoices(named, text) <= BESIDE_CHOICE) {
    // Words beside the label never turn it round: "don't delete" to "Delete" is no choice of it.
    const label = /** @type {string} */ (named[0])
    const beside = besideText(label, text)
    const kind = ordered ? (label === go ? 'yes' : 'no') : null
    if (isPoliteOnly(beside) || (kind !== null && confirmReply(beside) === kind))
      return { answers: [{ id: item.id, selected: named }] }
    return null
  }
  if (!ordered) return null
  const reply = confirmReply(text)
  if (reply === null) return null
  return { answers: [{ id: item.id, selected: [/** @type {string} */ (choices[reply === 'yes' ? 0 : 1])] }] }
}

/**
 * The request is the one card a spoken yes or no answers ({@link confirmAnswer}): one question, Tracy's
 * `confirm-…`, two options, one choice, and labels that do not say the other way round (a first option
 * that reads as a no, or a second as a yes: the order is not trusted then).
 * @param {readonly AskedItem[]} questions
 */
export function takesYesOrNo(questions) {
  if (questions.length !== 1) return false
  const [item] = /** @type {[AskedItem]} */ (questions)
  if (!isConfirm(item) || item.multiSelect === true) return false
  const choices = choicesOf(item)
  if (choices.length !== 2) return false
  const [go, keep] = /** @type {[string, string]} */ (choices)
  return confirmReply(shownLabel(go)) !== 'no' && confirmReply(shownLabel(keep)) !== 'yes'
}

/**
 * The question card waiting in a conversation: dsh's pending `ask_user_question` request
 * (`PendingQuestion`, `ui-user-questions`), read from the session status (`uiSession.sessionStatus`)
 * through cordis's probe, as `sidebarRightOf` reads the right column — not injected, so a shell
 * without it loses only this. Null when none waits, or when the request is a plan review.
 * @param {{ get?: (name: string) => unknown }} ctx
 * @param {string} sessionId
 * @returns {{ questions: readonly AskedItem[], answer(answer: SpokenAnswer): Promise<void> } | null}
 */
export function pendingQuestion(ctx, sessionId) {
  let uiSession
  try {
    uiSession =
      /** @type {{ sessionStatus?: { getSnapshot(): ReadonlyMap<string, { pendingInteraction?: unknown } | undefined> } } | undefined} */ (
        ctx.get?.('uiSession')
      )
  } catch {
    return null
  }
  const pending = /** @type {{ kind?: unknown, questions?: unknown, answer?: unknown } | undefined} */ (
    uiSession?.sessionStatus?.getSnapshot().get(sessionId)?.pendingInteraction
  )
  if (
    pending?.kind !== 'question' ||
    !Array.isArray(pending.questions) ||
    typeof pending.answer !== 'function'
  )
    return null
  const answer = /** @type {(answer: SpokenAnswer) => Promise<void>} */ (pending.answer)
  return {
    questions: /** @type {readonly AskedItem[]} */ (pending.questions),
    answer: (value) => answer.call(pending, value)
  }
}

/**
 * A plan waiting for the person's review (`exit_plan_mode`, dsh's pending `plan-review`), read as
 * `pendingQuestion` reads a card. Voice cannot show it — its view takes the chat's place — so the
 * conversation goes back to the chat for it (council 18/10/2026: the review card must always be
 * reachable; words are never steered into a turn blocked on it).
 * @param {{ get?: (name: string) => unknown }} ctx
 * @param {string} sessionId
 */
export function pendingPlanReview(ctx, sessionId) {
  try {
    const uiSession =
      /** @type {{ sessionStatus?: { getSnapshot(): ReadonlyMap<string, { pendingInteraction?: { kind?: unknown } } | undefined> } } | undefined} */ (
        ctx.get?.('uiSession')
      )
    return uiSession?.sessionStatus?.getSnapshot().get(sessionId)?.pendingInteraction?.kind === 'plan-review'
  } catch {
    return false
  }
}

/**
 * The plan under review as Voice may answer it (council 19/10/2026, A6; `voice-mode.mjs`, behind the
 * switch `voice-plan-approval`): dsh's pending `plan-review` request in the one shape its own decision
 * card answers (`planReviewOf`, `ui-user-questions` `contract/slots.ts`) — one question, the plan as its
 * `detail`, the approve option named by the intent and at most one other ("Keep planning") — with the
 * call it belongs to and the verb that answers it. Null when none waits or the request is any other
 * shape: Voice then sends the person to the chat, as before.
 *
 * 🔒 AN APPROVAL HERE OPENS NOTHING ELSE. It answers `exit_plan_mode`'s own question only; the host
 * counts an agreement to a refused change (D34, `CONFIRM_FIRST`) solely from an `ask_user_question`
 * answer to a question Tracy wrote (`tracy-site-tools` `customerAnswered`), so a plan approved by voice
 * never lets a later destructive call through: that still asks, on its own card.
 * @param {{ get?: (name: string) => unknown }} ctx
 * @param {string} sessionId
 * @returns {{ callId: string, questionId: string, plan: string, approve: string, decline: string | null, answer(answer: SpokenAnswer): Promise<void> } | null}
 */
export function pendingPlan(ctx, sessionId) {
  let pending
  try {
    const uiSession =
      /** @type {{ sessionStatus?: { getSnapshot(): ReadonlyMap<string, { pendingInteraction?: unknown } | undefined> } } | undefined} */ (
        ctx.get?.('uiSession')
      )
    pending =
      /** @type {{ kind?: unknown, questions?: unknown, answer?: unknown, callId?: unknown } | undefined} */ (
        uiSession?.sessionStatus?.getSnapshot().get(sessionId)?.pendingInteraction
      )
  } catch {
    return null
  }
  if (
    pending?.kind !== 'plan-review' ||
    typeof pending.answer !== 'function' ||
    !Array.isArray(pending.questions) ||
    pending.questions.length !== 1
  )
    return null
  const item =
    /** @type {AskedItem & { detail?: unknown, intent?: { kind?: unknown, approve?: unknown, callId?: unknown } }} */ (
      pending.questions[0]
    )
  const intent = item?.intent
  if (
    intent?.kind !== 'plan-review' ||
    typeof intent.approve !== 'string' ||
    typeof item.detail !== 'string' ||
    typeof item.id !== 'string' ||
    item.multiSelect === true
  )
    return null
  const labels = choicesOf(item)
  if (!labels.includes(intent.approve) || labels.length > 2) return null
  const callId =
    typeof pending.callId === 'string'
      ? pending.callId
      : typeof intent.callId === 'string'
        ? intent.callId
        : null
  if (callId === null) return null
  const answer = /** @type {(answer: SpokenAnswer) => Promise<void>} */ (pending.answer)
  return {
    callId,
    questionId: item.id,
    plan: item.detail,
    approve: intent.approve,
    decline: labels.find((label) => label !== intent.approve) ?? null,
    answer: (value) => answer.call(pending, value)
  }
}
