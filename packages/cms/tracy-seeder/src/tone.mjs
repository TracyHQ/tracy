/**
 * The customer's Tone answer (`plain | warm | bold`, TCH #1013 U11) as an instruction a copy model obeys.
 *
 * 🔒 ONE WORD IS NOT A VOICE. Until 08/10/2026 the planners handed the model `tone: "Bold"` inside the brief and nothing
 * else, beside a sample text whose register it was told to keep. Measured on dev with twin sites that differed only in
 * tone: Tracy Business (EmDash) plain vs bold had the same H1 and nearly the same voice; JA Nova (WordPress) differed in a
 * line or two. So each tone is DEFINED here — sentence length, word choice, punctuation, headline and CTA style, what to
 * avoid — and the definition goes into the SYSTEM instruction of every batch, said to win over the sample's register.
 *
 * The same three definitions are written into the EmDash tool (`tools/personalize.mjs` `TONE_RULES`), which cannot import
 * this package (ADR 0006: the kit and the templates depend on nothing here); change one, change the other.
 */

/** @typedef {'plain' | 'warm' | 'bold'} ToneId */

/** What each tone means on the page. English: it is an instruction to a model, never shown to anyone. */
export const TONES = Object.freeze({
  plain:
    'PLAIN: clear, calm and direct, like a capable professional explaining. Sentences of 8 to 16 words, one idea each; ' +
    'everyday, concrete words that name the thing itself. Full stops only: no exclamation marks, no rhetorical questions. ' +
    'Headlines say plainly what is offered ("Sourdough baked every morning"). CTAs are literal verb + object ("View the menu", ' +
    '"Contact us"). Avoid slogans, wordplay, hype adjectives (amazing, ultimate, world-class), superlatives and emotional language.',
  warm:
    'WARM: friendly and personal, like the owner talking to a neighbour. Address the reader as "you" and the business as ' +
    '"we"; contractions are welcome (we\'re, you\'ll). Sentences of 10 to 20 words with an easy rhythm; words of care, ' +
    'welcome, comfort and people. At most one exclamation mark per section. Headlines invite or reassure ("Come in, the ' +
    'bread is still warm"). CTAs are inviting and personal ("Come say hello", "Find your favourite"). Avoid hard selling, ' +
    'jargon, cold corporate phrasing and commands.',
  bold:
    'BOLD: confident and punchy, like a brand sure of what it makes. Short sentences of 3 to 10 words; fragments are fine. ' +
    'Strong active verbs, imperatives, vivid concrete nouns, rhythm and contrast ("Small batches. Big crust."). Headlines ' +
    'are short declarations, 2 to 6 words where the slot allows. CTAs are direct commands ("Order now", "Taste it today", ' +
    '"Book your table"). An exclamation mark is allowed once per section, never more. Avoid hedging (may, might, perhaps, ' +
    'we try), filler, passive voice and long qualifiers; confidence comes from wording, never from claims the brief does ' +
    'not make (no "best in town", no "#1").'
})

/**
 * Which of the three tones a `tone` text names, or null. The text is what the brief carries: the option's English label
 * ("Bold") from the seven questions, the option id, or an older phrase that starts with it ("bold, confident and creative").
 * @param {unknown} tone
 * @returns {ToneId | null}
 */
export function toneOf(tone) {
  if (typeof tone !== 'string') return null
  const m = /^\s*(plain|warm|bold)\b/i.exec(tone)
  return m ? /** @type {ToneId} */ (m[1].toLowerCase()) : null
}

/**
 * The tone instruction appended to a copy prompt's system text, or '' when the brief names no tone. A tone none of the
 * three definitions covers (an older free-text phrase) is still binding, in its own words.
 * @param {unknown} tone - the brief's `tone`
 * @returns {string}
 */
export function toneRule(tone) {
  if (typeof tone !== 'string' || tone.trim() === '') return ''
  const id = toneOf(tone)
  const voice = id ? TONES[id] : `"${tone.trim().slice(0, 200)}"`
  return (
    ' TONE OF VOICE (binding): write EVERY value in this tone, headings, button labels and calls to action included, not ' +
    'only the body text. The tone decides how a line sounds, never what it is about or which facts it states. It overrides ' +
    "the sample's register: the sample shows the role and the length only. Two sites with the same brief and different " +
    `tones must read clearly differently. The tone: ${voice}`
  )
}
