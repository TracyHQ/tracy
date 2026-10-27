/** The lr-now fixture read as `readDemoPage` would hand it to the judge (`demo-residue.test.mjs`, `wo-residue-sweep.test.mjs`). */
import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'
import { readResidueInPage } from '../../../src/demo-residue-page.js'

export const ORIGIN = 'https://thewillownook.tracy.site'
const NAV = ['/', '/about-us/', '/our-blog/', '/contact-us/']
export const LR_BRIEF =
  'The Willow Nook is a café and cocktail bar in Copenhagen’s Latin Quarter. Brunch. Coffee, cocktails and cosy corners in Copenhagen. From morning coffee to evening cocktails. Step inside The Willow Nook, a café and cocktail bar in Copenhagen’s Latin Quarter, with vintage sofas and room to slow down.'

/** One page read of a fixture, as `readDemoPage` would hand it to the judge. */
export function lrRead(name) {
  const html = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  const { document } = parseHTML(html)
  // A browser keeps "Coffee &amp; Tea" one text node; the parser splits it at the entity.
  document.body.normalize()
  return {
    path: '/',
    url: `${ORIGIN}/`,
    status: 200,
    navLinks: NAV,
    blocks: [],
    ctas: [],
    residue: readResidueInPage({ origin: ORIGIN }, document)
  }
}
