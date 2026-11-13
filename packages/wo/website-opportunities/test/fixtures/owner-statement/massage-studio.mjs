// An invented massage studio whose owner typed eleven facts in the build chat, and a scripted answer that reads every
// one of them, most in the owner's own words (the reviewer's false positive case of D46, #609). Every name, place and
// address here is made up.

export const MASSAGE_BIO = 'Massage therapy in Velmora'

export const MASSAGE_STATEMENT =
  'We are open seven days a week from 7am. Free delivery on orders over 30 dollars within Velmora. Find us at 12 ' +
  'Harbour Road, Velmora. Our signature service is deep tissue sports massage. Our tagline is Strong Hands Calm ' +
  'Minds. Mira Solent is our head therapist and founder since 2011. We serve office workers and weekend runners in ' +
  'North Velmora and South Velmora.'

/** Eleven legitimate items: services, the audience, a team member, the tagline, places, hours, the address, themes. */
export const MASSAGE_ANSWER = Object.freeze({
  services: [
    {
      name: 'Deep tissue sports massage',
      quote: 'Our signature service is deep tissue sports massage',
      ref: 'owner'
    },
    {
      name: 'Free local delivery over 30 dollars',
      quote: 'Free delivery on orders over 30 dollars within Velmora',
      ref: 'owner'
    },
    { name: 'Massage therapy', quote: 'Massage therapy in Velmora', ref: 'bio' }
  ],
  audience: [
    {
      label: 'office workers and weekend runners',
      quote: 'We serve office workers and weekend runners',
      ref: 'owner'
    }
  ],
  team: [
    {
      name: 'Mira Solent',
      role: 'head therapist and founder since 2011',
      quote: 'Mira Solent is our head therapist and founder since 2011',
      ref: 'owner'
    }
  ],
  story: [{ text: 'Strong Hands Calm Minds', quote: 'Our tagline is Strong Hands Calm Minds', ref: 'owner' }],
  serviceAreas: [
    { text: 'North Velmora and South Velmora', quote: 'in North Velmora and South Velmora', ref: 'owner' }
  ],
  facts: [
    { text: 'open seven days a week', quote: 'We are open seven days a week from 7am', ref: 'owner' },
    { text: '12 Harbour Road, Velmora', quote: 'Find us at 12 Harbour Road, Velmora', ref: 'owner' }
  ],
  keyMessages: [
    {
      label: 'open seven days a week',
      quotes: [{ quote: 'We are open seven days a week from 7am', ref: 'owner' }]
    }
  ],
  uspThemes: [
    {
      label: 'Strong Hands Calm Minds',
      line: 'Strong hands, calm minds',
      who: 'office workers and weekend runners',
      quotes: [{ quote: 'Our tagline is Strong Hands Calm Minds', ref: 'owner' }]
    }
  ]
})
