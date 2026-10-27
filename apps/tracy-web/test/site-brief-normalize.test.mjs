/**
 * What the popup's answers mean for a site: the name, the languages (the customer's, or one default), the
 * tone, the pictures. The model is a double; what a real one reads out of real text is measured, not asserted.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cleanLanguages,
  GOAL_SENTENCE,
  languagesByRule,
  MAX_LANGUAGES,
  nameFromLabel,
  normalizeBrief,
  socialLinksIn,
  STYLE_TONE
} from '../src/sites/brief-normalize.js'

const modelSaying = (object) => ({
  chat: async () => (typeof object === 'string' ? object : JSON.stringify(object))
})
const broken = {
  chat: async () => {
    throw new Error('the model answered 503')
  }
}
const brief = (about, over = {}) => ({ about, goal: null, style: null, ...over })

test('a name the text states is the name; the address is the name when it does not', async () => {
  const text = 'Golden Crust Bakery is a family bakery in Hanoi'
  const stated = await normalizeBrief({
    brief: brief(text),
    label: 'my-shop',
    model: modelSaying({ name: 'Golden Crust Bakery' })
  })
  assert.equal(stated.name, 'Golden Crust Bakery')
  assert.equal(stated.nameFrom, 'text')
  // A name the model made up, which the text does not contain, is never accepted.
  const invented = await normalizeBrief({
    brief: brief('A family bakery in Hanoi'),
    label: 'my-shop',
    model: modelSaying({ name: 'Sunrise Bakes' })
  })
  assert.equal(invented.name, 'My Shop')
  assert.equal(invented.nameFrom, 'label')
})

test('no language named means ONE language, English; the language typed in is not a site language', async () => {
  const n = await normalizeBrief({
    brief: brief('Tiệm bánh gia đình ở Hà Nội bán bánh mì và bánh kem'),
    label: 'tiem-banh',
    model: modelSaying({ name: null, languages: [], writtenIn: 'vi' })
  })
  assert.deepEqual(n.languages, ['en'])
  assert.equal(n.languagesFrom, 'default')
  assert.equal(n.writtenIn, 'vi')
})

test('languages the text names are the site languages, checked', async () => {
  const n = await normalizeBrief({
    brief: brief('A bakery. The website must be in English and Vietnamese.'),
    label: 'bakery',
    model: modelSaying({ languages: ['vi', 'en', 'not a tag', 42, 'vi'] })
  })
  assert.deepEqual(n.languages, ['en', 'vi'], 'in the order the text names them')
  assert.equal(n.languagesFrom, 'text')
})

test('a language the model claims is kept only when the text says the SITE is in it', async () => {
  const said = (about, languages) =>
    normalizeBrief({ brief: brief(about), label: 'x', model: modelSaying({ languages }) }).then(
      (n) => n.languages
    )
  // Measured with the real model on 03/10/2026: a nationality or a cuisine came back as a site language.
  assert.deepEqual(await said('A French bakery in Paris selling croissants and baguettes.', ['fr']), ['en'])
  assert.deepEqual(await said('Italian restaurant, the best pasta in Rome.', ['it']), ['en'])
  assert.deepEqual(await said('Tiệm bánh phong cách Pháp ở Hà Nội.', ['fr']), ['en'])
  assert.deepEqual(await said('Tiệm bánh Golden Crust ở Hà Nội.', ['vi']), ['en'], 'the language typed in')
  // Said by the owner, in the ways owners say it.
  assert.deepEqual(await said('Please make the site in French.', ['fr']), ['fr'])
  assert.deepEqual(await said('A bakery. French version too, please.', ['fr']), ['fr'])
  assert.deepEqual(await said('Website bằng tiếng Pháp cho tiệm bánh.', ['fr']), ['fr'])
  assert.deepEqual(await said('Website song ngữ Việt - Anh cho tiệm hoa.', ['vi', 'en']), ['vi', 'en'])
  assert.deepEqual(await said('A bilingual site (German, English) for a law firm.', ['de', 'en']), [
    'de',
    'en'
  ])
  // A region the model gave is kept; the language is what the text backs.
  assert.deepEqual(await said('Site in Brazilian Portuguese.', ['pt-BR']), ['pt-BR'])
  // A language that modifies a noun is a cuisine or a nationality, alone or in a list; the same word as a list of
  // languages is not.
  assert.deepEqual(await said('A bakery offering French and Italian pastries.', ['fr', 'it']), ['en'])
  assert.deepEqual(await said('Vietnamese customers are welcome.', ['vi']), ['en'])
  assert.deepEqual(
    await said('We sell Japanese ceramics. The website should support Japanese, English and Vietnamese.', [
      'ja',
      'en',
      'vi'
    ]),
    ['ja', 'en', 'vi']
  )
  assert.deepEqual(
    await said('Dental clinic in Da Nang, many tourists, so please add Korean and Russian versions.', [
      'ko',
      'ru'
    ]),
    ['ko', 'ru']
  )
  assert.deepEqual(await said('Make the site in French please.', ['fr']), ['fr'])
})

test('a language the model missed is still found by the rules, and the list is capped', async () => {
  const n = await normalizeBrief({
    brief: brief('Please build the site in English, French and German for my law firm.'),
    label: 'x',
    model: modelSaying({ languages: ['en', 'fr'] })
  })
  assert.deepEqual(n.languages, ['en', 'fr', 'de'])
  const many = await normalizeBrief({
    brief: brief('The site in English, French, German, Spanish, Italian and Dutch.'),
    label: 'x',
    model: modelSaying({ languages: [] })
  })
  assert.equal(many.languages.length, MAX_LANGUAGES)
  assert.deepEqual(many.languages, ['en', 'fr', 'de', 'es'])
})

test('language tags are cleaned, de-duplicated and capped', () => {
  assert.deepEqual(cleanLanguages(['EN', 'vi_vn', 'pt-br', 'en', 'x', '1234']), ['en', 'vi-VN', 'pt-BR'])
  assert.equal(cleanLanguages(['en', 'vi', 'fr', 'de', 'es', 'it']).length, MAX_LANGUAGES)
  assert.deepEqual(cleanLanguages('en'), [])
})

test('without a model the rules read a language only when something says the site is in it', async () => {
  assert.deepEqual(languagesByRule('We make French pastries'), [])
  assert.deepEqual(languagesByRule('Website in English and Vietnamese please'), ['en', 'vi'])
  assert.deepEqual(languagesByRule('Làm website bằng tiếng Việt và tiếng Anh'), ['vi', 'en'])
  const n = await normalizeBrief({ brief: brief('A bilingual site in French'), label: 'x', model: null })
  assert.deepEqual(n.languages, ['fr'])
  const none = await normalizeBrief({ brief: brief('A French bakery'), label: 'x', model: null })
  assert.deepEqual(none.languages, ['en'])
})

test('a model that fails costs nothing: the same fields come from rules and defaults, and it is said', async () => {
  const notes = []
  const n = await normalizeBrief({
    brief: brief('A family bakery'),
    label: 'bakery',
    model: broken,
    note: (m) => notes.push(m)
  })
  assert.equal(n.name, 'Bakery')
  assert.deepEqual(n.languages, ['en'])
  assert.equal(n.usedModel, false)
  assert.equal(notes.length, 1)
})

test('a phone or an email is kept only when the text contains it', async () => {
  const text = 'Call us on +84 24 3555 0144 or write to hello@goldencrust.vn'
  const n = await normalizeBrief({
    brief: brief(text),
    label: 'x',
    model: modelSaying({ phone: '+84 24 9999 0000', email: 'hello@goldencrust.vn' })
  })
  assert.match(
    n.contact,
    /\+84 24 3555 0144/,
    'the phone is the one in the text, not the one the model offered'
  )
  assert.match(n.contact, /hello@goldencrust\.vn/)
  const nothing = await normalizeBrief({
    brief: brief('A family bakery'),
    label: 'x',
    model: modelSaying({ phone: '+84 1', email: 'a@b.co' })
  })
  assert.equal(nothing.contact, '')
})

test('a street address the text states goes into the contact line, so the site shows it; one the text does not hold is never accepted', async () => {
  // Measured 03/10/2026: the owner typed "12 Hang Bac, Hanoi", the site showed the phone and the email, and no address.
  const text = 'Golden Crust Bakery, 12 Hang Bac, Hanoi. Call 0912 345 678 or hello@goldencrust.vn.'
  const n = await normalizeBrief({
    brief: brief(text),
    label: 'x',
    model: modelSaying({
      phone: '0912 345 678',
      email: 'hello@goldencrust.vn',
      address: '12 Hang Bac, Hanoi'
    })
  })
  assert.equal(n.contact, '0912 345 678 · hello@goldencrust.vn · 12 Hang Bac, Hanoi')
  const made = await normalizeBrief({
    brief: brief('A family bakery in Hanoi'),
    label: 'x',
    model: modelSaying({ address: '99 Some Other Street, Hanoi' })
  })
  assert.equal(made.contact, '', 'an address the text never holds is an invention')
  const noModel = await normalizeBrief({ brief: brief(text), label: 'x', model: null })
  assert.equal(
    noModel.contact,
    '0912 345 678 · hello@goldencrust.vn',
    'without a model only what a rule can read'
  )
})

// 🔒 A PLACE NAME IS NOT AN ADDRESS (D12, TCH #1013). Measured 11/10/2026 on dev (g58-biz-emd-full, Tracy Business EmDash
// 1.7.5): the description said "a family bakery in Dubai", the model read "Dubai" as the address, and the site replaced the
// demo's address lines with "Dubai" and dropped its branch offices. The questions never ask for an address, so an address is
// given only when the customer typed a street address; a city, a region or a country alone keeps the template's lines.
test('a city, a region or a country alone is not an address: the template keeps its own', async () => {
  for (const said of ['Dubai', 'Downtown Dubai', 'Dubai, UAE', 'Hà Nội']) {
    const n = await normalizeBrief({
      brief: brief(`A family bakery in ${said} baking sourdough and Vietnamese bread every morning.`),
      label: 'x',
      model: modelSaying({ address: said })
    })
    assert.equal(n.address, '', `${said} is a place, not an address`)
    assert.equal(n.contact, '')
  }
  for (const typed of [
    '12 Hang Bac, Hanoi',
    'Ngã tư Ô Chợ Dừa, Đống Đa, Hà Nội',
    'Shop 4, Al Wasl Road, Dubai'
  ]) {
    const n = await normalizeBrief({
      brief: brief(`Tamarind Bakery, ${typed}.`),
      label: 'x',
      model: modelSaying({ address: typed })
    })
    assert.equal(n.address, typed, `${typed} is a street address`)
  }
})

test("opening hours are the owner's own words from the text, or nothing", async () => {
  const text = 'Golden Crust Bakery. Open 6am-8pm every day.'
  const n = await normalizeBrief({
    brief: brief(text),
    label: 'x',
    model: modelSaying({ hours: 'Open 6am-8pm every day' })
  })
  assert.equal(n.hours, 'Open 6am-8pm every day')
  const made = await normalizeBrief({
    brief: brief('Golden Crust Bakery, a family bakery'),
    label: 'x',
    model: modelSaying({ hours: 'Mon-Fri 9-18' })
  })
  assert.equal(made.hours, '', 'hours the text never holds are an invention')
  const offline = await normalizeBrief({ brief: brief(text), label: 'x', model: null })
  assert.equal(offline.hours, '')
})

test('the goal joins the description, the style becomes the tone, the pictures come from the model', async () => {
  const n = await normalizeBrief({
    brief: brief('A family bakery', { goal: 'sell', style: 'friendly' }),
    label: 'x',
    model: modelSaying({
      sector: 'family bakery',
      pictures: [
        'a bakery interior',
        'fresh loaves',
        '',
        7,
        'a cake',
        'extra',
        'one more',
        'and more',
        'beyond'
      ]
    })
  })
  assert.equal(n.about, 'A family bakery', 'what the owner said, never a sentence Tracy added')
  assert.equal(n.tone, `${STYLE_TONE.friendly}. ${GOAL_SENTENCE.sell}`)
  assert.equal(n.sector, 'family bakery')
  assert.deepEqual(n.pictures, [
    'a bakery interior',
    'fresh loaves',
    'a cake',
    'extra',
    'one more',
    'and more'
  ])
})

test('with only a goal and a style (no text) there is still a brief, and no model is asked', async () => {
  let asked = 0
  const n = await normalizeBrief({
    brief: brief('', { goal: 'book', style: 'elegant' }),
    label: 'salon-nam',
    model: {
      chat: async () => {
        asked += 1
        return '{}'
      }
    }
  })
  assert.equal(asked, 0)
  assert.equal(n.name, 'Salon Nam')
  assert.equal(n.about, GOAL_SENTENCE.book)
  assert.equal(n.tone, STYLE_TONE.elegant)
})

test('an address becomes a name a person would give', () => {
  assert.equal(nameFromLabel('golden-crust'), 'Golden Crust')
  assert.equal(nameFromLabel('golden-crust.tracy.test'), 'Golden Crust')
  assert.equal(nameFromLabel(''), 'My site')
})

test('a social profile is accepted only when the text links to it, as written, one per network', async () => {
  assert.deepEqual(
    socialLinksIn('Follow instagram.com/goldencrust and https://www.facebook.com/golden.crust, thanks.'),
    {
      instagram: 'https://instagram.com/goldencrust',
      facebook: 'https://facebook.com/golden.crust'
    }
  )
  assert.deepEqual(
    socialLinksIn('tiktok.com/@gold, youtu.be/abc123, t.me/goldenbot, zalo.me/0912345678, x.com/g1'),
    {
      tiktok: 'https://tiktok.com/@gold',
      youtube: 'https://youtu.be/abc123',
      telegram: 'https://t.me/goldenbot',
      zalo: 'https://zalo.me/0912345678',
      x: 'https://x.com/g1'
    }
  )
  assert.deepEqual(socialLinksIn('instagram.com/first and instagram.com/second'), {
    instagram: 'https://instagram.com/first'
  })
  for (const text of [
    'Instagram @goldencrust, Facebook: Golden Crust',
    'hello@instagram.com',
    'see www.example.com/instagram.com/xyz',
    'instagram.com/',
    'instagram.com/x',
    ''
  ])
    assert.deepEqual(socialLinksIn(text), {}, `"${text}" names no profile the owner linked`)
  const normalized = await normalizeBrief({
    brief: brief('Golden Crust Bakery. Follow us at instagram.com/goldencrust.'),
    label: 'golden-crust',
    model: modelSaying({ name: 'Golden Crust Bakery' })
  })
  assert.deepEqual(normalized.social, { instagram: 'https://instagram.com/goldencrust' })
  const none = await normalizeBrief({ brief: brief('A bakery in Hanoi'), label: 'x', model: null })
  assert.deepEqual(none.social, {})
})

test('a model that wraps its answer in words is still read: the first complete object, not the first brace to the last', async () => {
  const normalized = await normalizeBrief({
    brief: brief('Golden Crust Bakery in Hanoi'),
    label: 'golden-crust',
    model: modelSaying(
      'Sure! Here it is: {"name": "Golden Crust Bakery", "languages": []} (the {rest} is obvious)'
    )
  })
  assert.equal(normalized.name, 'Golden Crust Bakery')
  assert.equal(normalized.usedModel, true)
})

// ── The answers of the site's own questionnaire (`lib/site-brief.js` `briefFromAnswers`) ─────────

const answered = (over = {}) => ({
  about: 'We bake bread every morning.',
  said: 'Sector: Family bakery\nAddress and hotline: 12 Hang Bac, Hanoi · 0912 345 678',
  goal: null,
  style: null,
  answers: [
    { id: 'name', kind: 'text', feeds: ['site.name', 'agent'], label: 'Company name', value: 'Golden Crust' },
    {
      id: 'sector',
      kind: 'choice',
      feeds: ['agent'],
      label: 'Sector',
      value: 'bakery',
      valueLabel: 'Family bakery'
    },
    { id: 'languages', kind: 'languages', feeds: ['site.languages'], label: 'Language', value: ['vi', 'en'] },
    { id: 'tone', kind: 'choice', feeds: ['copy.tone'], label: 'Tone', value: 'warm', valueLabel: 'Warm' }
  ],
  ...over
})

test('a name typed into the name question is the name as typed, whatever the text says', async () => {
  const n = await normalizeBrief({
    brief: answered(),
    label: 'my-shop',
    model: modelSaying({ name: 'Somebody Else' })
  })
  assert.equal(n.name, 'Golden Crust')
  assert.equal(n.nameFrom, 'answer')
})

test('the languages picked in the language question are the site languages, as picked', async () => {
  const n = await normalizeBrief({ brief: answered(), label: 'x', model: modelSaying({ languages: ['fr'] }) })
  assert.deepEqual(n.languages, ['vi', 'en'])
  assert.equal(n.languagesFrom, 'answer')
  // Nothing picked: the text decides, then the one default — as before.
  const none = await normalizeBrief({
    brief: answered({ answers: [] }),
    label: 'x',
    model: modelSaying({ languages: [] })
  })
  assert.deepEqual(none.languages, ['en'])
  assert.equal(none.languagesFrom, 'default')
})

test('the sector answer is the sector, the tone answer the tone, and the other answers are read for facts', async () => {
  const n = await normalizeBrief({
    brief: answered(),
    label: 'x',
    model: modelSaying({ sector: 'something else' })
  })
  assert.equal(n.sector, 'Family bakery')
  assert.equal(n.tone, 'Warm')
  assert.equal(n.about, 'We bake bread every morning.')
  // The phone and the address were typed into another question, and are found in what the customer said.
  assert.equal(n.phone, '0912 345 678')
  assert.equal(n.address, '')
})

test('beside a description, the other answers reach the copy as their own field; without one they are the description, said once', async () => {
  const school = {
    about: 'Evening Spanish classes for adults.',
    said: 'Sector: Language school\nClass size: at most eight students',
    goal: null,
    style: null,
    answers: []
  }
  const n = await normalizeBrief({ brief: school, label: 'x', model: modelSaying({}) })
  assert.equal(n.about, 'Evening Spanish classes for adults.', 'the description as the owner wrote it')
  assert.equal(n.details, 'Sector: Language school\nClass size: at most eight students')
  const bare = await normalizeBrief({ brief: { ...school, about: '' }, label: 'x', model: modelSaying({}) })
  assert.match(bare.about, /^Sector: Language school\. Class size/)
  assert.equal(bare.details, '', 'not said twice')
  const old = await normalizeBrief({ brief: brief('Evening Spanish classes.'), label: 'x', model: null })
  assert.equal(old.details, '')
})

test('with no description the other answers stand in for it, and a model is still asked', async () => {
  let asked = 0
  const n = await normalizeBrief({
    brief: answered({ about: '' }),
    label: 'x',
    model: {
      chat: async () => {
        asked += 1
        return '{}'
      }
    }
  })
  assert.equal(asked, 1)
  assert.match(n.about, /^Sector: Family bakery\. Address and hotline: 12 Hang Bac/)
})

// Website Opportunities sends the contact facts it collected beside the answers (`brief.facts`, `lib/site-brief.js`
// `readBriefFacts`): the identity writers of every CMS read `phone`, `email`, `address`, `hours` and `contact` from here.
const collected = {
  phone: { value: '+84 235 5550 134', source: 'business.phone', fetchedAt: '2026-10-19T10:00:00.000Z' },
  email: { value: 'hello@phoba.vn', source: 'business.email' },
  address: { value: '12 Tran Phu, Hoi An', source: 'business.address' },
  hours: { value: 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM', source: 'business.hours' }
}

test('collected facts are the contact details as sent, with no model, and say where they came from', async () => {
  const n = await normalizeBrief({ brief: brief('', { facts: collected }), label: 'phoba', model: null })
  assert.equal(n.phone, '+84 235 5550 134')
  assert.equal(n.email, 'hello@phoba.vn')
  assert.equal(n.address, '12 Tran Phu, Hoi An')
  assert.equal(n.hours, 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM')
  assert.equal(n.contact, '+84 235 5550 134 · hello@phoba.vn · 12 Tran Phu, Hoi An')
  assert.equal(n.usedModel, false)
  assert.deepEqual(n.contactFrom, {
    phone: { from: 'facts', source: 'business.phone', fetchedAt: '2026-10-19T10:00:00.000Z' },
    email: { from: 'facts', source: 'business.email' },
    address: { from: 'facts', source: 'business.address' },
    hours: { from: 'facts', source: 'business.hours' }
  })
})

test('what the customer said wins over a collected fact; a model never replaces one', async () => {
  const n = await normalizeBrief({
    brief: brief('Pho Ba, call 0912 345 678', { facts: collected }),
    label: 'phoba',
    model: modelSaying({ phone: '0912 345 678', address: '99 Other Street, Hanoi', hours: 'Open 24/7' })
  })
  assert.equal(n.phone, '0912 345 678')
  assert.deepEqual(n.contactFrom.phone, { from: 'text' })
  assert.equal(
    n.address,
    '12 Tran Phu, Hoi An',
    'an address the text does not hold is no answer; the fact stands'
  )
  assert.equal(n.hours, 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM')
})

test('a collected fact that does not look like one is dropped, with a note saying why', async () => {
  const notes = []
  const n = await normalizeBrief({
    brief: brief('', {
      facts: {
        phone: { value: 'call us', source: 'business.phone' },
        email: { value: 'not-an-email', source: 'business.email' },
        address: { value: 'Hoi An', source: 'business.address' },
        hours: { value: 'ok', source: 'business.hours' }
      }
    }),
    label: 'phoba',
    model: null,
    note: (line) => notes.push(line)
  })
  assert.deepEqual([n.phone, n.email, n.address, n.hours, n.contact], ['', '', '', '', ''])
  assert.deepEqual(n.contactFrom, {})
  assert.equal(notes.length, 4)
  assert.match(notes.join('\n'), /phone .*business\.phone/)
  assert.match(notes.join('\n'), /address .*not a street address/)
})

test('no collected facts: the brief reads as it always did, with no provenance field', async () => {
  const n = await normalizeBrief({ brief: brief('Pho Ba, call 0912 345 678'), label: 'phoba', model: null })
  assert.equal(n.phone, '0912 345 678')
  assert.equal('contactFrom' in n, false)
})
