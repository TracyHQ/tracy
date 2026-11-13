// The invented florist built on the real JA Boxing kit for the draft write (ticket #597): the boxing florist's pages
// (`write-order/boxing-florist.mjs`) plus a page title block (the masthead, one copy for the site) on the list and
// contact pages, the workout cards with their light and dark icons and the call to action on the home page, and a plans
// page with one plans container holding two tab blocks (the gate places a block once per page: two containers on one
// page are made in the test from this one, as #584 measured them). The home and contact pages also hold the phone menu
// (block-187, the main menu) and a footer menu (block-174, the site-map menu) with menu items (`withMenuItems`).
// Invented packages join the florist's profile. Every step value is made by the real module with scripted fake models;
// nothing here is a real business, person or link.
import { readFileSync } from 'node:fs'
import { buildWriteOrder } from '../../../domain/write-order.mjs'
import { boxingFloristBuild, boxingProfile } from '../write-order/boxing-florist.mjs'
import { withMenuItems, withMenus } from './boxing-site-menus.mjs'

const KIT = new URL(
  '../../../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
  import.meta.url
)
const json = (file) => JSON.parse(readFileSync(new URL(file, KIT), 'utf8'))
export const boxingKit = () => ({
  mapping: json('mapping.json'),
  blankContract: json('blank-site-contract/content-map.json'),
  lock: json('blank-site-contract/presentation-lock.json'),
  released: JSON.parse(
    readFileSync(new URL('../../../../contracts/ja-boxing/j6/1.0.11/content-map.json', KIT), 'utf8')
  )
})

const sources = ['site']
const field = (value) => ({ value, sources, confidence: 'single-source' })
const pkg = (id, name, price) => ({
  id,
  kind: 'package',
  fields: { 'package.name': field(name), 'package.price': field(price) },
  sources,
  confidence: 'single-source'
})
/** The florist with two invented subscriptions. */
export function siteProfile() {
  const profile = boxingProfile()
  // A name short enough for the page title block's default title (the masthead), so the gate keeps it.
  profile.facts['business.name'][0].value = 'Larkspur Blooms'
  profile.items.package = [
    pkg('package-weekly-stems', 'Weekly stems', '$30'),
    pkg('package-monthly-box', 'Monthly box', '$95')
  ]
  return profile
}

const block = (id, data) => ({ block: id, label: id, data, reason: 'Shown.' })
const SHARED = [
  block('header', ['business-name']),
  block('block-176', ['contact-cta-url', 'contact-cta-label'])
]
const FOOT = [
  block('block-170', ['business-name']),
  block('block-171', ['contact-social-url', 'contact-social-url-2', 'contact-social-url-3']),
  block('block-175', ['contact-phone', 'contact-email', 'contact-address'])
]
export function siteComposition(profile) {
  const services = profile.items.service.map((s) => s.id)
  const photos = (profile.items.gallery ?? []).map((g) => g.id)
  return {
    pages: [
      {
        pageType: 'home',
        name: 'Home',
        blocks: [
          ...SHARED,
          block('block-156', ['business-name', 'contact-cta-url', 'contact-cta-label']),
          block('block-157', [services[1]]),
          block('block-160', [services[0]]),
          block('block-161', ['contact-cta-url', 'contact-cta-label']),
          block('block-166', photos),
          ...FOOT
        ]
      },
      {
        pageType: 'classes',
        name: 'All bouquets',
        blocks: [...SHARED, block('block-162', ['business-name']), block('class-list', services.slice(0, 2))]
      },
      {
        pageType: 'class',
        name: 'Wild meadow bouquet',
        blocks: [...SHARED, block('class-detail', [services[0]])]
      },
      { pageType: 'class', name: 'Seasonal posy', blocks: [...SHARED, block('class-detail', [services[1]])] },
      {
        pageType: 'contact',
        name: 'Visit us',
        blocks: [
          ...SHARED,
          block('block-162', ['business-name']),
          block('contact-details', ['contact-phone', 'contact-email', 'contact-address']),
          ...FOOT
        ]
      }
    ],
    assumptions: [],
    leftOut: []
  }
}

const planned = (page, n, id, data) => ({
  id: `${page}-b${n}`,
  type: 'pricing',
  block: id,
  source: 'template',
  label: id,
  data,
  reason: 'Shown.'
})
/**
 * The plans page, added after the gate: its main block (the plans container, block-184) takes no data, so the rules gate
 * drops every plans page (`There was nothing to show in the main section of this page.`). Its header blocks are the
 * contact page's.
 */
function withPlansPage(plan) {
  const contact = plan.pages.find((p) => p.pageType === 'contact')
  const [header, button] = contact.blocks
  const at = plan.pages.indexOf(contact)
  plan.pages.splice(at, 0, {
    id: 'plans',
    pageType: 'plans',
    name: 'Subscriptions',
    blocks: [
      { ...header, id: 'plans-b1' },
      { ...button, id: 'plans-b2' },
      planned('plans', 3, 'block-184', []),
      planned('plans', 4, 'block-167', ['package-weekly-stems']),
      planned('plans', 5, 'block-189', ['package-monthly-box'])
    ]
  })
}

/** The saved step values and the write order of the site, with the mapping file read from the kit. */
export async function boxingSite({ write } = {}) {
  const profile = siteProfile()
  const kit = boxingKit()
  const build = await boxingFloristBuild({
    profile,
    composition: siteComposition(profile),
    write,
    extend: (plan) => {
      withPlansPage(plan)
      withMenus(plan)
    }
  })
  build.aiq.mapping = kit.mapping
  const order = buildWriteOrder(build)
  withMenuItems(order, build.aiq)
  const stored = Object.fromEntries(
    [...order.pictures.map((p) => p.frame), ...order.icons.map((i) => i.id)].map((id) => [
      id,
      { id: `stored-${id}` }
    ])
  )
  return { build, order, kit, stored, aiq: { ...build.aiq, blankContract: kit.blankContract } }
}
