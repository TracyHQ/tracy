// An invented climbing hall whose owner types, in the build chat, one service its website never mentions (decision D46,
// #609): the shape of a real run where the reading read the statement, the model reworded its quote, and the fact never
// reached the profile. Every name, page and answer here is made up.

export const HALL_NAME = 'Brackwater Climbing Hall'
/** The service only the owner states: no web text holds it. */
export const HALL_CLUB_SENTENCE = 'We also run evening climbing clubs for teens on Thursdays.'
export const HALL_STATEMENT = `I run ${HALL_NAME}, a bouldering gym. ${HALL_CLUB_SENTENCE}`
export const HALL_PAGES = Object.freeze([
  {
    url: 'https://brackwater-climbing.example/',
    title: HALL_NAME,
    text: `${HALL_NAME}. Day passes, monthly memberships and shoe rental. Open to every level.`
  }
])

/** The label the model writes for the club, in its own words as the owner rule asks. */
export const CLUB_LABEL = 'Teen evening climbing clubs'
/** A quote that rewords the owner's sentence instead of copying it (what the recorded run's model did). */
export const REWORDED_QUOTE = 'evening climbing club for teens every Thursday'
/** A quote that is a word for word span of the owner's sentence. */
export const EXACT_QUOTE = 'evening climbing clubs for teens on Thursdays'

/** The first answer: the web service reads well; the owner's club, as a service and as a USP theme, rewords its quote. */
export const FIRST_ANSWER = Object.freeze({
  services: [
    {
      name: 'Day passes',
      quote: 'Day passes, monthly memberships and shoe rental.',
      ref: 'website:1:1'
    },
    { name: CLUB_LABEL, quote: REWORDED_QUOTE, ref: 'owner' }
  ],
  uspThemes: [
    {
      label: 'evening climbing clubs for teens',
      line: 'Evening clubs for teen climbers',
      accent: 'teen climbers',
      who: 'teens',
      quotes: [{ quote: REWORDED_QUOTE, ref: 'owner' }]
    }
  ]
})

/** The owner quote retry's answer: the same club, its quote now copied exactly. */
export const RETRY_ANSWER = Object.freeze({
  services: [{ name: CLUB_LABEL, quote: EXACT_QUOTE, ref: 'owner' }]
})

/** A retry that rewords again. */
export const RETRY_REWORDED = Object.freeze({
  services: [{ name: CLUB_LABEL, quote: REWORDED_QUOTE, ref: 'owner' }]
})
