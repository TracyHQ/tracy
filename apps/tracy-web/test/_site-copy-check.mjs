// Fixtures for the site copy check tests (ADR 0042): a tiny invented kit, plan and brief for the invented
// "Quay Fitness Studio", plus a copy file that passes every rule. Each rule test copies the copy, breaks one thing
// and checks that only the rule under test notices.
import assert from 'node:assert/strict'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'

const text = (id, role, max, sample, paragraphs = 1, extra = {}) => ({
  id,
  role,
  type: 'text',
  maxCharacters: max,
  sample,
  paragraphs,
  bullets: 0,
  ...extra
})

export function kit() {
  return {
    kit: 'tracy-template-kit/2 demo-gym/j6/1.0.0',
    template: { name: 'demo_gym', version: '1.0.0' },
    site: {
      nameSlots: [
        { kind: 'printed', where: 'document-title', block: null, sample: 'Demo Gym - Fitness Template' },
        { kind: 'printed', where: 'meta description', block: null, sample: 'Demo Gym is a template.' },
        { kind: 'printed', where: 'title-attribute', block: 'header', sample: 'Demo Gym' }
      ],
      // Footer column headings: group-footer-a has its title slot in the kit blocks (block-6.1), group-footer-b
      // points at a title slot the kit blocks do not list, so only its demo heading is known.
      navigationGroups: [
        { id: 'group-footer-a', titleSlot: 'block-6.1', heading: 'Useful links' },
        { id: 'group-footer-b', titleSlot: 'block-6.2', heading: 'Find out more' }
      ]
    },
    blocks: [
      {
        id: 'block-1',
        role: 'header',
        shared: true,
        slots: [text('block-1.1', 'editorial.button_label', 20, 'Join')],
        lists: []
      },
      {
        id: 'block-2',
        role: 'hero',
        slots: [
          text('block-2.1', 'editorial.paragraph', 40, 'Become the fittest version of yourself'),
          text(
            'block-2.2',
            'editorial.paragraph',
            200,
            'Join our friendly gym and train with coaches who care about every single member of the club.',
            3
          ),
          text('block-2.3', 'editorial.paragraph', 60, 'A short line the plan hides.')
        ],
        lists: []
      },
      {
        id: 'block-3',
        role: 'section',
        slots: [text('block-3.1', 'editorial.heading', 30, 'Words from our members')],
        lists: [
          {
            id: 'block-3.item',
            rowSlots: [
              text(
                'block-3.5',
                'editorial.paragraph',
                120,
                'This place changed how I train every week, I recommend it to all.'
              )
            ],
            rows: [
              {
                index: 0,
                slots: [
                  text(
                    'block-3.5',
                    'editorial.paragraph',
                    120,
                    'This place changed how I train every week, I recommend it to all.'
                  )
                ]
              },
              {
                index: 1,
                slots: [
                  text(
                    'block-3.6',
                    'editorial.paragraph',
                    120,
                    'Another long demo review sentence from the template sits right here.'
                  )
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'block-4',
        role: 'section',
        slots: [text('block-4.1', 'editorial.heading', 30, 'Our prices')],
        lists: []
      },
      {
        id: 'block-5',
        role: 'page-body',
        slots: [text('block-5.1', 'person.name', 30, 'Marta Quill')],
        lists: []
      },
      {
        id: 'block-6',
        role: 'footer',
        shared: true,
        slots: [text('block-6.1', 'editorial.heading', 25, 'Useful links')],
        lists: []
      }
    ]
  }
}

export function brief() {
  return {
    language: 'en',
    facts: [
      { id: 'f-name', field: 'name', value: 'Quay Fitness Studio', source: 'stated' },
      { id: 'f-hours', field: 'hours', value: 'Open 06:00 to 21:00, Monday to Saturday', source: 'stated' },
      { id: 'f-phone', field: 'phone', value: '+000 555 0100', source: 'stated' },
      { id: 'f-email', field: 'email', value: 'hello@quay-fitness.example', source: 'stated' },
      {
        id: 'f-address',
        field: 'address',
        value: '12 Harbour Row - Quay District - Example City',
        source: 'stated'
      },
      { id: 'f-coach', field: 'team', value: 'Nia Brook, strength coach', source: 'stated' },
      { id: 'f-review-1', field: 'review', value: 'review one', source: 'stated' }
    ],
    reviews: [
      { id: 'r1', text: 'The coaches know every member by name and the classes never feel crowded.' }
    ],
    missing: [{ field: 'price', withheld: [{ source: 'invented', values: ['free trial'] }] }]
  }
}

const picture = {
  frame: 'block-2.f1',
  kind: 'photo',
  match: 'any-real',
  size: 'wide',
  shows: 'a coach and a member'
}
const keep = (block, extra) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', ...extra })

export function plan() {
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 demo-gym/j6/1.0.0',
    brief: 'opp-quay-fitness',
    site: {
      language: 'en',
      voice: { summary: 'plain and friendly', ownWords: ['small group classes'], avoid: ['world-class'] },
      forbidden: [{ what: 'money back guarantee', why: 'not in the brief' }],
      legalPages: [
        {
          kind: 'privacy',
          use: 'create',
          id: 'legal:privacy',
          slug: 'privacy-policy',
          says: 'contact data use'
        }
      ],
      notFound: { says: 'page not found', leadsTo: ['page-home'] },
      footerMenu: [
        { group: 'group-footer-a', heading: { says: 'links about the classes', page: 'page-home' } },
        { group: 'group-footer-b', heading: { says: 'where to learn about the coach', page: 'page-about' } }
      ]
    },
    sharedBlocks: [
      keep('block-1', {
        copy: [{ slot: 'block-1.1', says: 'join button', text: 'Join us', basis: 'trade', maxCharacters: 20 }]
      })
    ],
    pages: [
      {
        id: 'page-home',
        decision: 'keep',
        blocks: [
          keep('block-2', {
            copy: [
              {
                slot: 'block-2.1',
                says: 'headline about coaches',
                factIds: ['f-name'],
                basis: 'brief',
                maxCharacters: 40
              },
              {
                slot: 'block-2.2',
                says: 'classes, hours, how to reserve',
                factIds: ['f-hours', 'f-phone'],
                basis: 'brief',
                maxCharacters: 200
              }
            ],
            pictures: [picture],
            hiddenSlots: [{ slot: 'block-2.3', why: 'nothing true to say' }]
          }),
          keep('block-3', {
            copy: [{ slot: 'block-3.1', says: 'members heading', basis: 'trade', maxCharacters: 30 }],
            lists: [
              {
                list: 'block-3.item',
                rows: 2,
                items: [
                  {
                    about: 'review one',
                    copy: [
                      {
                        slot: 'block-3.5',
                        says: 'quote a customer review',
                        factIds: ['f-review-1'],
                        basis: 'brief'
                      }
                    ],
                    pictures: []
                  },
                  {
                    about: 'review two',
                    copy: [
                      {
                        slot: 'block-3.6',
                        says: 'a member on early sessions',
                        factIds: ['f-hours'],
                        basis: 'brief'
                      }
                    ],
                    pictures: []
                  }
                ]
              }
            ]
          }),
          { block: 'block-4', seen: 'seen', decision: 'hide', why: 'no prices in the brief' }
        ]
      },
      {
        id: 'page-about',
        decision: 'keep',
        blocks: [
          keep('block-5', {
            copy: [{ slot: 'block-5.1', says: 'coach name', factIds: ['f-coach'], basis: 'brief' }]
          })
        ]
      },
      { id: 'page-old', decision: 'drop', why: 'not needed' }
    ]
  }
}

const sha = (c) => c.repeat(64)
const w = (slot, t, factIds = []) => ({ slot, owner: 'writer', text: t, factIds })

// The copy file that passes every rule.
export function copy() {
  return {
    version: 'site-copy/1',
    fingerprint: {
      kit: 'tracy-template-kit/2 demo-gym/j6/1.0.0',
      planSha256: sha('a'),
      briefSha256: sha('b'),
      promptSha256: sha('c')
    },
    slots: [
      { slot: 'block-1.1', owner: 'plan-label', text: 'Join us', factIds: [] },
      w('block-2.1', 'Train with a coach who knows you', ['f-name']),
      w(
        'block-2.2',
        'Small group classes run every day. Open 06:00 to 21:00, Monday to Saturday, call +000 555 0100 to reserve your place.',
        ['f-hours', 'f-phone']
      ),
      w('block-3.1', 'What members say'),
      w('block-3.5', '"The coaches know every member by name and the classes never feel crowded."', [
        'f-review-1'
      ]),
      w('block-3.6', 'Early sessions are the calm ones before the day starts.', ['f-hours']),
      w('block-5.1', 'Nia Brook', ['f-coach']),
      w('block-6.1', 'Our classes'),
      w('block-6.2', 'Meet the coach')
    ],
    alts: [{ frame: 'block-2.f1', text: 'A coach showing a member how to lift' }],
    seo: [
      {
        page: 'page-home',
        title: 'Quay Fitness Studio, group classes',
        description: 'Small group classes with coaches who know your name, open every day but Sunday.'
      },
      {
        page: 'page-about',
        title: 'Our coach at Quay Fitness Studio',
        description: 'Meet the strength coach who leads the sessions.'
      },
      {
        page: 'legal:privacy',
        title: 'Privacy policy of Quay Fitness Studio',
        description: 'How the studio uses the contact details you send us.'
      }
    ],
    pages: [
      {
        page: 'legal:privacy',
        title: 'Privacy policy',
        body: [
          'What we collect. When you book a class by phone or at the desk, we note your name and how to reach you.',
          'Photos and videos. We take pictures of members only with their consent, and of children only with a parent saying yes.',
          'Sharing. Your details are never sold or passed to third parties.',
          'How long we keep it. Your details stay with us while you train here and are removed once you stop.',
          'Your rights. You may ask to see, correct or delete what we hold about you at any time.',
          'Questions. To contact us about your details, call the studio or ask the coach at the desk.'
        ]
      },
      {
        page: 'notFound',
        title: 'Page not found',
        body: ['That address leads nowhere. Head back to the home page or ask a coach at the desk.']
      }
    ],
    notebook: [
      {
        page: 'page-home',
        points: ['coaches know members'],
        openings: ['Train with a coach'],
        calls: ['call to reserve'],
        phrases: ['small group classes']
      }
    ],
    returns: []
  }
}

export const check = (c) => checkCopy({ copy: c, plan: plan(), kit: kit(), brief: brief() })
export const failing = (c) =>
  check(c)
    .rules.filter((r) => r.status === 'fail')
    .map((r) => r.id)
export const ruleOf = (c, id) => check(c).rules.find((r) => r.id === id)

// Break one thing in the passing copy: the rule passes before, it is the only rule failing now, and one of its
// failures says why. Returns the rule's result on the broken copy.
export function breaks(id, mutate, detail) {
  assert.equal(ruleOf(copy(), id).status, 'pass', `${id} passes on the base copy`)
  const c = copy()
  mutate(c)
  assert.deepEqual(failing(c), [id])
  const r = ruleOf(c, id)
  assert.ok(
    r.failures.some((f) => detail.test(f.detail)),
    r.failures.map((f) => f.detail).join('\n')
  )
  return r
}
export const slotOf = (c, id) => c.slots.find((s) => s.slot === id)
