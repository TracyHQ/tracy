// A plan placing EVERY block of a block store once, each on its own page, with invented items and social links, and
// its copy written by the REAL page writer with a scripted writer (ticket #595): the input of the accounting tests,
// which hold every icon, video and image field the store declares, at every depth, to a decision. Nothing here is a
// real business, person or link.
import { writePages } from '../../../domain/page-writer.mjs'
import { scriptedWriter } from './invented-yoga.mjs'

const sources = ['site']
const NAMES = ['Stretch', 'Bag work', 'Footwork', 'Sparring', 'Cardio', 'Mobility']
export const SOCIAL_LINKS = [
  'https://www.instagram.com/example.studio',
  'facebook.com/example.studio',
  'https://lnkd.in/example',
  'https://forum.example/studio'
]
const linkId = (n) => (n === 0 ? 'contact-social-url' : `contact-social-url-${n + 1}`)
/** Each team member's own network links: two, one, none, three (a cycle), so rows are filled and left empty alike. */
const PERSON_LINKS = [
  ['https://www.instagram.com/example.member', 'https://www.tiktok.com/@example.member'],
  ['facebook.com/example.member'],
  [],
  ['https://x.com/example', 'https://www.youtube.com/@example', 'https://forum.example/member']
]
/** Whether a block's child lists hold a person's social link: its items are team members. */
const holdsPersonLinks = (block) =>
  [...(block.itemLists ?? []), ...(block.lists ?? [])].some((l) =>
    (l.fields ?? []).some((f) => f.kind === 'person.social_url')
  )
/** Whether a block level child list holds the business's own social links. */
const listsBusinessLinks = (block) =>
  (block.lists ?? []).some((l) => (l.fields ?? []).some((f) => f.kind === 'contact.social_url'))

/** The plan, its needs profile and its written copy, for one block store. */
export async function everyBlockPlaced(store, { language = 'en' } = {}) {
  const items = []
  const pages = []
  for (const block of store.blocks) {
    const max = block.items?.max ?? 1
    const socialItems = (block.itemFields ?? []).some((f) => f.kind === 'contact.social_url')
    const data = []
    const people = holdsPersonLinks(block)
    if (socialItems) data.push(...SOCIAL_LINKS.slice(0, max).map((_, n) => linkId(n)))
    else
      for (let n = 0; n < max; n++) {
        const id = `${block.id}-item-${n + 1}`
        data.push(id)
        items.push(
          people
            ? {
                id,
                kind: 'person',
                fields: {
                  'person.name': { value: `Member ${n + 1}`, sources },
                  'person.social_url': { value: PERSON_LINKS[n % PERSON_LINKS.length], sources }
                },
                sources
              }
            : {
                id,
                kind: 'service',
                fields: { 'offering.name': { value: NAMES[n % NAMES.length], sources } },
                sources
              }
        )
      }
    if ((block.fields ?? []).some((f) => f.kind === 'contact.social_url') || listsBusinessLinks(block))
      data.push(...SOCIAL_LINKS.map((_, n) => linkId(n)))
    pages.push({
      id: block.id,
      blocks: [{ id: 'b1', type: block.type, block: block.id, data: [...new Set(data)] }]
    })
  }
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: { 'contact.social_url': SOCIAL_LINKS.map((value) => ({ value, sources })) },
    items: {
      service: items.filter((i) => i.kind === 'service'),
      person: items.filter((i) => i.kind === 'person')
    }
  }
  const plan = { language, pages, pictures: { own: { frames: 0, from: [] }, generated: { frames: 6 } } }
  const headings = ['Morning stretch', 'Heavy bag rounds', 'Footwork drills', 'Coffee corner']
  let n = 0
  const writer = scriptedWriter((key, slot) =>
    /heading|name|title/.test(slot.kind ?? '')
      ? headings[n++ % headings.length]
      : 'Steady work for every level.'
  )
  const copy = await writePages({ plan, profile, blockStore: store, model: writer })
  return { plan, profile, copy }
}
