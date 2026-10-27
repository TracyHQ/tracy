/** Shared place enrichment, provider controls and provider-aware demo attribution; no live paid calls. */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const url = testDatabaseUrl()
const result = nodeTest(
  [
    'packages/site/tracy-website-opportunities/test/client-customer-text.test.mjs',
    'packages/site/tracy-website-opportunities/test/client-detail.test.mjs',
    'apps/tracy-web/test/website-opportunities-tripadvisor.test.mjs',
    'apps/tracy-web/test/website-opportunities-google-maps.test.mjs',
    'apps/tracy-web/test/config.test.mjs',
    'apps/tracy-web/test/website-opportunities-shared-research.test.mjs',
    'apps/tracy-web/test/ops-wo.test.mjs',
    'apps/tracy-host/test/demo-qa.test.mjs'
  ],
  { env: { TEST_DATABASE_URL: url } }
)
c.tapClean('TripAdvisor research', result)
for (const name of [
  'Supplemental Maps reviews reach attributed testimonials without supplying business facts to QA',
  'shared Research collects menu20 separately, preserves official Google and carries menu sources to brief/demo',
  'menu budget refusal resumes cached place and category without paying for them twice',
  'optional menu quota failure keeps successful place checkpoints and stays silent to the customer',
  'SerpApi uses one request for twenty reviews and normalization keeps the twentieth review photos',
  'SerpApi twenty reviews reach the shared profile and brief; a fresh reader costs no extra calls',
  'SerpApi refresh reuses the accepted place ID without another search and preserves identity checks',
  'branch matching needs corroborating facts, rejects ambiguity and phone conflicts',
  'TripAdvisor enriches a previously fresh snapshot once, is shared and reaches profile and brief without replacing Google',
  'TripAdvisor identity collision is recorded without merging places or fetching reviews',
  'TripAdvisor failure preserves successful reviews and budget refusal pauses without a provider call',
  'TripAdvisor response after cancellation cannot publish or leave an identity',
  'TripAdvisor paused budget resumes its persisted search without paying for it twice',
  'Litescrape Settings seals and clears the override, env fallback stays private and Test only reads key status',
  'TripAdvisor quotations require TripAdvisor attribution and the supplied link; opinions never establish business facts',
  'TripAdvisor author profile links supplied by research also remain on the rendered testimonial',
  'website-only prefetch never calls paid enrichment and campaign control errors propagate',
  'OneAPI primary success does not call Litescrape and charges each actual primary attempt',
  'OneAPI failure application falls back once with separate provider accounting',
  'OneAPI legitimate empty search does not spend fallback quota',
  'budget refusal between failed primary and fallback pauses before fallback network',
  'missing OneAPI branch evidence uses an optional same-brand website association without fallback',
  'fallback cannot replace a primary matched identity when its review call fails',
  'unknown primary outcome is not paid twice after budget pauses the fallback',
  'refresh cannot remap an existing TripAdvisor source or mix another branch reviews',
  'new research retries a recovered provider instead of inheriting the previous job failure checkpoint',
  'customer Details omits optional provider failures and keeps previous reviews after refresh quota failure',
  'TripAdvisor Details keeps exact quotes with real author and source links, separate from Google',
  'optional TripAdvisor quota and provider failures leave no empty or technical customer section',
  'user journey saves a place, starts Research, opens Details and creates an attributed TripAdvisor brief',
  'customer Find hides social quota and reset times without changing operator text',
  'customer Details uses neutral missing-data text for optional provider quotas',
  'SerpApi primary persists reviews, avatars and attached photos through customer Details and demo manifest',
  'SerpApi validates application errors, exact place echo and bounded engine parameters',
  'SerpApi 429 falls through RapidAPI quota to Litescrape with separate attempt records',
  'missing photo capability falls back per step without losing successful SerpApi review photos',
  'provider-switch refresh keeps same-review author links, avatar and attached stored photos',
  'SerpApi budget pause resumes operation checkpoints without double payment',
  'restaurant association accepts Green Land without a website or matching branch, preserves ambiguity and source scope',
  'ordinary Research retries a previous not-found source and collects no-website restaurant reviews without creating branch identity'
])
  c.passes('TripAdvisor research', result, name)
c.done()
