/**
 * The words no slot names — a heading and a sentence on the News page, a contact form for construction quotes — made
 * slots for the seeder's own planner and written back into the block or the form that held them.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import {
  editForm,
  formIdsIn,
  formLabels,
  formLines,
  mailTo,
  PLAIN_CONSENT
} from '../src/sites/brief-engines/wp-forms.js'
import {
  editLines,
  labelLines,
  lineMap,
  planLines,
  staticLines
} from '../src/sites/brief-engines/wp-leaves.js'

const heading = (text, name = null) =>
  `<!-- wp:heading ${name ? `{"metadata":{"name":"${name}"}}` : '{"level":2}'} -->\n<h2>${text}</h2>\n<!-- /wp:heading -->`
const para = (text, name = null) =>
  `<!-- wp:paragraph ${name ? `{"metadata":{"name":"${name}"}} ` : ''}-->\n<p>${text}</p>\n<!-- /wp:paragraph -->`

// The News page as the template stores it: its own heading, a query, and a newsletter promise beside a form.
const NEWS = [
  heading('News & engineering notes'),
  '<!-- wp:query {"queryId":1} -->\n<div class="wp-block-query"><!-- wp:post-title /--></div>\n<!-- /wp:query -->',
  heading('Get our industry brief every two weeks'),
  para('Tender news, material price movements and engineering notes.'),
  para('Fresh', null),
  para("A named slot of the contract, written or not, is somebody else's business", 'news.intro'),
  '<!-- wp:html -->\n<p>Raw HTML belongs to the section it is in, and is cut or kept with it</p>\n<!-- /wp:html -->',
  '<!-- wp:paragraph -->\n<p>Read <a href="/x">the whole story</a> on our site, with the link in the middle</p>\n<!-- /wp:paragraph -->',
  para('{contact.phone} is an identity token the plugin fills at the visit')
].join('\n\n')

test('the lines worth asking about are single lines of ordinary blocks and the sentences of raw HTML: not named, not live, not a label', () => {
  assert.deepEqual(
    staticLines(NEWS).map((l) => [l.text, l.block]),
    [
      ['News & engineering notes', 'core/heading'],
      ['Get our industry brief every two weeks', 'core/heading'],
      ['Tender news, material price movements and engineering notes.', 'core/paragraph'],
      ['Raw HTML belongs to the section it is in, and is cut or kept with it', 'core/html']
    ]
  )
  assert.deepEqual(
    staticLines('<!-- wp:group -->\n<div>'),
    [],
    "a body that is not blocks is nobody's to plan"
  )
})

test('the lines of every page become slots of one map, each with the page and the block it came from', () => {
  const { contentMap, keys } = lineMap(
    [
      { slug: 'news', lines: staticLines(NEWS) },
      { slug: 'empty', lines: [] }
    ],
    'en'
  )
  assert.equal(contentMap.slots.length, 4)
  assert.equal(contentMap.entities.length, 1, 'a page with no lines is not in the map')
  const [first] = contentMap.slots
  assert.deepEqual(
    [first.key, first.entity, first.type, first.sample, first.label],
    ['line.news.1', 'line-news', 'text', 'News & engineering notes', 'news page — heading']
  )
  assert.equal(
    first.maxCharacters,
    Math.ceil('News & engineering notes'.length * 1.25) < 40
      ? 40
      : Math.ceil('News & engineering notes'.length * 1.25)
  )
  assert.deepEqual(keys.get('line.news.3'), {
    slug: 'news',
    text: 'Tender news, material price movements and engineering notes.'
  })
  assert.equal(contentMap.entities[0].identity.language, 'en')
})

test('a line goes into every unnamed block that holds exactly it; null takes the block away; nothing else moves', () => {
  const out = editLines(NEWS, [
    { text: 'News & engineering notes', value: 'News from the bakery' },
    { text: 'Tender news, material price movements and engineering notes.', value: null },
    { text: 'Get our industry brief every two weeks', value: 'Fresh bakes, in your inbox' }
  ])
  assert.deepEqual([out.edited, out.dropped], [2, 1])
  assert.ok(
    out.markup.includes('<h2>News from the bakery</h2>') &&
      out.markup.includes('<h2>Fresh bakes, in your inbox</h2>')
  )
  assert.equal(out.markup.includes('Tender news'), false)
  // The named block, the raw HTML, the live block and the token are as they were.
  for (const kept of ['somebody else', 'Raw HTML belongs', 'wp:query', '{contact.phone}', 'the whole story'])
    assert.ok(out.markup.includes(kept), kept)
  assert.ok(parseBlocks(out.markup))
  assert.equal(editLines(NEWS, []).markup, NEWS)
  assert.equal(editLines('not blocks <!-- wp:x -->', [{ text: 'x', value: 'y' }]).edited, 0)
})

// The real contact form of tracy-business/wp7 (the `_form` meta of "Contact"), measured 03/10/2026.
const FORM = `<div class="wtb-form__grid wtb-form__grid--2">
<label class="wtb-form__field"> Full name *
    [text* full-name placeholder "Ivan Petrov"] </label>
<label class="wtb-form__field"> Company
    [text company placeholder "Company name"] </label>
<label class="wtb-form__field"> Email *
    [email* email placeholder "you@company.ru"] </label>
<label class="wtb-form__field"> Phone
    [tel phone placeholder "+__ (___) ___-____"] </label>
</div>

<fieldset class="wtb-form__choices"><legend>Request type *</legend>
    [radio request-type use_label_element default:1 "Quote request" "Consultation" "Support" "Other"]</fieldset>

<label class="wtb-form__field"> Project description *
    [textarea* project-description placeholder "Tell us what you need…"] </label>

<label class="wtb-form__file"> Drag drawings here, or click to choose files <span class="wtb-form__hint">PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max</span>
    [file file-1 filetypes:pdf|dwg|zip|jpg|png|doc|docx|xls|xlsx limit:25mb] </label>

[acceptance acceptance-1] I consent to the processing of personal data under Federal Law 152-FZ. [/acceptance]

<div class="wtb-form__actions">[submit "Send request"] <button type="reset" class="wtb-form__reset">Clear form</button></div>`

test("a form's lines are its sentences and its example placeholders, not its field labels or its shortcodes", () => {
  assert.deepEqual(
    formLines(FORM).map((l) => [l.kind, l.text]),
    [
      ['text', 'Project description *'],
      ['text', 'Drag drawings here, or click to choose files'],
      ['text', 'PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max'],
      ['text', 'I consent to the processing of personal data under Federal Law 152-FZ.'],
      ['placeholder', 'Ivan Petrov'],
      ['placeholder', 'Company name'],
      ['placeholder', 'you@company.ru'],
      ['placeholder', '+__ (___) ___-____'],
      ['placeholder', 'Tell us what you need…']
    ]
  )
})

test('a form keeps every field and its name; only the words change, and the upload of drawings goes with its label', () => {
  const edits = new Map([
    ['Project description *', 'Your message *'],
    ['Drag drawings here, or click to choose files', null],
    ['PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max', null],
    ['I consent to the processing of personal data under Federal Law 152-FZ.', null],
    ['Ivan Petrov', 'Your name'],
    ['Company name', 'Your company, if you have one'],
    ['you@company.ru', 'you@example.com'],
    ['+__ (___) ___-____', null],
    ['Tell us what you need…', 'Tell us what you would like']
  ])
  const out = editForm(FORM, edits)
  assert.equal(out.form.includes('Federal Law'), false)
  assert.ok(
    out.form.includes(`[acceptance acceptance-1] ${PLAIN_CONSENT} [/acceptance]`),
    'a consent keeps a plain sentence'
  )
  assert.equal(
    out.form.includes('drawings') || out.form.includes('[file') || out.form.includes('DWG'),
    false,
    'the whole upload field goes'
  )
  assert.ok(out.form.includes('<label class="wtb-form__field"> Your message *'))
  assert.ok(
    out.form.includes('placeholder "Your name"') && out.form.includes('placeholder "you@example.com"')
  )
  assert.ok(
    out.form.includes('[tel phone]'),
    'a placeholder with nothing honest to say is left out of its field and the field stays'
  )
  // Every field is still there, in its place, under its name.
  for (const field of [
    '[text* full-name',
    '[text company',
    '[email* email',
    '[tel phone]',
    '[textarea* project-description',
    '[submit "Send request"]',
    '[radio request-type'
  ])
    assert.ok(out.form.includes(field), field)
  assert.ok(out.form.includes('<button type="reset" class="wtb-form__reset">Clear form</button>'))
  assert.deepEqual(
    [out.edited, out.dropped],
    [6, 2],
    'five lines said again and the consent made plain; a placeholder and an upload field gone'
  )
})

test('a quote or a bracket in an answer cannot break the form it goes into', () => {
  const out = editForm(
    '<label> Name *\n [text* n placeholder "Ivan Petrov"] </label>',
    new Map([['Ivan Petrov', 'A "quoted" [name]\nin two lines']])
  )
  assert.ok(out.form.includes('placeholder "A quoted name in two lines"'))
})

test('a form with nothing to change comes back as it was', () => {
  assert.deepEqual(editForm(FORM, new Map()), { form: FORM, edited: 0, dropped: 0 })
})

// ── planning ─────────────────────────────────────────────────────────────────────────────────────────────────

const noGuard = (changes) => ({ kept: changes, dropped: [] })

test('page lines and form lines are planned as slots of one map, and each answer goes back to its page or form', async () => {
  const seen = []
  const out = await planLines({
    pages: [{ slug: 'news', lines: staticLines(NEWS) }],
    forms: [{ id: 25, lines: formLines(FORM).slice(0, 2) }],
    language: 'en',
    plan: async (map) => {
      seen.push(map)
      return {
        changes: {
          'line.news.1': 'News from the bakery',
          'line.news.2': 'Get our news by email',
          'line.form-25.1': 'Your message *'
        },
        pending: ['line.news.3', 'line.form-25.2']
      }
    },
    repair: async () => ({
      texts: { 'line.news.3': 'Fresh bakes and bakery news.' },
      nulls: new Set(['line.form-25.2'])
    }),
    guard: noGuard
  })
  assert.equal(seen.length, 1, 'one map for the whole site')
  assert.deepEqual(
    seen[0].slots.map((s) => s.label),
    [
      'news page — heading',
      'news page — heading',
      'news page — paragraph',
      'news page — html',
      'form-25 page — form text',
      'form-25 page — form text'
    ]
  )
  assert.deepEqual(out.lines, [
    { slug: 'news', text: 'News & engineering notes', value: 'News from the bakery' },
    { slug: 'news', text: 'Get our industry brief every two weeks', value: 'Get our news by email' },
    {
      slug: 'news',
      text: 'Tender news, material price movements and engineering notes.',
      value: 'Fresh bakes and bakery news.'
    }
  ])
  assert.deepEqual(
    [...out.forms],
    [
      [
        25,
        new Map([
          ['Project description *', 'Your message *'],
          ['Drag drawings here, or click to choose files', null]
        ])
      ]
    ]
  )
})

test('a line the guard stops is asked again, and one nobody answers is left exactly as it is', async () => {
  const asked = []
  const out = await planLines({
    pages: [{ slug: 'news', lines: staticLines(NEWS) }],
    forms: [],
    language: 'en',
    plan: async () => ({
      changes: { 'line.news.1': 'Call +84 24 1111 2222', 'line.news.2': 'Fine' },
      pending: []
    }),
    repair: async (slots) => {
      asked.push(slots.map((s) => s.key))
      return { texts: {}, nulls: new Set() }
    },
    guard: (changes) => {
      const kept = {}
      const dropped = []
      for (const [key, value] of Object.entries(changes))
        /\+84/.test(value) ? dropped.push({ key }) : (kept[key] = value)
      return { kept, dropped }
    }
  })
  assert.deepEqual(
    asked,
    [['line.news.1', 'line.news.3', 'line.news.4']],
    'the stopped line and the ones nobody wrote'
  )
  assert.deepEqual(
    out.lines.map((l) => l.text),
    ['Get our industry brief every two weeks'],
    'the rest stay as the template has them'
  )
})

test('nothing to plan is nothing asked', async () => {
  const out = await planLines({
    pages: [{ slug: 'x', lines: [] }],
    forms: [],
    language: 'en',
    plan: async () => {
      throw new Error('asked')
    },
    repair: async () => {
      throw new Error('asked')
    },
    guard: noGuard
  })
  assert.deepEqual([out.lines, [...out.forms]], [[], []])
})

test('the forms a body shows are found by their shortcode or their block, once each', () => {
  const body = [
    '<!-- wp:shortcode -->\n[contact-form-7 id="25" title="Contact"]\n<!-- /wp:shortcode -->',
    '<!-- wp:contact-form-7/contact-form-selector {"id":349,"hash":"abc","title":"Newsletter"} -->',
    '[contact-form-7 id="25"]',
    '[contact-form-7 title="no id"]'
  ].join('\n')
  assert.deepEqual(
    formIdsIn(body).sort((a, b) => a - b),
    [25, 349]
  )
  assert.deepEqual(formIdsIn('<p>no form</p>'), [])
})

test("a form's mail goes to the owner's address and keeps all else; one that already goes there, or is no mail, is left", () => {
  const mail = { subject: 's', recipient: '[_site_admin_email]', body: 'b', use_html: 0 }
  assert.deepEqual(mailTo(mail, 'hello@x.vn'), { ...mail, recipient: 'hello@x.vn' })
  assert.equal(mailTo({ ...mail, recipient: 'hello@x.vn' }, 'hello@x.vn'), null)
  for (const odd of [null, undefined, 'text', 7, []]) assert.equal(mailTo(odd, 'hello@x.vn'), null)
  assert.deepEqual(
    mail,
    { subject: 's', recipient: '[_site_admin_email]', body: 'b', use_html: 0 },
    'the input is not changed'
  )
})

// ── The sentences of raw HTML: said again where they stand ─────────────────────────────────────────────────────
// The Contact page of `tracy-business/wp7` keeps a hint in a raw block beside its form, measured 03/10/2026.
const CONTACT = [
  '<!-- wp:html -->',
  '<section style="gap: 56px">',
  '  <style>.wtb-contact__aside { color: red }</style>',
  '  <div class="note"><span>i</span><p><span class="sc-interp">Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.</span></p></div>',
  '  <h3>Social profiles</h3>',
  '  <a href="/x" data-tracy-identity="social.facebook">{social.facebook}</a>',
  '  <p>{contact.phone} is an identity token</p>',
  '  <p>[contact-form-7 id="25" title="Contact"]</p>',
  '  <script>var message = "Not text a visitor reads, at all"</script>',
  '  <button>Send</button>',
  '</section>',
  '<!-- /wp:html -->'
].join('\n')

test('the sentences of a raw HTML block are lines; markup, styles, scripts, tokens, shortcodes and short labels are not', () => {
  assert.deepEqual(
    staticLines(CONTACT).map((l) => [l.text, l.block]),
    [
      [
        'Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.',
        'core/html'
      ],
      ['Social profiles', 'core/html']
    ]
  )
})

test('a sentence of raw HTML takes its new words between the same tags, escaped, and nothing else moves; with no words it stays', () => {
  const hint =
    'Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.'
  const out = editLines(CONTACT, [
    { text: hint, value: 'Fields marked * are required. Tell us what you would like & when <soon>.' },
    { text: 'Social profiles', value: null }
  ])
  assert.equal(out.edited, 1)
  assert.equal(out.dropped, 0, 'a raw line is never taken away: nothing says where its markup ends')
  assert.ok(
    out.markup.includes(
      '<span class="sc-interp">Fields marked * are required. Tell us what you would like &amp; when &lt;soon&gt;.</span>'
    )
  )
  assert.equal(
    out.markup.replace(/<span class="sc-interp">.*?<\/span>/, '<span class="sc-interp"></span>'),
    CONTACT.replace(/<span class="sc-interp">.*?<\/span>/, '<span class="sc-interp"></span>'),
    'every other byte is as it was'
  )
  assert.equal(parseBlocks(out.markup) !== null, true)
  const same = editLines(CONTACT, [{ text: hint, value: '' }])
  assert.equal(same.markup, CONTACT, 'an empty value is no value')
})

test('raw HTML and ordinary blocks of one body are edited together, last first', () => {
  const body = `${heading('News & engineering notes')}\n\n${CONTACT}`
  const out = editLines(body, [
    { text: 'News & engineering notes', value: 'News from the bakery' },
    { text: 'Social profiles', value: 'Find us online' }
  ])
  assert.equal(out.edited, 2)
  assert.ok(out.markup.includes('<h2>News from the bakery</h2>'))
  assert.ok(out.markup.includes('<h3>Find us online</h3>'))
})

// 🔒 A LINE ANSWERED WITH NOTHING BUT THE BUSINESS'S NAME IS NO ANSWER (TCH #1013, measured 11/10/2026 on dev g57-ess-wp-full,
// JA Essence WordPress 1.0.10, About given): the heading the Layout 1 page prints over its article (`tracy_page_heading`,
// "Abstract Wonders: Exploring Line Art Composition") came back as "Tiệm bánh Tamarind & Co", so the page's h1 and its tab
// named the bakery instead of an article. Such a value is asked again; one that is still only the name keeps the template's words.
test('a line answered with only the business name is asked again, and kept as the template has it when that is all it gets', async () => {
  const asked = []
  const out = await planLines({
    pages: [
      {
        slug: 'meta-layout-1',
        lines: [
          { text: 'Abstract Wonders: Exploring Line Art Composition', block: 'page heading' },
          { text: 'Tender news, material price movements and engineering notes.', block: 'core/paragraph' }
        ]
      }
    ],
    forms: [],
    language: 'en',
    name: 'Tiệm Bánh Tamarind & Co',
    plan: async () => ({
      changes: {
        'line.meta-layout-1.1': 'Tiệm bánh  Tamarind &amp; Co',
        'line.meta-layout-1.2': 'Fresh bread from Tiệm Bánh Tamarind & Co every morning.'
      },
      pending: []
    }),
    repair: async (slots) => {
      asked.push(slots.map((s) => s.key))
      return { texts: { 'line.meta-layout-1.1': 'TIỆM BÁNH TAMARIND & CO' }, nulls: new Set() }
    },
    guard: noGuard
  })
  assert.deepEqual(asked, [['line.meta-layout-1.1']], 'the bare name is asked again')
  assert.deepEqual(
    out.lines.map((l) => [l.text, l.value]),
    [
      [
        'Tender news, material price movements and engineering notes.',
        'Fresh bread from Tiệm Bánh Tamarind & Co every morning.'
      ]
    ],
    'a sentence that names the business is an answer; the bare name twice keeps the heading as it was'
  )
})

/* ---------- LANG-2: the labels a site written in another language translates ---------- */

// JA Essence WordPress 1.0.11 as dev g58-ess-wp-full stored it: the Layout 1 article card, a Typography line cut by a tag,
// a badge, and the Error page's raw HTML.
const ESSENCE_LABELS = [
  '<!-- wp:paragraph {"className":"je-badge-static je-cat--health"} -->\n<p class="je-badge-static je-cat--health">Health</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:paragraph {"className":"je-meta__author"} -->\n<p class="je-meta__author">By <strong>Faith Singleton</strong></p>\n<!-- /wp:paragraph -->',
  para('You can use the mark tag to <mark>highlight</mark> text.'),
  para('A sentence long enough to be said again for the business'),
  '<!-- wp:html -->\n<div class="well"><center>Each <strong>JA Template</strong> has its own 404 page. Below is a screenshot of the <strong>404 page style</strong>.</center></div>\n<!-- /wp:html -->',
  '<!-- wp:html -->\n<button type="button" class="btn btn-primary">Primary</button> <span>{site.title}</span>\n<!-- /wp:html -->',
  para('Named words of a slot', 'hero.title')
].join('\n')

test('labelLines takes the labels and the cut runs staticLines leaves, never a sentence it takes, a token or a slot', () => {
  assert.deepEqual(
    labelLines(ESSENCE_LABELS).map((l) => l.text),
    [
      'Health',
      'By',
      'Faith Singleton',
      'You can use the mark tag to',
      'highlight',
      'text.',
      'Each',
      'JA Template',
      'Primary'
    ]
  )
  const said = new Set(staticLines(ESSENCE_LABELS).map((l) => l.text))
  for (const line of labelLines(ESSENCE_LABELS)) assert.equal(said.has(line.text), false, line.text)
  assert.equal(labelLines(ESSENCE_LABELS)[0].block, 'core/paragraph label')
})

test('editLines writes a label where it stands, a run of a cut paragraph included, and never takes a run off', () => {
  const out = editLines(ESSENCE_LABELS, [
    { text: 'Health', value: 'Sức khỏe' },
    { text: 'By', value: 'Bởi' },
    { text: 'You can use the mark tag to', value: 'Bạn có thể dùng thẻ mark để' },
    { text: 'highlight', value: 'làm nổi bật' },
    { text: 'text.', value: null },
    { text: 'Each', value: 'Mỗi' }
  ])
  assert.match(out.markup, /<p class="je-badge-static je-cat--health">Sức khỏe<\/p>/)
  assert.match(out.markup, /<p class="je-meta__author">Bởi <strong>Faith Singleton<\/strong><\/p>/)
  assert.match(out.markup, /<p>Bạn có thể dùng thẻ mark để <mark>làm nổi bật<\/mark> text\.<\/p>/)
  assert.match(out.markup, /<center>Mỗi <strong>JA Template<\/strong>/)
  assert.equal(out.dropped, 0)
  assert.ok(parseBlocks(out.markup))
})

// The JA Essence Contact and Newsletter forms (Contact Form 7 `_form`), as the quickstart ships them.
const CONTACT_FORM =
  '<p><label for="cf-name">Name</label>[text* your-name id:cf-name placeholder "Name"]</p>\n' +
  '<p><label>Subject</label>[text your-subject placeholder "Subject"]</p>\n' +
  '<p><label>Your message</label>[textarea your-message placeholder "Message"]</p>\n' +
  '[checkbox send-copy use_label_element "Send a copy to yourself"]\n' +
  '[acceptance terms] I agree with the <a href="/terms">Terms and conditions</a> and the <a href="/privacy">Privacy policy</a> [/acceptance]\n' +
  '[submit class:btn "Send message"]'

test('formLabels takes the labels and the submit button formLines leaves; editForm writes them and keeps every field', () => {
  assert.deepEqual(
    formLabels(CONTACT_FORM).map((l) => [l.text, l.kind]),
    [
      ['Name', 'text'],
      ['Subject', 'text'],
      ['Your message', 'text'],
      ['and the', 'text'],
      ['Privacy policy', 'text'],
      ['Send message', 'submit']
    ]
  )
  const out = editForm(
    CONTACT_FORM,
    new Map([
      ['Name', 'Họ tên'],
      ['Subject', 'Chủ đề'],
      ['and the', 'và'],
      ['Send message', 'Gửi tin nhắn'],
      ['I agree with the', 'Tôi đồng ý với']
    ])
  )
  // The same words as a placeholder read the same; the field's name and options stay.
  assert.match(
    out.form,
    /<label for="cf-name">Họ tên<\/label>\[text\* your-name id:cf-name placeholder "Họ tên"\]/
  )
  assert.match(out.form, /\[submit class:btn "Gửi tin nhắn"\]/)
  assert.match(
    out.form,
    /\[acceptance terms\] Tôi đồng ý với <a href="\/terms">Terms and conditions<\/a> và <a/
  )
  // The copy box's option, which the theme's mail rule reads by name, stays as it was.
  assert.match(out.form, /\[checkbox send-copy use_label_element "Send a copy to yourself"\]/)
  assert.equal(out.dropped, 0)
})

// 🔒 K6 (measured 11/10/2026 on dev g64-ess-wp-full, JA Essence WordPress 1.0.15): the YouTube embed of a post's body holds
// only its address, and that address was planned as a line, so the post printed a sentence where the video stood.
test('the address an embed block holds is never a line to rewrite or a label to translate, and the embed stays', () => {
  const embed =
    '<!-- wp:embed {"url":"https://www.youtube.com/watch?v=akTKvXnrsQ4","type":"video","providerNameSlug":"youtube"} -->\n' +
    '<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube"><div class="wp-block-embed__wrapper">\n' +
    'https://www.youtube.com/watch?v=akTKvXnrsQ4\n' +
    '</div></figure>\n<!-- /wp:embed -->'
  const body = `${para('A sentence of the post that is long enough to say again.')}\n\n${embed}`
  const lines = staticLines(body).map((line) => line.text)
  assert.deepEqual(lines, ['A sentence of the post that is long enough to say again.'])
  assert.deepEqual(labelLines(body), [])
  // A disobedient answer keyed by the address itself changes nothing of the embed.
  const out = editLines(body, [
    { text: 'https://www.youtube.com/watch?v=akTKvXnrsQ4', value: 'Bánh là phần kết.' }
  ])
  assert.equal(out.edited, 0)
  assert.ok(out.markup.includes('https://www.youtube.com/watch?v=akTKvXnrsQ4'))
})
