// An invented template ("Harborline") with an invented demo company, and an invented customer, for the demo scan tests
// (ticket #585). Every business, address, phone number and sentence here is made up.
import { createHash } from 'node:crypto'
import { textKey } from '../../../../apps/tracy-web/src/site-check/demo-baseline.js'

export const DEMO = {
  sentence: 'Glide across the still water at first light.',
  long: 'Our coaches have guided rowers of every age since the harbour first opened its boathouse doors.',
  baselineOnly: 'Morning sessions start at the north pier',
  shortBaseline: 'Our fleet',
  memberLine: 'Become a member of the club today',
  phone: '(555) 010-4477',
  email: 'hello@quillmere.example',
  company: 'Quillmere Rowing Club',
  picture: 'images/demo/regatta-crew.jpg',
  baselinePicture: 'images/demo/boathouse.jpg',
  designStore: 'images/design/wave-pattern.png',
  designLine: 'images/design/foam-edge.png'
}
export const PICTURE_BYTES = 'invented picture bytes'
export const PICTURE_SHA = createHash('sha256').update(PICTURE_BYTES).digest('hex')

export const kit = () => ({
  blockStore: {
    blocks: [
      {
        id: 'hero',
        fields: [
          { name: 'heading', type: 'text', slot: 'module-20.0' },
          { name: 'design-wave', type: 'design', slot: 'module-20.5' }
        ]
      }
    ]
  },
  mapping: {
    blocks: { hero: { fields: {}, designLines: [{ slot: 'module-20.6', entity: 'module-20' }] } },
    overrides: { language: [{ key: 'TPL_SEND', slot: 'languageString-1.0', keep: 'kept: a form button' }] }
  },
  contentMap: {
    slots: [
      { key: 'module-30.0', type: 'text', sample: 'Read more' },
      { key: 'module-30.1', type: 'text', sample: 'Follow us on every channel we use' },
      { key: 'languageString-1.0', type: 'text', sample: 'Send message' }
    ]
  },
  demoRoutes: ['demo-regatta']
})

export const demoContentMap = () => ({
  slots: [
    { key: 'module-20.0', type: 'text', sample: DEMO.sentence },
    { key: 'module-20.1', type: 'text', sample: DEMO.long },
    {
      key: 'module-20.2',
      type: 'image',
      sample: `${DEMO.picture}#joomlaImage://local-images/x.jpg?width=10`
    },
    { key: 'module-20.5', type: 'image', sample: DEMO.designStore },
    { key: 'module-20.6', type: 'image', sample: DEMO.designLine },
    { key: 'module-21.0', type: 'text', role: 'contact.phone', sample: DEMO.phone },
    { key: 'module-21.1', type: 'text', role: 'contact.email', sample: DEMO.email },
    {
      key: 'module-21.2',
      type: 'text',
      role: 'contact.address',
      sample: '12 Larkspur Quay((br/))Port Emberly'
    },
    { key: 'module-21.3', type: 'text', sample: 'Read more' },
    { key: 'module-22.0', type: 'text', sample: DEMO.memberLine }
  ]
})

export const demoBaseline = () => ({
  schema: 'demo-baseline/1',
  texts: [textKey(DEMO.baselineOnly), textKey(DEMO.shortBaseline)],
  labels: [],
  maps: [],
  pictures: { files: [DEMO.baselinePicture, DEMO.designLine], shas: [PICTURE_SHA] }
})

/** The corpus input of the invented template, every source given. */
export const corpusInput = () => ({
  kit: kit(),
  demoBaseline: demoBaseline(),
  contentMap: demoContentMap(),
  companyNames: [DEMO.company, 'Quillmere'],
  interfaceTexts: [DEMO.memberLine]
})

const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

/** An untouched demo site: the template as it ships. */
export const demoPages = () => [
  {
    path: '/',
    url: '/',
    status: 200,
    html: page(
      `<nav class="mainmenu"><a href="/">Home</a><a href="/demo-regatta">Regatta</a></nav>
       <h1>${DEMO.sentence}</h1><p>${DEMO.long}</p><div class="intro">${DEMO.baselineOnly}</div>
       <img src="/${DEMO.picture}" alt="Crew of the ${DEMO.company}">
       <div hidden style="display:none"><p>${DEMO.sentence}</p></div>
       <section style="background-image: url('/${DEMO.baselinePicture}')"></section>
       <address>12 Larkspur Quay<br>Port Emberly</address>
       <p>Call ${DEMO.phone}</p><a href="mailto:${DEMO.email}">Write to us</a>`,
      `<title>${DEMO.company}</title><meta name="description" content="${DEMO.long}">
       <meta property="og:image" content="https://site.invalid/${DEMO.picture}">`
    )
  }
]

/** The same site emptied and written for an invented customer: interface words and design pictures only remain. */
export const emptiedPages = () => [
  {
    path: '/',
    url: '/',
    status: 200,
    html: page(
      `<nav class="mainmenu"><a href="/">Home</a><a href="/lessons">Lessons</a></nav>
       <h1>Paddle boards for calm mornings at Brightfen Lake</h1>
       <p>Brightfen Paddle Studio rents boards and teaches beginners every weekend.</p>
       <p>Glide across the lake with a friend.</p><a class="btn">Read more</a><p>Follow us on every channel we use</p>
       <p>${DEMO.memberLine}</p><button value="Send message">Send message</button>
       <img src="/${DEMO.designStore}" alt=""><div style="background:url(/${DEMO.designLine})"></div>
       <img src="/images/brightfen/boards.jpg" alt="Boards on the shore"><p>Call 555 010 9999</p>
       <p>Our fleet</p>`,
      '<title>Brightfen Paddle Studio</title><meta name="description" content="Paddle board lessons and rentals.">'
    )
  }
]
