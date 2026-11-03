// Inputs for the site plan checker tests (ADR 0041): the JA Boxing 1.0.10 kit committed in the repo and an
// invented brief built on the invented "Harbour Sport Club" research fixture.
import { readFileSync } from 'node:fs'

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const KIT = read(
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10/template-kit.json'
)
const RESEARCH = read('./fixtures/harbour-sport-club-research.json')
// The map setting slot the contact page's map button opens (rule R19). A kit built before site.settingSlots
// existed lacks it; the copy used here then gains the same entry newer kits declare, so the tests run on both.
const MAP_SLOT = 'block-164.map-location'
// A contact setting slot (the contact record's mobile field), declared by kits that carry site.settingSlots.
const MOBILE_SLOT = 'contact-1.mobile'
export function kit() {
  const k = structuredClone(KIT)
  k.site.settingSlots ??= []
  if (!k.site.settingSlots.some((s) => s.id === MAP_SLOT))
    k.site.settingSlots.push({ id: MAP_SLOT, kind: 'map-location', writable: true })
  if (!k.site.settingSlots.some((s) => s.id === MOBILE_SLOT))
    k.site.settingSlots.push({ id: MOBILE_SLOT, kind: 'contact-mobile', writable: true })
  const contact = k.blocks.find((b) => b.id === 'body-about-us_contact')
  const button = contact.links.find((l) => l.id === 'body-about-us_contact.button-1')
  button.opens = { ...button.opens, writable: true, slotId: MAP_SLOT }
  return k
}

// The invented brief. Phones, sports and coach names come from the fixture's bio and first review; the address,
// the withheld rating and the observed audience line are invented here.
export function brief() {
  const phones = RESEARCH.bio.match(/\+971 50 000 \d{4}/g)
  const coaches = /with (\w+) and (\w+)/.exec(RESEARCH.reviews[0].text).slice(1, 3)
  return {
    opportunityId: 'opp-harbour-sport-club',
    language: 'en',
    contact: { whatsapp: phones[0] },
    facts: [
      { id: 'f-name', field: 'name', value: 'Harbour Sport Club', source: 'stated' },
      { id: 'f-phone', field: 'phone', value: phones[1], source: 'stated' },
      { id: 'f-whatsapp', field: 'whatsapp', value: phones[0], source: 'stated' },
      { id: 'f-address', field: 'address', value: '1 Harbour Walk', source: 'stated' },
      { id: 'f-tennis', field: 'services', value: 'Tennis lessons', source: 'stated' },
      { id: 'f-padel', field: 'services', value: 'Padel coaching', source: 'stated' },
      { id: 'f-swim', field: 'services', value: 'Swimming lessons', source: 'stated' },
      { id: 'f-coach-1', field: 'team', value: `${coaches[0]}, padel and tennis coach`, source: 'stated' },
      { id: 'f-coach-2', field: 'team', value: `${coaches[1]}, padel and tennis coach`, source: 'stated' },
      { id: 'f-story', field: 'story', value: 'European coaching for all ages and levels', source: 'stated' },
      {
        id: 'f-crowd',
        field: 'audience',
        value: 'Families with children',
        evidence: [{ source: 'observed' }]
      },
      { id: 'f-rating', field: 'googleRating', value: '4.9', source: 'stated' }
    ],
    missing: [{ field: 'googleRating', withheld: [{ source: 'invented', values: ['4.9 stars'] }] }]
  }
}
