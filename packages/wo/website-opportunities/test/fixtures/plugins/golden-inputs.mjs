// Inputs for the golden comparison of the plugin paths: every branch of the opportunity score and every
// outreach language, crossed so a change in any rule or template shows up as a changed output.
const NOW = new Date('2026-10-18T00:00:00Z')
const ago = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

const candidates = [
  {},
  { name: 'Corner Cafe', rating: 4.6, reviews: 812, phone: '+1 555 0100', socials: {} },
  { name: 'Corner Cafe', rating: 2.5, reviews: 0, socials: { facebook: 'https://facebook.com/corner' } },
  { name: 'Corner Cafe', rating: 5, reviews: 100000, email: 'hi@corner.example' },
  { name: 'Corner Cafe', reviews: 40, emails: ['a@corner.example'], contacts: { whatsapp: '+1555' } },
  { name: 'Corner Cafe', rating: 4.1, reviews: 77, socials: { instagram: '' }, contacts: { zalo: '' } },
  { name: 'Corner Cafe', rating: 4.9, reviews: 3000, phone: '+1', chain: true },
  { name: 'Corner Cafe', rating: 4.9, reviews: 3000, phone: '+1', temporarilyClosed: true },
  { name: 'Corner Cafe', rating: 4.9, reviews: 3000, phone: '+1', chain: true, temporarilyClosed: true }
]
const sites = [undefined, 'https://corner.example/']
const siteChecks = [
  undefined,
  null,
  { status: 'queued' },
  { status: 'down' },
  { status: 'failed' },
  { status: 'done', performance: 92, https: true, mobileFriendly: true, copyrightYear: 2026 },
  { status: 'done', performance: 32, https: false, mobileFriendly: false, copyrightYear: 2016 },
  { status: 'done', performance: 49 },
  { status: 'done', https: false },
  { status: 'done', mobileFriendly: false },
  { status: 'done', copyrightYear: 2021 },
  { status: 'done', copyrightYear: 2022, performance: null }
]
const socials = [
  undefined,
  null,
  {},
  { lastPostAt: 'not a date' },
  { lastPostAt: ago(0.6) },
  { lastPostAt: ago(30) },
  { lastPostAt: ago(31) },
  { lastPostAt: ago(90) },
  { lastPostAt: ago(91) }
]
const thresholds = [undefined, 40, 75, Number.NaN]

export function scoreInputs() {
  const out = []
  for (const c of candidates)
    for (const website of sites)
      for (const siteCheck of siteChecks)
        for (const social of socials)
          for (const slowSiteThreshold of thresholds) {
            const input = { candidate: website ? { ...c, website } : c, now: NOW }
            if (siteCheck !== undefined) input.siteCheck = siteCheck
            if (social !== undefined) input.social = social
            if (slowSiteThreshold !== undefined) input.slowSiteThreshold = slowSiteThreshold
            out.push(input)
          }
  return out
}

export const OUTREACH_LANGUAGES = [
  'en',
  'vi',
  'de',
  'it',
  'fr',
  'nl',
  'zh',
  'es',
  'th',
  'ja',
  'ko',
  'id',
  'pt',
  undefined
]

export function outreachInputs() {
  const out = []
  for (const language of OUTREACH_LANGUAGES)
    for (const expiresAt of [undefined, null, 'garbage', '2026-11-30T00:00:00Z'])
      for (const signature of [undefined, '', 'Sam'])
        out.push({ place: 'Corner Cafe', url: 'https://demo.example/corner', expiresAt, signature, language })
  return out
}
