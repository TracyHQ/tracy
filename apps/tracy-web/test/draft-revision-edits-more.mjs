// More plan revisions of the revision run tests (#599), beyond `draft-revision-edits.mjs`: one fact or one field at a
// time, on the plan only or the profile only, blocks and lists cut, so that the edit matrix covers every kind of value
// a writer may quote. Invented data only. A change of the site language is not here: the invented icon library has
// English keywords only, so a full build in another language stops at the icons step on its own.
import { withWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { EDITS, HELD_PERSON, NEW_NAME, SERVICE } from './draft-revision-edits.mjs'

const blockOf = (plan, id) => plan.pages.flatMap((p) => p.blocks).find((b) => b.id === id)
const factOf = (plan, id) => plan.facts.find((f) => f.id === id)
const serviceOf = (draft, id = SERVICE) => draft.profile.items.service.find((s) => s.id === id)
/** A fact changed in the plan and in the profile, as the plan edit gate returns it. */
const fact = (id, kind, value) => (draft) => {
  factOf(draft.plan, id).value = value
  draft.profile.facts[kind][0].value = value
}

/** Each edit: `{plan, profile}` of revision 2, from revision 1. */
export const MORE_EDITS = {
  'rename a service in the plan only': (d) => {
    d.plan.items.find((i) => i.id === SERVICE).label = NEW_NAME
  },
  'rename a service in the profile only': (d) => {
    serviceOf(d).fields['offering.name'].value = NEW_NAME
  },
  'change a service price': (d) => {
    serviceOf(d).fields['offering.price'].value = '$55'
  },
  'change a package price': (d) => {
    d.profile.items.package[0].fields['package.price'].value = '$33'
  },
  'change the email': fact('contact-email', 'contact.email', 'shop@larkspur.example'),
  'change the hours': fact('contact-hours', 'contact.hours', 'Mo-Sa 08:00-18:00'),
  'change the button label': fact('contact-cta-label', 'contact.cta_label', 'Order flowers now'),
  'change the button link': fact(
    'contact-cta-url',
    'contact.cta_url',
    'https://larkspur-florist.example/shop'
  ),
  'change the social link': fact(
    'contact-social-url',
    'contact.social_url',
    'https://www.instagram.com/larkspur_new_example'
  ),
  'change the accent colour': (d) => {
    d.plan.look.accent = '#3d549c'
  },
  'change a review text': (d) => {
    d.profile.items.quote[0].fields['quote.text'].value = 'The bouquet lasted three weeks.'
  },
  'rename a reviewer': (d) => {
    d.profile.items.quote[0].fields['quote.author_name'].value = 'Pellam Orrin'
    d.plan.items.find((i) => i.id.startsWith('quote-the')).label = 'Review by Pellam Orrin'
  },
  'take a reviewer off a block': (d) => {
    blockOf(d.plan, 'home-extra-11').data = [blockOf(d.plan, 'home-extra-11').data[0]]
  },
  'hold a reviewer the writer never named': (d) => {
    d.profile = withWithheld(d.profile, { withheld: { people: [HELD_PERSON] } })
  },
  'rename a service and change the phone': (d) => {
    EDITS['rename a service'](d)
    EDITS['change the phone'](d)
  },
  'change the site name in the profile only': (d) => {
    d.profile.facts['business.name'][0].value = 'Larkspur Stems'
  },
  'change the site name in the plan only': (d) => {
    factOf(d.plan, 'business-name').value = 'Larkspur Stems'
  },
  'change a gallery label': (d) => {
    d.plan.items.find((i) => i.kind === 'gallery').label = 'Shop photo till'
    d.profile.items.gallery[0].label = 'Shop photo till'
  },
  'add a voice': (d) => {
    d.profile.voice = { tone: 'warm', sample: 'We tie every stem by hand.' }
  },
  'take a page row off a list': (d) => {
    const rows = blockOf(d.plan, 'classes-b3').lists[0]
    rows.rows = rows.rows.filter((r) => r.page !== 'class-2')
  },
  'take a block off a page': (d) => {
    d.plan.pages[0].blocks = d.plan.pages[0].blocks.filter((b) => b.id !== 'home-b6')
  },
  'empty a block list': (d) => {
    blockOf(d.plan, 'home-b4').data = []
  },
  'show one service fewer': (d) => {
    blockOf(d.plan, 'home-b4').data = ['service-seasonal-posy']
  },
  'swap the service a block shows': (d) => {
    blockOf(d.plan, 'home-b5').data = ['service-seasonal-posy']
    blockOf(d.plan, 'home-b5').lists[0].item = 'service-seasonal-posy'
  },
  'rename a page after a service': (d) => {
    d.plan.pages.find((p) => p.id === 'class').name = NEW_NAME
  },
  'change the logo': (d) => {
    d.plan.look.logo = { kind: 'text', text: 'LB' }
  }
}
