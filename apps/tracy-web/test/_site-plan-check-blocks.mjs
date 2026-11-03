// Block decisions for the site plan checker tests (ADR 0041): a helper that keeps a block while hiding everything
// in it, and the kept blocks of the passing plan.
const SEEN = 'block seen in the kit image'
export const hide = (block) => ({ block, seen: SEEN, decision: 'hide', why: 'not needed for this business' })
const hidden = (slot) => ({ slot, why: 'nothing true to say here' })
const photo = (frame, extra = {}) => ({ frame, kind: 'photo', match: 'any-real', size: 'wide', ...extra })
const icon = (frame) => ({
  frame,
  kind: 'icon',
  match: 'specific',
  size: 'small icon',
  shows: 'a racket',
  mood: 'calm',
  mustInclude: ['racket'],
  avoid: ['text']
})

// A kept decision that hides every list, link and demo slot of a kit block and gives a picture wish to each frame
// that may not be hidden; a test then writes into the parts it needs.
export function keepHidingAll(k, blockId) {
  const b = k.blocks.find((x) => x.id === blockId)
  const nameSlots = new Set(k.site.nameSlots.filter((n) => n.kind === 'slot').map((n) => n.id))
  const frames = new Map(b.frames.map((f) => [f.id, f]))
  const hiddenSlots = []
  const pictures = []
  for (const l of b.lists) hiddenSlots.push(hidden(l.id))
  for (const l of b.links) hiddenSlots.push(hidden(l.id))
  for (const d of b.demoOwned) if (!frames.has(d.id) && !nameSlots.has(d.id)) hiddenSlots.push(hidden(d.id))
  for (const f of frames.values()) {
    if (f.kind === 'logo' || f.twinOf || f.fixed) continue
    if (f.kind === 'icon' && f.canHide === false) pictures.push(icon(f.id))
    else if (f.canHide === false || f.kind === 'cutout') pictures.push(photo(f.id, { kind: f.kind }))
    else hiddenSlots.push(hidden(f.id))
  }
  return { block: blockId, seen: SEEN, decision: 'keep', why: 'fits the business', pictures, hiddenSlots }
}

// The kept blocks of the passing plan: the header call button, the About us items block with two rows, the
// trainers block with two coaches, the class page body and the contact page with its map button.
export function keptBlocks(k) {
  const header = keepHidingAll(k, 'block-176')
  header.hiddenSlots = []
  header.copy = [
    { slot: 'block-176.1', says: 'button: call the club', text: 'Call us', basis: 'trade', maxCharacters: 40 }
  ]
  header.links = [{ link: 'block-176.link-1', labelSlot: 'block-176.1', leadsTo: 'phone:f-phone' }]
  const items = keepHidingAll(k, 'block-190')
  items.hiddenSlots = items.hiddenSlots.filter(
    (h) => !['block-190.item', 'block-190.link-1'].includes(h.slot)
  )
  items.copy = [
    {
      slot: 'block-157.23',
      says: 'button to the classes',
      text: 'See classes',
      basis: 'trade',
      maxCharacters: 37
    }
  ]
  items.links = [{ link: 'block-190.link-1', labelSlot: 'block-157.23', leadsTo: 'page-classes' }]
  items.lists = [
    {
      list: 'block-190.item',
      rows: 2,
      items: [
        listRow('Tennis lessons', 'block-190.0', 'block-190.4', 'f-tennis', 'block-190.12'),
        listRow('Padel coaching', 'block-190.1', 'block-190.5', 'f-padel', 'block-190.13')
      ]
    }
  ]
  const trainers = keepHidingAll(k, 'block-163')
  trainers.hiddenSlots = trainers.hiddenSlots.filter(
    (h) => !/^block-163\.[0-7]$|^block-163\.person$/.test(h.slot)
  )
  trainers.lists = [
    {
      list: 'block-163.person',
      rows: 2,
      items: [personRow(0, 'f-coach-1'), personRow(1, 'f-coach-2')]
    }
  ]
  const classBody = keepHidingAll(k, 'body-classes_advanced-boxing')
  const video = classBody.pictures.find((p) => p.frame === 'article-16.11')
  if (video) {
    delete video.size
    delete video.match
    video.sameAs = 'article-16.6'
  }
  const contact = keepHidingAll(k, 'body-about-us_contact')
  const mapButton = 'body-about-us_contact.button-1'
  contact.hiddenSlots = contact.hiddenSlots.filter((h) => h.slot !== mapButton)
  contact.copy = [
    {
      slot: 'languageString-30910664.0',
      says: 'map button',
      text: 'Open map',
      basis: 'trade',
      maxCharacters: 26
    }
  ]
  contact.links = [{ link: mapButton, labelSlot: 'languageString-30910664.0', leadsTo: 'map:f-address' }]
  return {
    'body-about-us_contact': contact,
    'block-176': header,
    'block-190': items,
    'block-163': trainers,
    'body-classes_advanced-boxing': classBody
  }
}

function listRow(about, nameSlot, textSlot, factId, iconFrame) {
  return {
    about,
    copy: [
      { slot: nameSlot, says: about, factIds: [factId], basis: 'brief', maxCharacters: 36 },
      {
        slot: textSlot,
        says: `what a ${about.toLowerCase()} session is like`,
        factIds: [factId],
        basis: 'brief',
        maxCharacters: 106
      }
    ],
    pictures: [icon(iconFrame)]
  }
}

function personRow(i, factId) {
  return {
    about: 'a coach',
    copy: [
      {
        slot: `block-163.${4 + i}`,
        says: 'coach name',
        factIds: [factId],
        basis: 'brief',
        maxCharacters: 31
      },
      {
        slot: `block-163.${12 + i}`,
        says: 'what this coach teaches',
        factIds: [factId],
        basis: 'brief',
        maxCharacters: 556
      }
    ],
    pictures: [{ frame: `block-163.${i}`, kind: 'photo', match: 'person', size: 'portrait', person: factId }]
  }
}
