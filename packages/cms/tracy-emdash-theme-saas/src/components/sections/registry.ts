// Section collection → component. Every collection a page may list has one entry here; a collection
// without one is skipped by views/Sections.astro and shows up as a missing block in visual QA.
import Hero from './Hero.astro'
import Clients from './Clients.astro'
import Bento from './Bento.astro'
import IncidentTimeline from './IncidentTimeline.astro'
import KineticqlSplit from './KineticqlSplit.astro'
import FeaturesLedger from './FeaturesLedger.astro'
import FeaturesIntro from './FeaturesIntro.astro'
import Testimonials from './Testimonials.astro'
import Cta from './Cta.astro'
import PageMasthead from './PageMasthead.astro'
import Pricing from './Pricing.astro'
import PricingMatrix from './PricingMatrix.astro'
import Accordion from './Accordion.astro'
import FaqSupport from './FaqSupport.astro'
import ProseQuote from './ProseQuote.astro'
import Teams from './Teams.astro'
import ContactBlock from './ContactBlock.astro'

export const SECTION_COMPONENTS: Record<string, any> = {
  hero: Hero,
  clients: Clients,
  bento: Bento,
  incident_timeline: IncidentTimeline,
  kineticql_split: KineticqlSplit,
  features_ledger: FeaturesLedger,
  features_intro: FeaturesIntro,
  testimonials: Testimonials,
  cta: Cta,
  page_masthead: PageMasthead,
  pricing: Pricing,
  pricing_matrix: PricingMatrix,
  accordion: Accordion,
  faq_support: FaqSupport,
  prose_quote: ProseQuote,
  teams: Teams,
  contact_block: ContactBlock
}
