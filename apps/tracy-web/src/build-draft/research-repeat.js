/**
 * What a research keeps for the next one (#609). Pure.
 *
 * 🔒 THE OWNER CHOOSES THEIR PLACE ONCE. A Google link that matches more than one place is asked about once
 * (`gather-place.js`); the place the owner chose rides on the research record (`place`), and every later research
 * whose Google link is the same reads it from there, so the question never comes back for the same link. Another
 * Google link is another place: it is asked again. Starting over removes the draft, and the choice with it.
 *
 * A research asked for again always runs again (the owner may have changed what the links show), and keeps what the
 * owner already told it: the place above, and every answer to a question the new research asks the same way
 * (`answers-kept.js`). The tool sends an answer again when the engine asks its question again (`build-tool.mjs`).
 */
import { parseGoogleLink } from 'website-opportunities/domain'

const list = (value) => (Array.isArray(value) ? value : [])

/** The Google link among the owner's links, as its address reads, or null. */
export const googleLinkOf = (links) =>
  list(links)
    .map((link) => parseGoogleLink(link)?.url)
    .find(Boolean) ?? null

/**
 * The place the owner chose for the Google link of `links` in an earlier research: a candidate or `'none'`, or
 * undefined when the stored research chose none or read another Google link.
 * @param {object | null | undefined} research the stored research record
 * @param {string[]} links the links of the research about to run
 */
export function keptPlaceOf(research, links) {
  const kept = research?.place
  if (kept === undefined || kept === null) return undefined
  const was = googleLinkOf(research.links)
  return was !== null && was === googleLinkOf(links) ? kept : undefined
}

/**
 * The research record as the draft keeps it: with the place the owner chose, when one was chosen.
 * @param {object} record what the research step answered
 * @param {object | 'none' | undefined} place
 */
export const keptRecordOf = (record, place) => (place ? { ...record, place } : record)
