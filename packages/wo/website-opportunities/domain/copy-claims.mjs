// The claims of written copy the plan data must hold (ticket #594), for the copy guard `page-writer-data-guard.mjs`.
// Only a number IN A CLAIM is held to the data; any other bare number passes ("a 3 step booking", "top 10 tips",
// "book in 60 seconds"), so an honest sentence is never failed for a number it may use. The claims:
//   - hours: a clock time (`18:30`, `9am`, `9h`, `9 Uhr`), a range of hours after an opening word (`open 9 to 5`) or
//     an hour after `until`, `ab`, `jusqu'à`, `a las`; it fails when its hour is no hour of a known time. A bare 5 is
//     17:00 only with `pm` or as the end of a range that starts later in the day (`9-5`). A duration is no time
//     ("24 hour notice"); "open 24 hours" and "24/7" need a known value that says so;
//   - every day: "open 7 days a week", "open every day", "365 days" need known hours that cover seven days;
//   - a year (19xx, 20xx) the data does not hold;
//   - a count qualifying a claim noun (`500 members`, `20 years of experience`, `fifty members`, `zwanzig Jahren`,
//     `40%`), in six languages, digits or number words; a count of locations passes when it is the count of known
//     addresses;
//   - an award or a superlative (`award-winning`, `#1`, `voted`, `best in`, `certified`, `Preisgekrönt`, `primé`,
//     `galardonado`, `premiato`, `premiado`, "trusted by thousands", `ISO 9001`) no known value says; an award word
//     passes in a sentence that names an award the profile holds (`awards`);
//   - the claims of `copy-claims-more.mjs`: "the best ... in town", "over 500", a count of three digits or more.
// Pure: a text and the known facts in, the claims the facts do not hold out.
import { NUMBER_WORD, numberWordValue } from './copy-number-words.mjs'
import { moreClaimsOf } from './copy-claims-more.mjs'
import { timesOf } from './needs-profile-grounding.mjs'

const B = String.raw`(?<![\p{L}\p{N}])`
const E = String.raw`(?![\p{L}\p{N}])`
const re = (source, flags = 'giu') => new RegExp(source, flags)
const NUM = String.raw`(\d+(?:[.,]\d+)*|${NUMBER_WORD})`

/** A number written in digits or words as one form: `1,200` and `1200` equal, `fifty` is `50`. */
export const numberForm = (written) => {
  const word = numberWordValue(written)
  return word === undefined ? String(written).replace(/[,.](?=\d{3}(?!\d))/g, '') : String(word)
}
/** The numbers a known value writes, in `numberForm`. */
export const numbersOf = (text) =>
  (String(text).match(re(String.raw`\d+(?:[.,]\d+)*|${B}(?:${NUMBER_WORD})${E}`)) ?? []).map(numberForm)

const LOCATIONS = String.raw`locations?|branch(?:es)?|Standorte?n?|Filialen?|agences?|succursales?|sedes?|sucursales?|sedi|filiali|unidades|filiais`
const NOUNS = String.raw`members?|clients?|customers?|students?|awards?|reviews?|projects?|Mitglieder[n]?|Kunden|Schüler(?:innen|n)?|Studenten|Auszeichnungen|Bewertungen|Projekte[n]?|membres|adhérents|élèves|étudiants|avis|projets|socios|miembros|clientes|alumnos|estudiantes|premios|reseñas|proyectos|soci|membri|clienti|studenti|allievi|premi|recensioni|progetti|sócios|membros|alunos|prémios|prêmios|avaliações|projetos`
/** The counted nouns of a count claim, in six languages (read by `plan-request-claims.mjs` too). */
export const COUNT_NOUNS = NOUNS
const EXPERIENCE = String.raw`years?\s+(?:of\s+)?(?:experience|in\s+business)|Jahren?\s+Erfahrung|ans\s+d['’]expérience|años\s+de\s+experiencia|anni\s+di\s+esperienza|anos\s+de\s+experiência`
const COUNT = re(
  String.raw`${B}${NUM}\s*\+?\s+(?:[\p{L}-]+\s+)?(${LOCATIONS}|${NOUNS})${E}|${B}${NUM}\s*\+?\s+(?:${EXPERIENCE})${E}`
)
const FOR_YEARS = re(
  String.raw`${B}(?:seit|depuis|desde\s+hace|da|há)\s+(?:über\s+|mehr\s+als\s+|plus\s+de\s+|más\s+de\s+|oltre\s+|più\s+di\s+|mais\s+de\s+)?${NUM}\s+(?:Jahren|ans|años|anni|anos)${E}`
)
const PERCENT = re(
  String.raw`${B}(\d+(?:[.,]\d+)?)\s?(?:%|(?:percent|per\s+cent|Prozent|pour\s+cent|por\s+ciento|per\s+cento|por\s+cento)${E})`
)
const YEAR = re(String.raw`${B}(?:1[89]\d\d|20\d\d)${E}`)

const ALL_DAY = re(
  String.raw`24\s*\/\s*7|24\s*h\s*\/\s*24|open\s+24\s*(?:hours|h)${E}|24\s+hours\s+a\s+day|rund\s+um\s+die\s+Uhr|24\s+heures\s+sur\s+24|24\s+horas\s+al\s+día`
)
export const KNOWN_ALL_DAY = re(
  String.raw`24\s*\/\s*7|24\s*hours|24\s*h${E}|rund\s+um\s+die\s+Uhr|24\s+heures|24\s+horas`,
  'iu'
)
const EVERY_DAY = re(
  String.raw`(?:7|seven)\s+days\s+a\s+week|open\s+(?:7|seven|365)\s+days|open\s+(?:every\s+day|daily)|(?:7|sieben)\s+Tage\s+die\s+Woche|täglich(?=.*geöffnet)|geöffnet\s+täglich|7\s*j(?:ours)?\s*\/\s*7|ouvert\w*\s+tous\s+les\s+jours|(?:7|siete)\s+días\s+a\s+la\s+semana|abiert\w*\s+todos\s+los\s+días|7\s+giorni\s+su\s+7|apert\w*\s+tutti\s+i\s+giorni|abert\w*\s+todos\s+os\s+dias`
)
export const KNOWN_EVERY_DAY = re(
  String.raw`(?:mon(?:day)?|mo)\s*(?:-|\u2013|to|bis)\s*(?:sun(?:day)?|so(?:nntag)?)${E}|lun\w*\s*(?:-|\u2013|au|à|a)\s*dim\w*|lun\w*\s*(?:-|\u2013|a)\s*dom\w*|seg\w*\s*(?:-|\u2013|a)\s*dom\w*|daily|every\s*day|7\s*days|24\s*\/\s*7|täglich|tous\s+les\s+jours|todos\s+los\s+días|tutti\s+i\s+giorni|todos\s+os\s+dias|7\s*j\s*\/\s*7`,
  'iu'
)

/** `am` and `pm` end where the word ends: "2 amici", "5 amis" and "4 ampoules" name no hour (#594 review W1). */
const HALF = String.raw`(?:a\.?m\.?|p\.?m\.?)(?![\p{L}\p{N}])`
const HOUR = String.raw`(\d{1,2})(?:[:.h](\d{2}))?(?!\d)\s*(${HALF}|h(?!\p{L})|Uhr${E})?`
const SEP = String.raw`\s*[-\u2013]\s*|\s+(?:to|till|until|bis|à|a|al|alle|às|ao|au)\s+`
const RANGE = re(String.raw`${B}${HOUR}(?:${SEP})${HOUR}`)
const CLOCK = re(
  String.raw`${B}(\d{1,2})(?:(?:[:.h](\d{2}))(?!\d)\s*(${HALF})?|(?!\d)\s*(${HALF}|h(?!\p{L})|Uhr${E}))`
)
const BARE = re(String.raw`${B}(\d{1,2})(?!\d)`)
const OPENING = re(
  String.raw`(?:open\w*|hours|from|von|de|dès|dalle|das|desde|geöffnet|ouvert\w*|abiert\w*|apert\w*|abert\w*|täglich|(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim|mié|jue|vie|sáb|dom|seg|ter|qua|qui|sex)\w*|mo|di|mi|do|fr|sa|so)[\s,:.]*$`,
  'iu'
)
const UNTIL = re(
  String.raw`(?:until|till|opens?\s+at|ab|bis|jusqu['’]à|dès|à\s+partir\s+de|a\s+las|hasta\s+las|dalle|alle|fino\s+alle|às|até\s+às)\s*$`,
  'iu'
)
/** A word after a bare hour that makes it no time ("ages 4 to 12 years", "until 12 people"). */
const WORD_AFTER = /^\s*\p{L}/u

/** An hour of the day from a written hour and its suffix: `5pm` is 17, `9 Uhr` is 9, `24h` is 0. */
const hourOf = (hour, half) => {
  const h = Number(hour)
  if (half && /^a/i.test(half)) return h % 12
  if (half && /^p/i.test(half)) return (h % 12) + 12
  return h % 24
}

/** The hours of the day a known value states: its clock times, and `9h` or `9 Uhr`. */
export const knownHoursOf = (text) => [
  ...timesOf(text).map((m) => Math.floor(m / 60)),
  ...[...String(text).matchAll(re(String.raw`${B}(\d{1,2})\s*(?:h|Uhr)${E}`))].map((m) => Number(m[1]) % 24)
]

/** The hour claims of `text` as `[{text, hours}]`, `hours` the hours of the day each claim states. */
function hourClaimsOf(text) {
  const claims = []
  let rest = text.replace(RANGE, (match, h1, m1, s1, h2, m2, s2, at, whole) => {
    const marked = m1 || s1 || m2 || s2
    const after = whole.slice(at + match.length)
    if (!marked && (!OPENING.test(whole.slice(0, at)) || WORD_AFTER.test(after))) return match
    const start = hourOf(h1, s1)
    const end =
      !s2 && !m2 && !/^[ap]/i.test(s1 ?? '') && Number(h2) < start ? Number(h2) + 12 : hourOf(h2, s2)
    claims.push({ text: match.trim(), hours: [start, end] })
    return ' '
  })
  rest = rest.replace(CLOCK, (match, h, minutes, half1, half2) => {
    if (minutes !== undefined && Number(minutes) > 59) return match
    claims.push({ text: match.trim(), hours: [hourOf(h, half1 ?? half2)] })
    return ' '
  })
  rest.replace(BARE, (match, h, at, whole) => {
    if (UNTIL.test(whole.slice(0, at)) && !WORD_AFTER.test(whole.slice(at + match.length)))
      claims.push({ text: match, hours: [hourOf(h)] })
    return match
  })
  return claims
}

const AWARD = re(
  String.raw`${B}(?:award[- ]winning|awards?|awarded|winners?|certified|certifications?|accredit(?:ed|ation)|licensed|champions?|championships?|medal(?:s|ist|ists)?|olympi(?:c|an|ans)|voted|number\s+one|best\s+in|trusted\s+by\s+thousands|preisgekrönt\w*|ausgezeichnet\w*|zertifiziert\w*|testsieger\w*|primé(?:e|s|es)?|récompensé\w*|certifié\w*|numéro\s+un|galardonad[oa]s?|premiad[oa]s?|certificad[oa]s?|número\s+(?:uno|um)|premiat[oaie]|certificat[oai]|numero\s+uno|ISO\s?\d{4,5})${E}|#\s?1(?!\d)|${B}(?:n°|nr\.|no\.)\s?1(?!\d)`
)
const plainKey = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
/** The sentence of `text` around position `at`. */
const sentenceAt = (text, at) => {
  const start = Math.max(...['.', '!', '?', '\n'].map((c) => text.lastIndexOf(c, at - 1))) + 1
  const ends = ['.', '!', '?', '\n'].map((c) => text.indexOf(c, at)).filter((i) => i !== -1)
  return text.slice(start, ends.length ? Math.min(...ends) : text.length)
}
/** Whether a sentence names an award the profile holds ("Winner of the Golden Crust Award", #594 review W2). */
const namesKnownAward = (sentence, awards = []) =>
  awards.some((a) => plainKey(a).length > 0 && plainKey(sentence).includes(plainKey(a)))

/** What a known value must say to prove an award: a one-word award by its stem (`certified` by `certification`). */
const awardKey = (award) => {
  const key = plainKey(award)
  return /^\p{L}+$/u.test(key) ? key.slice(0, 5) : key
}

/**
 * The claims of `text` the known facts do not hold.
 * @param {string} text written copy, its emails, links, phones and money already taken out
 * @param {{numbers: Set<string>, hours: Set<number>, everyDay: boolean, allDay: boolean, addresses: number,
 *   text: string, awards?: string[]}} facts what the plan data holds (`page-writer-data-guard.mjs`); `text` is every value, plain
 * @returns {Array<{what: 'hours' | 'year' | 'number' | 'award', text: string}>}
 */
export function claimsOf(text, facts) {
  const found = []
  const fail = (what, written) => found.push({ what, text: written.trim() })
  let rest = text.replace(ALL_DAY, (match) => {
    if (!facts.allDay) fail('hours', match)
    return ' '
  })
  rest = rest.replace(EVERY_DAY, (match) => {
    if (!facts.everyDay) fail('hours', match)
    return ' '
  })
  for (const claim of hourClaimsOf(rest))
    if (!claim.hours.every((h) => facts.hours.has(h))) fail('hours', claim.text)
  for (const year of rest.match(YEAR) ?? []) if (!facts.numbers.has(year)) fail('year', year)
  const counted = (number) => !/^(?:1[89]\d\d|20\d\d)$/.test(number) && !facts.numbers.has(numberForm(number))
  for (const m of rest.matchAll(COUNT)) {
    const [number, noun] = m[1] === undefined ? [m[3]] : [m[1], m[2]]
    const locations = noun !== undefined && re(String.raw`^(?:${LOCATIONS})$`, 'iu').test(noun)
    if (locations && numberForm(number) === String(facts.addresses)) continue
    if (counted(number)) fail('number', m[0])
  }
  for (const m of [...rest.matchAll(FOR_YEARS), ...rest.matchAll(PERCENT)])
    if (counted(m[1])) fail('number', m[0])
  const known = plainKey(facts.text)
  for (const m of rest.matchAll(AWARD))
    if (!known.includes(awardKey(m[0])) && !namesKnownAward(sentenceAt(rest, m.index), facts.awards))
      fail('award', m[0])
  // A claim the rules above found already ("2,000 happy customers") is not reported again by its number.
  const more = moreClaimsOf(rest, facts, known).filter((c) =>
    c.what === 'award' ? !found.some((f) => f.what === 'award') : !found.some((f) => f.text.includes(c.key))
  )
  return [...found, ...more.map(({ what, text: written }) => ({ what, text: written }))]
}
