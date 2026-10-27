// E8 — languages. The interface stays English while the site is Vietnamese, and a second site is in a non-Latin
// language (Japanese): neutral copy comes in the site's language (no English "Menu item", "Service", "Contact"
// left on it), the page declares that language, and a quotation is printed as it was written, never translated.
//
// The site language is carried by the profile's facts (`language` on every text fact); how the host turns it into
// the site language is T3's, so this journey needs the line.

import { test } from 'node:test'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, askPublicDemo, hostAccepts, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { demoRequestV2 } from '../lib/place-profile/fixtures.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { revokeDemosToken } from '../lib/public-demos.mjs'

const ENGLISH_NEUTRAL = ['Menu item', 'Service', 'Product', 'Team', 'Contact', 'Call', 'Step']
const LANGUAGES = [
  ['vi', 'Phở ở đây ngon nhất phố.'],
  ['ja', 'この店のフォーは本当においしい。']
]

/** Mark every text fact of the profile with `language`, and add one quotation in it. */
function inLanguage(body, language, quote) {
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if ('value' in v && 'evidenceRefs' in v && typeof v.value === 'string') v.language = language
    for (const child of Object.values(v)) walk(child)
  }
  walk(body.profile)
  body.profile.quotes.push({
    id: `fact_e2e_quote_${language}`,
    value: { kind: 'testimonial', text: quote },
    evidenceRefs: [],
    language
  })
  return body
}

test('E8 sites in Vietnamese and Japanese', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E8' }, async ({ details }) => {
    const { owner, browser } = await actor(run)
    const tokens = []
    try {
      requireLine(details, 'T3 neutral copy per site language', await hostAccepts(owner))
      details.languages = {}
      for (const [language, quote] of LANGUAGES) {
        const d = (details.languages[language] = {})
        const body = inLanguage(demoRequestV2('restaurant'), language, quote)
        const asked = await askPublicDemo({
          run,
          details: d,
          owner,
          browser,
          body,
          drive: true,
          key: `e2e-${run.runId}-e8-${language}`
        })
        tokens.push(asked.token)
        check(
          asked.created.status === 202,
          `${language}: POST /v1/demos answered ${asked.created.status} ${d.create.code ?? ''}`
        )
        check(d.demo.status === 'ready', `${language}: the demo ended ${d.demo.status}`)
        await judgeDemo({
          run,
          details: d,
          browser,
          id: `E8-${language}`,
          siteKey: d.demo.siteKey,
          profile: body.profile,
          releaseKey: 'tracy-base/j6'
        })
        const page = await browser.evaluate(
          '({ lang: document.documentElement.lang, text: document.body.innerText })'
        )
        d.lang = page.lang
        d.englishNeutral = ENGLISH_NEUTRAL.filter((w) => new RegExp(`\\b${w}\\b`).test(page.text))
        check(
          String(page.lang).toLowerCase().startsWith(language),
          `${language}: the page declares lang="${page.lang}"`
        )
        check(
          d.englishNeutral.length === 0,
          `${language}: English neutral copy: ${d.englishNeutral.join(', ')}`
        )
        if (page.text.includes(quote.slice(0, 6)))
          check(page.text.includes(quote), `${language}: the quotation was changed`)
      }
    } finally {
      for (const tk of tokens) await revokeDemosToken(tk?.refreshToken)
      browser.detach()
    }
  })
})
