/**
 * Decision D46 (#609): what the owner types in the build chat is a SOURCE the machine rewrites, never copy the site
 * shows as typed. This guard runs on the brief once it is made: a sentence of the description that stands word for
 * word (case, spacing and punctuation aside) in the brief's hero copy, About story (copy, evidence, facts), story
 * facts (the bio), headline line (`usp.line`) or brand voice evidence is taken out of that place, and each removal is
 * recorded (`keptOut`) for the research record. It never fails: the worst it does is leave a place with less in it.
 * Sentences under `MIN_WORDS` words ("Come early.") are too common to say anything was copied.
 */

/** The shortest description sentence the guard compares: shorter ones are everyday phrases, not the owner's copy. */
export const MIN_WORDS = 5

/** A text reduced to its words: lower case, letters and digits only, single spaces. */
const wordsOf = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The sentences of a text, as written (split after `.`, `!`, `?` or at a line break). */
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * The description's sentences the guard looks for: each as typed and as words, at least `MIN_WORDS` words long.
 * @param {string | null | undefined} description
 * @returns {{sentence: string, words: string}[]}
 */
export function guardedSentencesOf(description) {
  if (!isText(description)) return []
  return sentencesOf(description)
    .map((sentence) => ({ sentence, words: wordsOf(sentence) }))
    .filter((s) => s.words.split(' ').length >= MIN_WORDS)
}

/** The first guarded sentence `text` holds word for word, or null. */
function copiedIn(text, guarded) {
  if (!isText(text)) return null
  const words = ` ${wordsOf(text)} `
  return guarded.find((g) => words.includes(` ${g.words} `)) ?? null
}

/**
 * Keep the description's sentences out of the brief, in place.
 * @param {object} brief the brief `makeSiteBrief` made
 * @param {string | null | undefined} description what the owner typed
 * @returns {{sentence: string, where: string}[]} what was taken out, and where from
 */
export function keepDescriptionOut(brief, description) {
  const guarded = guardedSentencesOf(description)
  const keptOut = []
  if (!guarded.length || !brief || typeof brief !== 'object') return keptOut
  const note = (found, where) => keptOut.push({ sentence: found.sentence, where })
  // A list of `{quote}` / `{text, quote}` entries without the copied ones.
  const withoutCopied = (entries, where) =>
    entries.filter((e) => {
      const found = copiedIn(e?.quote, guarded) ?? copiedIn(e?.text, guarded)
      if (found) note(found, where)
      return !found
    })

  // Story facts (the bio among them): kept in the brief for the record, off the site.
  for (const fact of Array.isArray(brief.facts) ? brief.facts : []) {
    if (fact?.field !== 'story' || fact.onSite === false) continue
    const found =
      copiedIn(fact.value?.text, guarded) ??
      (Array.isArray(fact.evidence)
        ? fact.evidence.map((e) => copiedIn(e?.quote, guarded)).find(Boolean)
        : null)
    if (!found) continue
    fact.onSite = false
    fact.reasons = [...(Array.isArray(fact.reasons) ? fact.reasons : []), 'owner-description-verbatim']
    note(found, 'fact.story')
  }

  const name = isText(brief.business?.name) ? brief.business.name.trim() : null
  for (const page of Array.isArray(brief.sitemap) ? brief.sitemap : []) {
    for (const section of Array.isArray(page?.sections) ? page.sections : []) {
      const kind = section?.kind
      if (kind !== 'hero' && kind !== 'story') continue
      // The copy loses the copied sentences; a copy left with nothing names the business, as a hero without words does.
      if (isText(section.copy)) {
        const kept = sentencesOf(section.copy).filter((s) => {
          const found = copiedIn(s, guarded)
          if (found) note(found, `${kind}.copy`)
          return !found
        })
        const copy = kept.join(' ')
        if (copy !== section.copy.trim())
          section.copy = copy || (name ? (kind === 'story' ? `About ${name}.` : `${name}.`) : '')
      }
      if (Array.isArray(section.evidence))
        section.evidence = withoutCopied(section.evidence, `${kind}.evidence`)
      if (Array.isArray(section.facts)) section.facts = withoutCopied(section.facts, `${kind}.facts`)
      const line = copiedIn(section.usp?.line, guarded)
      if (line) {
        note(line, `${kind}.usp`)
        delete section.usp
      }
    }
  }

  // The brand voice's evidence, as the brief carries it and per origin when it does.
  const brand = brief.brand
  for (const part of [brand, brand?.website, brand?.social]) {
    if (part && Array.isArray(part.evidence)) part.evidence = withoutCopied(part.evidence, 'brand.evidence')
  }
  return keptOut
}
