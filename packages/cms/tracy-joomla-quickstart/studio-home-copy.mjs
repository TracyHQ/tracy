/** Keep the OpenDesign composition while speaking about the existing Tracy Apple studio. */
import { readFileSync } from 'node:fs'
import { studioFact } from './studio-content.mjs'

const copy = JSON.parse(readFileSync(new URL('./studio-home-copy.json', import.meta.url), 'utf8'))
// These source labels are placement bindings; their values live only in the site contract.
const bindings = {
  Starter: 'pricing.starter.name',
  $0: 'pricing.starter.amount',
  'Get started free': 'cta.primary.label',
  Northwind: 'services.strategy.name',
  'Lumen Labs': 'services.design.name',
  Fieldnote: 'services.development.name',
  Arcadia: 'services.content.name',
  Helios: 'services.care.name',
  'Maya Chen': 'team.hale.name',
  'Head of Design, Northwind': 'team.hale.role',
  'Jonas Weber': 'team.lang.name',
  'Engineering Lead, Lumen Labs': 'team.lang.role',
  'Priya Natarajan': 'team.meyer.name',
  'Founder, Fieldnote': 'team.meyer.role',
  Pro: 'pricing.studio.name',
  $29: 'pricing.studio.amount',
  Enterprise: 'pricing.foundry.name',
  Custom: 'pricing.foundry.amount',
  'Start free. Upgrade only when it earns it.': 'pricing.notice'
}
for (const [source, ref] of Object.entries(bindings)) copy[source] = studioFact(ref)
export function applyStudioHomeCopy(section, kind) {
  // Replace complete text-only elements, including entity-split text nodes, exactly once.
  for (const element of [section, ...section.querySelectorAll('*')]) {
    if (element.children.length || element.closest('svg')) continue
    const text = element.textContent.trim()
    if (Object.hasOwn(copy, text)) element.textContent = copy[text]
  }
  const note = section.querySelector('.od-demo-note')
  if (note) {
    if (kind === 'testimonials')
      note.textContent = 'Illustrative studio profiles. Meet the full team on the Company page.'
    else if (kind === 'pricing')
      note.textContent = 'Demo plans only. Confirm the scope and price for your project.'
    else note.remove()
  }
  if (kind === 'pricing') {
    const lists = [...section.querySelectorAll('ul')]
    // Match /pricing exactly: three benefits per package, not an extra invented entitlement.
    if (lists[1]?.children.length === 4) lists[1].lastElementChild.remove()
    for (const [index, list] of lists.entries()) {
      const price = list.previousElementSibling
      const suffix = price.children[1] ?? price.appendChild(price.ownerDocument.createElement('span'))
      const plan = ['starter', 'studio', 'foundry'][index]
      suffix.textContent = studioFact(`pricing.${plan}.period`)
      suffix.style.cssText = 'font-size:var(--brand-font-size-sm);color:var(--brand-color-text-secondary)'
    }
  }
  if (kind === 'final-cta') {
    section.querySelector('p').textContent =
      'Bring the idea, the existing site or the question you have not answered yet. Start with a conversation.'
  }
  for (const link of section.querySelectorAll('a')) {
    const text = link.textContent.trim()
    if (text === 'Explore the website toolkit') link.href = '/product'
    if (text === 'Explore our services →') link.href = studioFact('cta.services.href')
    if (text === studioFact('cta.primary.label') || link.getAttribute('href') === '/resources/contact')
      link.href = studioFact('cta.primary.href')
  }
}
