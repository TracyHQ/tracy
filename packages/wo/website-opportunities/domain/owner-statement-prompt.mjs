// DRAFT PROMPT, AWAITING APPROVAL IN #600. The rule the business reading's model reads when the texts include what the
// business owner typed in the build chat (decision D46, `owner-statement.mjs`). It is appended to the reading's system
// message only then: a reading without an owner statement sends the system message of `business-reading.mjs` as it was.
import { BUSINESS_READING_SYSTEM } from './business-reading.mjs'
import { OWNER_REF, OWNER_STATEMENT_KIND } from './owner-statement.mjs'

/** The owner statement rule (draft, #600). */
export const OWNER_STATEMENT_RULE = `- The text [${OWNER_REF}] (${OWNER_STATEMENT_KIND}) is the business owner's own statement, typed in a chat with us. The facts it states are true and may be used like the business's own bio: services, who it serves, its team, its story, its facts and what sets it apart. Its wording is never copy. For anything read from [${OWNER_REF}], its name, label, text, theme, line and who are NOT taken from its quote, whatever the rules above say: write them in your own short words, never four or more of its words in a row (a name of up to three words, a service, a product or a person, may stay as written). They still say only what the quote says: at least half of their words are words of the quote, and every number, name and place in them is in the quote. Quotes of it stay exact, as for every text, and serve only as evidence.`

/** The system message of a reading of these texts: the reading's own, plus the owner rule when the owner spoke. */
export const businessReadingSystemOf = (sources) =>
  Array.isArray(sources) && sources.some((s) => s?.kind === OWNER_STATEMENT_KIND)
    ? `${BUSINESS_READING_SYSTEM}\n${OWNER_STATEMENT_RULE}`
    : BUSINESS_READING_SYSTEM
