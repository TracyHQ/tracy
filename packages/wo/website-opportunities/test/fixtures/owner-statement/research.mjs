// An invented pottery studio, its collected texts and a scripted model answer, for the owner statement tests (D46).
// Every name, phone, post and review here is made up.

export const RESEARCH = Object.freeze({
  name: 'Corvane Clay Studio',
  trade: 'other',
  bio: '🏺 Pottery classes in Velmora\n🎨 Wheel & Handbuilding\n📞 +000 10 000 0000',
  posts: [
    {
      source: 'instagram',
      id: 'c1',
      url: 'https://www.instagram.com/p/c1/',
      caption: 'Join our glazing workshops this month!\nFor all ages & levels\nDM us to book a seat.'
    },
    {
      source: 'instagram',
      id: 'c2',
      url: 'https://www.instagram.com/p/c2/',
      caption: 'Kiln day. Fresh mugs out of the fire.'
    }
  ],
  reviews: [
    { author: 'Reviewer Q', text: 'Lovely wheel class with Ilsa, the studio is calm and bright.' },
    { author: 'Reviewer R', text: 'Ilsa explains every step, I left with two bowls I made myself.' }
  ],
  websitePages: [],
  googleTypes: [],
  categories: []
})

/** What the owner typed in the build chat: facts in long sentences, one naming a person kept off the site. */
export const OWNER_STATEMENT =
  'We have run the studio as a family since 2009. Every class is capped at six students so nobody waits for the wheel. ' +
  'Our second teacher Brannoch Vey leads the evening raku firings. We also rent kiln space to local makers.'

/** The person the owner asked to keep off the site, named in the statement. */
export const HELD_PERSON = 'Brannoch Vey'

/**
 * A scripted answer that reads the owner's statement as facts, in rewritten labels: none copies a run of four of its
 * words (`owner-echo.mjs`), each still rests on its quote (`ownerLabelGrounded`).
 */
export const ANSWER_READING_OWNER = Object.freeze({
  services: [
    { name: 'Glazing workshops', quote: 'Join our glazing workshops this month!', ref: 'post:instagram:c1' },
    { name: 'Kiln space rental', quote: 'We also rent kiln space to local makers.', ref: 'owner' }
  ],
  audience: [
    { label: 'all ages and levels', quote: 'For all ages & levels', ref: 'post:instagram:c1' },
    { label: 'local makers', quote: 'rent kiln space to local makers', ref: 'owner' }
  ],
  team: [{ name: 'Ilsa', role: 'teacher', quote: 'wheel class with Ilsa', ref: 'review:1' }],
  story: [
    { text: 'family studio since 2009', quote: 'run the studio as a family since 2009', ref: 'owner' },
    { text: 'Pottery classes in Velmora', quote: 'Pottery classes in Velmora', ref: 'bio' }
  ],
  serviceAreas: [],
  facts: [
    { text: 'six students per class at most', quote: 'Every class is capped at six students', ref: 'owner' }
  ],
  keyMessages: [
    {
      label: 'small classes of six',
      quotes: [{ quote: 'Every class is capped at six students', ref: 'owner' }]
    }
  ]
})

/** A scripted answer whose story label echoes one of the owner's sentences word for word. */
export const ANSWER_ECHOING_OWNER = Object.freeze({
  services: [],
  audience: [],
  team: [],
  story: [
    {
      text: 'Every class is capped at six students so nobody waits for the wheel',
      quote: 'Every class is capped at six students so nobody waits for the wheel.',
      ref: 'owner'
    },
    { text: 'family studio since 2009', quote: 'run the studio as a family since 2009', ref: 'owner' }
  ],
  serviceAreas: [],
  facts: []
})

/** The coaching business of `domain-business-reading.test.mjs` and its answer, as a second baseline input. */
export const COACHING = Object.freeze({
  name: 'Harbour Sport Club',
  trade: 'fitness',
  bio: '🙋 European Coaching in Dubai📍\n🎾 Tennis & Padel \n🏊 Swimming Lessons\n📱 +971 50 000 0000',
  posts: [
    {
      source: 'instagram',
      id: 'p1',
      url: 'https://www.instagram.com/p/p1/',
      caption: 'Join our padel sessions in Dubai!\n📍Locations across Dubai\nFor all ages & levels'
    }
  ],
  reviews: [{ author: 'A. Reviewer', text: 'Great padel coaching with Alex and Sam, highly recommend.' }]
})

export const COACHING_ANSWER = Object.freeze({
  services: [
    { name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: 'post:instagram:p1' }
  ],
  audience: [{ label: 'all ages and levels', quote: 'For all ages & levels', ref: 'post:instagram:p1' }],
  team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }],
  story: [{ text: 'European coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  serviceAreas: [
    { text: 'Locations across Dubai', quote: 'Locations across Dubai', ref: 'post:instagram:p1' }
  ]
})
