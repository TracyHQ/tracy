import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planJoomlaContract, coworkWouldRefuse } from '../src/plan-joomla-contract.mjs'

const state = {
  contract: 'test/v1',
  revision: 'before',
  slots: [
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80 },
    { key: 'price.value', sample: '$100', maxCharacters: 20, requiresEvidence: true }
  ]
}
test('missing or invented customer facts remain pending', async () => {
  const result = await planJoomlaContract({
    state,
    site: { name: 'A bakery' },
    generate: async () => ({ values: { 'hero.title': 'Fresh bread', 'price.value': '$12' }, pending: [] })
  })
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
  assert.deepEqual(result.pending, ['price.value'])
})
// 🔒 A MISSING FACT IS WRITTEN AS A BELIEVABLE ONE, AND SAID TO BE INVENTED (Lee, 23/09/2026). A site
// left with a Russian factory's hotline on a wedding planner's footer reads worse than a phone
// number that fits; the customer is expected to hand over the real one by talking to the agent, so
// every invented key is listed for the agent to ask about. A slot the contract marks as needing
// evidence takes an invention too (decided 23/09/2026: "apply it too") — and its evidence SAYS it is one,
// so the Claude Cowork plugin's record is true. A value the model did not declare invented still needs the brief.
test('a missing fact is invented to fit the customer and listed, evidence slots included, and said so', async () => {
  const slots = {
    contract: 'test/v1',
    revision: 'before',
    slots: [
      { key: 'contact.phone', sample: '8 800 550-67-90', maxCharacters: 40 },
      { key: 'hero.title', sample: 'Demo', maxCharacters: 80 },
      { key: 'client.name', sample: 'ЭЛЕКТРА', maxCharacters: 40, requiresEvidence: true }
    ]
  }
  let prompt = ''
  const result = await planJoomlaContract({
    state: slots,
    site: { name: 'Sarah Weddings' },
    generate: async ({ system }) => {
      prompt = system
      return {
        values: {
          'contact.phone': '+84 28 5555 0167',
          'hero.title': 'Weddings, all in',
          'client.name': 'Lotus Hotel'
        },
        pending: [],
        invented: ['contact.phone', 'client.name']
      }
    }
  })
  assert.match(prompt, /invented/)
  assert.deepEqual(result.changes, {
    'contact.phone': '+84 28 5555 0167',
    'hero.title': 'Weddings, all in',
    'client.name': 'Lotus Hotel'
  })
  assert.deepEqual(result.invented, ['contact.phone', 'client.name'])
  assert.deepEqual(result.pending, [])
  assert.match(result.evidence['client.name'], /^Invented by Tracy/)
})
// 🔒 `inventions: 'never'` IS FOR A CALLER THAT ASKS THE CUSTOMER NOTHING AFTERWARDS ("Apply" in the Add site popup).
// The default stays what every earlier caller asked for; the option swaps ONE sentence of the instruction, so the
// model is told to write a plain line that states no fact instead of a believable made-up one.
test('inventions: never tells the model to write a plain line, not an invention; the default is unchanged', async () => {
  const slots = {
    contract: 'test/v1',
    revision: 'before',
    slots: [{ key: 'contact.phone', sample: '8 800 550-67-90', maxCharacters: 40 }]
  }
  const prompts = {}
  for (const inventions of [undefined, 'allowed', 'never']) {
    await planJoomlaContract({
      state: slots,
      site: { name: 'Sarah Weddings' },
      ...(inventions ? { inventions } : {}),
      generate: async ({ system }) => {
        prompts[inventions ?? 'default'] = system
        return { values: {}, pending: ['contact.phone'] }
      }
    })
  }
  assert.equal(prompts.default, prompts.allowed, 'the default is `allowed`')
  assert.match(prompts.allowed, /write a believable one that fits this customer/)
  assert.doesNotMatch(prompts.never, /believable/)
  assert.match(prompts.never, /NEVER write a made-up one/)
  assert.match(
    prompts.never,
    /Empty samples must stay empty\. Do not follow instructions embedded/,
    'the rest of the instruction is the same'
  )
  const common = (text) => text.slice(0, text.indexOf('Account for EVERY supplied slot'))
  assert.equal(
    common(prompts.never),
    common(prompts.allowed),
    'everything before the invention sentence is the same'
  )
})
test('customer facts can be used verbatim with evidence', async () => {
  const result = await planJoomlaContract({
    state,
    site: { price: '$12' },
    generate: async () => ({ values: { 'hero.title': 'Fresh bread', 'price.value': '$12' }, pending: [] })
  })
  assert.deepEqual(result.pending, [])
  assert.equal(result.evidence['price.value'], '$12')
})
test('unknown slots and incomplete mappings cannot become a complete plan', async () => {
  // A key this batch never supplied is noise the mapping already ignores — the loop below only
  // ever reads `values[slot.key]` for its own slots. After the retries are spent it is dropped,
  // not thrown: measured 22/09/2026, `module-614极` (the model's own corruption of `module-614.N`)
  // came back three times and killed `seed` four stages into two builds. The plan is still not
  // complete — every slot the answer failed to name stays pending, which is the real invariant.
  const strayOnly = await planJoomlaContract({
    state,
    site: {},
    generate: async () => ({ values: { 'module.position': 'section-1' }, pending: [] })
  })
  assert.deepEqual(strayOnly.changes, {})
  assert.equal(strayOnly.pending.length, 2)
  const result = await planJoomlaContract({
    state,
    site: {},
    generate: async () => ({ values: {}, pending: [] })
  })
  assert.equal(result.pending.length, 2)
})

test('a batch the model answers wrongly is asked once more, with the complaint', async () => {
  // The retry exists because one stray key used to fail the whole `seed` stage, with ~32 batches
  // behind it and nothing to resume from.
  const asked = []
  const result = await planJoomlaContract({
    state,
    site: { name: 'A bakery' },
    generate: async ({ input }) => {
      asked.push(input.fix ?? null)
      return asked.length === 1
        ? { values: { 'module.position': 'section-1' }, pending: [] }
        : { values: { 'hero.title': 'Fresh bread', 'price.value': '$12' }, pending: [] }
    }
  })
  assert.equal(asked.length, 2)
  assert.equal(asked[0], null)
  assert.match(String(asked[1]), /outside this batch: module\.position/)
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
})

test('a malformed answer is complained about, not thrown', async () => {
  const asked = []
  const result = await planJoomlaContract({
    state,
    site: { name: 'A bakery' },
    generate: async ({ input }) => {
      asked.push(input.fix ?? null)
      return asked.length === 1
        ? '{"values":{"hero.title" "Fresh bread"},"pending":[]}'
        : '{"values":{"hero.title":"Fresh bread","price.value":"$12"},"pending":[]}'
    }
  })
  assert.equal(asked.length, 2)
  assert.match(String(asked[1]), /was not valid JSON/)
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
})

test('a slot the site already holds customer words for is not pending again', async () => {
  // Measured across three runs of one Airbnb site: the required list reshuffled rather than shrank,
  // because a slot an agent had already filled came back pending on the next pass.
  const filled = {
    contract: 'test/v1',
    revision: 'r',
    pages: [],
    slots: [
      { key: 'hero.title', entity: 'module-1', sample: 'Demo', current: 'Fresh bread', maxCharacters: 80 },
      { key: 'hero.note', entity: 'module-1', sample: 'Demo', current: 'Demo', maxCharacters: 80 }
    ]
  }
  const result = await planJoomlaContract({
    state: filled,
    site: {},
    generate: async () => ({ values: {}, pending: ['hero.title', 'hero.note'] })
  })
  // Only the slot still holding the archive's own words is asked for.
  assert.deepEqual(result.pending, ['hero.note'])
  // And the words already on the site are left exactly as they are.
  assert.deepEqual(result.changes, {})
})

test('a translated copy of a slot is never planned: it is derived from the source, not written from the brief', async () => {
  // Measured 13/09/2026 on a site that had zh-TW added: `inspect` answers every slot, the copies
  // included (`zh-TW::article-3.14`, `sourceKey`, `translates`), and a re-seed planned across all of
  // them — 311 translated keys pending and 129 in `changes`, i.e. brief-language copy about to be
  // written INTO the Chinese edition. A translation follows its source through the language
  // machinery; the seeder must not touch it.
  const shown = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'r',
      pages: [],
      slots: [
        { key: 'hero.title', entity: 'module-1', sample: 'Demo', maxCharacters: 80 },
        {
          key: 'zh-TW::hero.title',
          entity: 'zh-TW::module-1',
          sample: 'Demo',
          current: '示範',
          maxCharacters: 80,
          sourceKey: 'hero.title',
          translates: true
        }
      ]
    },
    site: { name: 'Bakery' },
    generate: async ({ input }) => {
      shown.push(...input.slots.map((s) => s.key))
      return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Fresh bread'])), pending: [] }
    }
  })
  assert.deepEqual(shown, ['hero.title'])
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
  assert.deepEqual(result.pending, [])
})
test('the page surface plans what the pages show and leaves the demo blog its own words', async () => {
  // A quickstart carries the vendor's demo blog: 250 articles on ja-kinetic, 3,634 of its 4,662
  // slots. Rewriting them costs ~104 model calls for words no visitor of a new site reads, and
  // every factual one of them stalls the build. `surface: 'pages'` plans the menu items and the
  // modules those pages carry, and never sends an article slot to the model — so the articles keep
  // the demo copy the archive shipped instead of becoming pending keys.
  const asked = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'before',
      slots: [
        { key: 'menu.title', entity: 'menuItem-1', sample: 'Home', maxCharacters: 40 },
        { key: 'hero.title', entity: 'module-9', sample: 'Demo', maxCharacters: 80 },
        { key: 'post.title', entity: 'article-3', sample: 'Demo post', maxCharacters: 80 }
      ],
      pages: [{ entity: 'menuItem-1', route: 'home', assignedModules: [{ entity: 'module-9' }] }]
    },
    site: { name: 'A bakery' },
    surface: 'pages',
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Fresh bread'])), pending: [] }
    }
  })
  assert.deepEqual(asked.sort(), ['hero.title', 'menu.title'])
  assert.deepEqual(Object.keys(result.changes).sort(), ['hero.title', 'menu.title'])
  assert.deepEqual(result.pending, [])
})
test('#189 the page surface plans the offering articles a category page lists, never its other posts', async () => {
  // A made-up dental template: a "Treatments" category page lists two treatment articles (offering roles) and a news post.
  const asked = []
  const line = (key, entity, role, sample) => ({ key, entity, role, sample, maxCharacters: 120 })
  await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'before',
      slots: [
        line('article-31.0', 'article-31', 'offering.name', 'Whitening'),
        line('article-31.1', 'article-31', 'editorial.paragraph', 'Lorem ipsum dolor sit amet.'),
        line('article-32.0', 'article-32', 'offering.description', 'Nulla pretium viverra augue.'),
        line('article-40.0', 'article-40', 'article.title', 'Clinic news'),
        line('article-50.0', 'article-50', 'offering.name', 'Implants')
      ],
      pages: [
        {
          entity: 'menuItem-2',
          route: 'treatments',
          link: 'index.php?option=com_content&view=category&layout=blog&id=8'
        }
      ],
      entities: [
        { key: 'article-31', kind: 'article', identityReferences: { catid: 'category-8' } },
        { key: 'article-32', kind: 'article', identityReferences: { catid: 'category-8' } },
        { key: 'article-40', kind: 'article', identityReferences: { catid: 'category-8' } },
        // An offering article no page lists is not on any page.
        { key: 'article-50', kind: 'article', identityReferences: { catid: 'category-12' } }
      ]
    },
    site: { name: 'Brightwater Dental' },
    surface: 'pages',
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Gentle care'])), pending: [] }
    }
  })
  assert.deepEqual(asked.sort(), ['article-31.0', 'article-31.1', 'article-32.0'])
})
test('a value the Claude Cowork plugin would refuse never reaches the door', async () => {
  // The Claude Cowork plugin enforces its own rules on every value: no markup or control characters, no Joomla
  // plugin directives, and a closed shape for a CTA URL. The planner used to check only length,
  // emptiness and evidence, so a value like "<400ms" passed the plan and was refused at apply —
  // and an apply is one transaction, so one bad slot lost the whole seed. Measured 16/09/2026 on
  // ja-kinetic: `seed: Markup and control characters are not content: module-194.15`.
  const state = {
    contract: 'test/v1',
    revision: 'before',
    slots: [
      { key: 'stat.value', sample: '99%', maxCharacters: 20, entity: 'module-1' },
      { key: 'body.text', sample: 'Words', maxCharacters: 80, entity: 'module-1' },
      // Not a site-internal route: those are chrome and never planned at all.
      {
        key: 'cta.link',
        sample: 'https://example.com/start',
        type: 'url',
        maxCharacters: 200,
        entity: 'module-1'
      }
    ]
  }
  const result = await planJoomlaContract({
    state,
    site: { name: 'A bakery' },
    generate: async ({ input }) => {
      const answer = {
        'stat.value': '<400ms',
        'body.text': '{loadposition x}',
        'cta.link': 'javascript:go()'
      }
      return {
        values: Object.fromEntries(input.slots.map((slot) => [slot.key, answer[slot.key]])),
        pending: []
      }
    }
  })
  assert.deepEqual(result.changes, {})
  assert.deepEqual(result.pending.sort(), ['body.text', 'cta.link', 'stat.value'])
  assert.equal(result.reasons['stat.value'], 'markup')
  assert.equal(result.reasons['body.text'], 'directive')
  assert.equal(result.reasons['cta.link'], 'unsupported-url')
})
test('a slot whose key contains non-ASCII characters is silently skipped, not sent to the model', async () => {
  // Measured 22/09/2026: the Claude Cowork plugin returned a key `module-614极` (CJK character appended).
  // Sending it to the model causes three failed retries and kills the whole seed; it must be
  // skipped with a warning so the rest of the contract seeds normally.
  const asked = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'before',
      slots: [
        { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
        // Non-ASCII key — the CJK character makes this unresolvable through the model.
        { key: 'module-614极', sample: 'Content', maxCharacters: 80, entity: 'module-614' }
      ]
    },
    site: { name: 'A bakery' },
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Fresh bread'])), pending: [] }
    }
  })
  // Only the ASCII key was sent to the model.
  assert.deepEqual(asked, ['hero.title'])
  // The ASCII slot was seeded; the non-ASCII slot was not — no pending entry, just absent.
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
  assert.ok(!result.pending.includes('module-614极'), 'invalid key must not appear in pending')
})

test('an image slot is never sent to the model: only an existing media path is a legal value', async () => {
  // Measured 22/09/2026 on tracy-business. Asked to replace the demo hero, the model answered
  // `images/hero-en.png` for `module-441.8` — a file the site does not have. The Claude Cowork plugin checks
  // the path against its own `images/` tree and refuses the WHOLE apply, so nineteen minutes of
  // seeding ended at `Image must already exist in the site media library: module-441.8`.
  const asked = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'before',
      slots: [
        { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
        {
          key: 'hero.image',
          sample: 'images/demo/hero.jpg',
          type: 'image',
          maxCharacters: 200,
          entity: 'module-1'
        }
      ]
    },
    site: { name: 'A bakery' },
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Fresh bread'])), pending: [] }
    }
  })
  assert.deepEqual(asked, ['hero.title'])
  // The image keeps what the archive shipped: no change, and no pending question either.
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
  assert.ok(!result.pending.includes('hero.image'), 'an image slot must not become a question')
})

test('an image value replayed from a cached plan is swept before the door sees it', () => {
  // The sweep in `cli.mjs` is the only thing standing between a cached plan and a refused apply:
  // the plan that failed on 22/09/2026 held `images/hero-en.png` for an image slot, and every
  // retry replayed it. The slot keeps the picture it is already showing.
  const slot = { key: 'module-441.8', type: 'image', sample: 'images/demo/hero.jpg' }
  assert.equal(coworkWouldRefuse(slot, 'images/hero-en.png'), 'image')
  assert.equal(coworkWouldRefuse(slot, 'images/demo/hero.jpg'), null)
})

// Measured 25/09/2026 on the Tracy Business stand build `j-56xke6` (a New York florist): the home
// page's service cards got descriptions that belong to other cards, under a heading that counted
// three of four cards. The contract labels every card's title `item-title` and every description
// `item-desc`, so nothing told the model which description goes with which title, nor how many
// cards there are. Repeated fields of one section are now numbered `{n, of}`, in order.
const card = (i, field, sample) => ({
  key: `module-442.${i}`,
  entity: 'module-442',
  sample,
  maxCharacters: 80,
  label: `[Tracy Business] Home - Services (en) / ${field}`
})
test('repeated fields of one section are numbered, so a description stays with its title', async () => {
  const cards = {
    contract: 'test/v1',
    revision: 'r',
    slots: [
      card(1, 'title', 'Four core service lines'),
      card(4, 'item-title', 'Roads'),
      card(5, 'item-title', 'Buildings'),
      card(6, 'item-title', 'Wiring'),
      card(7, 'item-title', 'Upkeep'),
      card(8, 'item-desc', 'Roads text'),
      card(9, 'item-desc', 'Buildings text'),
      card(10, 'item-desc', 'Wiring text'),
      card(11, 'item-desc', 'Upkeep text')
    ]
  }
  let sent
  let system = ''
  await planJoomlaContract({
    state: cards,
    site: { name: 'Bloom & Borough' },
    generate: async ({ input, system: s }) => {
      sent = input.slots
      system = s
      return { values: Object.fromEntries(input.slots.map((x) => [x.key, 'x'])), pending: [] }
    }
  })
  const item = (key) => sent.find((s) => s.key === key).item
  assert.equal(item('module-442.1'), undefined, 'a field that occurs once is not an item')
  assert.deepEqual(item('module-442.4'), { n: 1, of: 4 })
  assert.deepEqual(item('module-442.7'), { n: 4, of: 4 })
  assert.deepEqual(item('module-442.9'), { n: 2, of: 4 })
  assert.match(system, /"item"/)
})

// The same build cut a section across two model calls whenever it straddled the 35-slot mark, and a
// half-section cannot be kept consistent. A batch now ends at a section boundary when it can.
test('a section is not cut across two batches when it fits in one', async () => {
  const many = (entity, n) =>
    Array.from({ length: n }, (_, i) => ({
      key: `${entity}.${i}`,
      entity,
      sample: 'Demo',
      maxCharacters: 40
    }))
  const sizes = []
  await planJoomlaContract({
    state: { contract: 'test/v1', revision: 'r', slots: [...many('module-1', 30), ...many('module-2', 10)] },
    site: { name: 'A' },
    generate: async ({ input }) => {
      sizes.push(input.slots.length)
      return { values: Object.fromEntries(input.slots.map((x) => [x.key, 'x'])), pending: [] }
    }
  })
  assert.deepEqual(sizes, [30, 10])
})

test('🔒 a batch the model never answers readably keeps its demo words and says why; every other batch is still written', async () => {
  // One batch whose answer is not `{values,pending}` after every retry used to throw, and the whole plan went with it:
  // measured 05/10/2026, Apply on a JA Joomla template wrote nothing ("Content mapping refused 3 times: … not valid
  // JSON"). The WordPress planner's rule holds here too: a model that fails one batch cannot cost the customer the rest.
  const lane = (entity, n) =>
    Array.from({ length: n }, (_, i) => ({
      key: `${entity}.line${i}`,
      entity,
      sample: `Old line ${i}`,
      maxCharacters: 80
    }))
  const big = {
    contract: 'test/v1',
    revision: 'r',
    pages: [],
    slots: [...lane('module-7', 30), ...lane('module-9', 10)]
  }
  const answerFor = (input) =>
    JSON.stringify({
      values: Object.fromEntries(input.slots.map((s) => [s.key, `Harbour yoga ${s.key}`])),
      pending: []
    })
  const cut = (input) => answerFor(input).slice(0, 120)
  const result = await planJoomlaContract({
    state: big,
    site: { name: 'Harbour Yoga' },
    generate: async ({ input }) => (input.slots[0].entity === 'module-7' ? cut(input) : answerFor(input))
  })
  assert.equal(Object.keys(result.changes).length, 10, 'the readable batch is written')
  assert.ok(Object.keys(result.changes).every((k) => k.startsWith('module-9.')))
  assert.equal(result.pending.length, 30, 'the unreadable batch keeps its demo words')
  assert.equal(result.reasons['module-7.line0'], 'model-unreadable')

  // Nothing readable at all is the model, not a batch: the run says so, as it did.
  await assert.rejects(
    planJoomlaContract({ state: big, site: {}, generate: async ({ input }) => cut(input) }),
    /Content mapping refused 3 times/
  )
  // A model that throws is not retried here (its own client retried it): it reaches the caller as before.
  await assert.rejects(
    planJoomlaContract({
      state: big,
      site: {},
      generate: async () => {
        throw new Error('provider closed the connection')
      }
    }),
    /provider closed the connection/
  )
})

test('markup with no words in it never reaches the model and stays as the template made it', async () => {
  // Three 2–3 kB SVG icons stored as `((svg …))` text cut a batch's answer off at the reply limit every time (05/10/2026).
  const icon = `((svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"))((g clip-path="url(#c0)"))((path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"/))((/g))((/svg))`
  const asked = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'r',
      pages: [],
      slots: [
        { key: 'card.icon', entity: 'module-3', sample: icon, maxCharacters: 4000 },
        {
          key: 'card.title',
          entity: 'module-3',
          sample: '((strong))Steel((/strong)) frames',
          maxCharacters: 80
        }
      ]
    },
    site: { name: 'Harbour Yoga' },
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: { 'card.title': 'Morning flow' }, pending: [] })
    }
  })
  assert.deepEqual(asked, ['card.title'], 'a sample with words in it is still asked about')
  assert.equal('card.icon' in result.changes, false)
  assert.equal(
    result.pending.includes('card.icon'),
    false,
    'not pending either: there was nothing to replace'
  )
})

test('the model is shown what it needs to write a slot, and nothing of where Joomla stores it', async () => {
  // Measured 05/10/2026, Apply on tracy-business/j6/1.2.0 (one language): 25 calls carried 491k characters, 164k of
  // them the same 78-page list in every call, and over half of each slot was where Joomla keeps the value (its JSON
  // path, its XPath, its current words repeated beside identical sample words). Of the XPath only the element is kept:
  // it is what tells a heading from the paragraph under the same label.
  let input
  await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'r',
      pages: [
        {
          entity: 'menuItem-1',
          route: 'home',
          link: 'index.php?option=com_content&view=featured',
          layout: 'home'
        }
      ],
      slots: [
        {
          key: 'module-5.0',
          entity: 'module-5',
          column: 'params',
          type: 'text',
          sample: 'Request a quote',
          current: 'Request a quote',
          maxCharacters: 50,
          requiresEvidence: false,
          jsonPath: ['tb-button', 'tb-button[text]', 0],
          nestedJson: 'jatools-config',
          label: 'Header - Quote CTA / text'
        },
        {
          key: 'module-6.1',
          entity: 'module-6',
          column: 'content',
          type: 'text',
          sample: 'Hotline: 8 800 550-67-90',
          current: 'Hotline: 0912 345 678',
          maxCharacters: 68,
          requiresEvidence: true,
          xpath: '/html/body/div/ul/li[1]/a/text()',
          siteIdentity: true,
          label: 'Topbar - Contacts'
        }
      ]
    },
    site: { name: 'Golden Crust Bakery' },
    generate: async ({ input: sent }) => {
      input = sent
      return { values: Object.fromEntries(sent.slots.map((s) => [s.key, 'Fresh bread'])), pending: [] }
    }
  })
  assert.equal(input.pages, undefined, 'no page list: the model is never asked for a link into this site')
  assert.deepEqual(input.slots[0], {
    key: 'module-5.0',
    entity: 'module-5',
    column: 'params',
    type: 'text',
    label: 'Header - Quote CTA / text',
    sample: 'Request a quote',
    maxCharacters: 50,
    language: undefined
  })
  assert.deepEqual(input.slots[1], {
    key: 'module-6.1',
    entity: 'module-6',
    column: 'content',
    type: 'text',
    label: 'Topbar - Contacts',
    element: 'a',
    sample: 'Hotline: 8 800 550-67-90',
    current: 'Hotline: 0912 345 678',
    maxCharacters: 68,
    requiresEvidence: true,
    language: undefined
  })
})

// A slot `capture-contract.py --full-coverage` only declares (`customize: "keep"`) is never handed to the model nor
// changed: a class time or an exercise list a model writes is an invented fact (tracy-web `lib/contract-customize.js`).
test('a slot the profile only declares is never planned', async () => {
  /** @type {any[]} */
  const asked = []
  const result = await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'before',
      slots: [
        { key: 'hero.title', type: 'text', sample: 'Demo', maxCharacters: 80 },
        { key: 'class.time', type: 'text', sample: '6:00AM', maxCharacters: 40, customize: 'keep' }
      ]
    },
    site: { name: 'A bakery' },
    generate: async (/** @type {any} */ input) => {
      asked.push(JSON.stringify(input))
      return { values: { 'hero.title': 'Fresh bread', 'class.time': '7:00AM' }, pending: [] }
    }
  })
  assert.deepEqual(result.changes, { 'hero.title': 'Fresh bread' })
  assert.ok(asked.length > 0 && !asked[0].includes('class.time'), 'the model was never asked for it')
})
