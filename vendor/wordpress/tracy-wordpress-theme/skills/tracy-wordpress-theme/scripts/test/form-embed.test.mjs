// form-embed.test.mjs — the source's static form becomes the Contact Form 7 form, and the
// shortcode stands where the controls stood: one form, the source's fields, in the source's card.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceForm, sourceForms, cf7Form, cf7MailBody, cf7FormText, embedShortcode } from '../lib/form-embed.mjs'

// The Northgate contact card as the canvas exports it, trimmed to what matters.
const card = `<div id="grid">
  <div id="card" style="border: 1px solid rgb(220, 215, 204); padding: 36px;">
    <div id="note" style="background: rgb(232, 240, 235);"><span>i</span><p>Fields marked * are required.</p></div>
    <div style="display: grid; grid-template-columns: 1fr 1fr;">
      <div><label>Full name <span style="color: red;">*</span></label><input type="text" placeholder="Ivan Petrov"></div>
      <div><label>Company</label><input type="text" placeholder="Company name"></div>
      <div><label>Email <span>*</span></label><input type="text" placeholder="you@company.ru"></div>
      <div><label>Phone</label><input type="text" placeholder="+7 (___) ___-__-__"></div>
    </div>
    <div><label>Request type <span>*</span></label>
      <div style="display: flex;"><span style="cursor: pointer;">Construction quote</span><span style="cursor: pointer;">Site survey</span></div>
    </div>
    <div><label>Project description <span>*</span></label><textarea placeholder="Location, floor area…"></textarea></div>
    <div style="border: 1px dashed rgb(201, 195, 182);"><div>Drag drawings here, or click to choose files</div><div>PDF, DWG, ZIP · 25 MB max</div></div>
    <div style="display: flex;"><div style="width: 18px; height: 18px; border: 1px solid rgb(180, 175, 164);"></div><span>I consent to the processing of personal data.</span></div>
    <div><button style="background: orange;">Send request</button><button>Clear form</button></div>
  </div>
  <div id="aside"><div>Head office</div><div>Vorsino Industrial Park, plot 12</div></div>
</div>`

test('sourceForm: every control the export drew, in order, with its label, requirement and placeholder', () => {
  const f = sourceForm(card)
  assert.deepEqual(
    f.fields.map((x) => [x.kind, x.label, x.required]),
    [
      ['text', 'Full name', true],
      ['text', 'Company', false],
      ['email', 'Email', true],
      ['tel', 'Phone', false],
      ['radio', 'Request type', true],
      ['textarea', 'Project description', true],
      ['file', 'Drag drawings here, or click to choose files', false],
      ['acceptance', 'I consent to the processing of personal data.', true]
    ]
  )
  assert.equal(f.fields[0].placeholder, 'Ivan Petrov')
  assert.deepEqual(f.fields[4].options, ['Construction quote', 'Site survey'])
  assert.deepEqual(f.fields[6], { kind: 'file', label: 'Drag drawings here, or click to choose files', required: false, hint: 'PDF, DWG, ZIP · 25 MB max', accept: ['pdf', 'dwg', 'zip'], limit: '25mb' })
  assert.equal(f.submit, 'Send request')
  assert.equal(f.reset, 'Clear form')
  assert.equal(f.region.el.id, 'card', 'the card holds every control')
  assert.deepEqual([f.region.first, f.region.last], [1, 6], 'the note before the controls is not part of the run')
})

test('sourceForm: real inputs, a select and a checkbox; no control at all is null', () => {
  const f = sourceForm('<form><label>Name *</label><input name="n" required><label>Topic</label><select><option>A</option><option>B</option></select><label><input type="checkbox"> I agree</label><input type="submit" value="Go"></form>')
  assert.deepEqual(
    f.fields.map((x) => [x.kind, x.label, x.required, x.options ?? null]),
    [
      ['text', 'Name', true, null],
      ['select', 'Topic', false, ['A', 'B']],
      ['acceptance', 'I agree', false, null]
    ]
  )
  assert.equal(f.submit, 'Go')
  assert.equal(sourceForm('<section><h2>Contact</h2><p>Call us.</p></section>'), null)
})

test('cf7Form: one CF7 tag per field, named after the label; a Cyrillic label gets a kind-numbered name', () => {
  const { form, fields } = cf7Form(sourceForm(card))
  assert.match(form, /<label class="wtb-form__field"> Full name <span class="wtb-form__required" aria-hidden="true">\*<\/span>\n\s+\[text\* full-name placeholder "Ivan Petrov"\] <\/label>/)
  assert.match(form, /\[email\* email placeholder "you@company.ru"\]/)
  assert.match(form, /\[tel phone placeholder "\+7 \(___\) ___-__-__"\]/)
  assert.match(form, /<legend>Request type <span class="wtb-form__required" aria-hidden="true">\*<\/span><\/legend>\n\s+\[radio request-type use_label_element default:1 "Construction quote" "Site survey"\]/)
  assert.match(form, /\[textarea\* project-description placeholder "Location, floor area…"\]/)
  assert.match(form, /\[file file-1 filetypes:pdf\|dwg\|zip limit:25mb\]/)
  assert.match(form, /\[acceptance acceptance-1\] I consent to the processing of personal data\. \[\/acceptance\]/)
  assert.match(form, /\[submit "Send request"\] <button type="reset" class="wtb-form__reset">Clear form<\/button>/)
  assert.deepEqual(fields.map((f) => f.name), ['full-name', 'company', 'email', 'phone', 'request-type', 'project-description', 'file-1', 'acceptance-1'])
  // The source lays the four short fields on a two-column grid: they come wrapped as one, so the
  // theme's CSS can draw the same grid around the live controls.
  assert.match(form, /<div class="wtb-form__grid wtb-form__grid--2">\n<label class="wtb-form__field"> Full name <span class="wtb-form__required" aria-hidden="true">\*<\/span>[\s\S]*\[tel phone[^\]]*\] <\/label>\n<\/div>\n\n<fieldset/)
  assert.deepEqual(fields.map((f) => f.grid ?? null), [2, 2, 2, 2, null, null, null, null])
  const ru = cf7Form({ fields: [{ kind: 'text', label: 'Имя и фамилия', required: true }, { kind: 'text', label: 'Компания' }], submit: 'Отправить' })
  assert.deepEqual(ru.fields.map((f) => f.name), ['text-1', 'text-2'])
  assert.match(ru.form, /\[submit "Отправить"\]/)
  assert.doesNotMatch(ru.form, /type="reset"/)
  assert.match(cf7MailBody(fields), /^Full name: \[full-name\]\nCompany: \[company\]/)
  assert.doesNotMatch(cf7MailBody(fields), /acceptance/)
})

test('cf7FormText: what the form prints — labels, options, hints, buttons — for a coverage check', () => {
  const { form } = cf7Form(sourceForm(card))
  const t = cf7FormText(form)
  for (const run of ['Full name *', 'Construction quote', 'Site survey', 'PDF, DWG, ZIP · 25 MB max', 'I consent to the processing of personal data.', 'Send request', 'Clear form'])
    assert.ok(t.includes(run), run)
  assert.doesNotMatch(t, /\[|\]|placeholder|full-name/)
})

test('embedShortcode: the run of controls becomes the shortcode; the note before and the aside stay', () => {
  const { html, embedded } = embedShortcode(card, '[contact-form-7 id="7" title="Contact"]')
  assert.equal(embedded, true)
  assert.doesNotMatch(html, /<input|<textarea|<button|cursor: pointer|dashed/)
  assert.match(html, /id="note"[^]*Fields marked \* are required\.[^]*\n\[contact-form-7 id="7" title="Contact"\]\n\s*<\/div>\s*<div id="aside">/)
  assert.equal((html.match(/contact-form-7/g) ?? []).length, 1)
  const none = embedShortcode('<section><p>Nothing</p></section>', '[x]')
  assert.deepEqual(none, { html: '<section><p>Nothing</p></section>', embedded: false })
})

// Two cards, each with its own form, and a line between them: a quote form and a support form.
const twoForms = `<section><h2>Talk to us</h2><div id="grid">
  <div id="sales"><h3>Sales</h3><div><label>Name *</label><input type="text" placeholder="Your name"></div><div><label>Email *</label><input type="email"></div><div><button>Get a quote</button><button type="reset">Clear</button></div></div>
  <p id="between">Or, for support:</p>
  <div id="support"><h3>Support</h3><div><label>Order number</label><input type="text"></div><div><label>Issue *</label><textarea></textarea></div><button>Open a ticket</button></div>
</div></section>`

test('sourceForms: two drawn forms are two forms, each with its own fields, buttons and card', () => {
  const forms = sourceForms(twoForms)
  assert.equal(forms.length, 2)
  assert.deepEqual(forms.map((f) => f.fields.map((x) => x.label)), [['Name', 'Email'], ['Order number', 'Issue']])
  assert.deepEqual(forms.map((f) => [f.submit, f.reset]), [['Get a quote', 'Clear'], ['Open a ticket', null]])
  assert.deepEqual(forms.map((f) => f.region.el.id), ['sales', 'support'])
  // sourceForm (what the seeder builds the CF7 form from) is the first form, not both merged.
  assert.deepEqual(sourceForm(twoForms).fields.map((x) => x.label), ['Name', 'Email'])
  // Two <form> elements split even with no button between them; a button before any field stays with the form.
  const tagged = sourceForms('<div><form><button type="button">Tab</button><input name="a"></form><form><input name="b"><input type="submit" value="Go"></form></div>')
  assert.deepEqual(tagged.map((f) => [f.fields.length, f.submit]), [[1, 'Tab'], [1, 'Go']])
})

test('embedShortcode: with two drawn forms, the first card holds the shortcode, the rest of the page stays, and the second is named in left', () => {
  const { html, embedded, left } = embedShortcode(twoForms, '[contact-form-7 id="7" title="Contact"]')
  assert.equal(embedded, true)
  assert.equal((html.match(/contact-form-7/g) ?? []).length, 1)
  assert.match(html, /<div id="sales"><h3>Sales<\/h3>\n\[contact-form-7 id="7" title="Contact"\]\n<\/div>/)
  assert.match(html, /<p id="between">Or, for support:<\/p>/, 'what stands between the forms is kept')
  assert.match(html, /<h2>Talk to us<\/h2>/)
  assert.match(html, /<div id="support"><h3>Support<\/h3>[^]*<textarea><\/textarea>[^]*Open a ticket/, 'the second form is left as drawn')
  assert.deepEqual(left, [{ submit: 'Open a ticket', fields: ['Order number', 'Issue'] }])
  assert.deepEqual(embedShortcode(card, '[x]').left, [], 'one form: nothing left')
})

test('sourceForms: a send button drawn as type="button" still ends its form; one beside a field in its row does not', () => {
  // No <form> element and both buttons type="button", as a canvas export draws them.
  const cards = `<section><div id="a"><h3>Sales</h3><div><label>Name</label><input></div><div><button type="button">Send</button></div></div>
<p id="mid">Or, for support:</p>
<div id="b"><h3>Support</h3><div><label>Issue</label><textarea></textarea></div><button type="button">Open</button></div></section>`
  const forms = sourceForms(cards)
  assert.deepEqual(forms.map((f) => [f.region.el.id, f.submit, f.fields.map((x) => x.label)]), [['a', 'Send', ['Name']], ['b', 'Open', ['Issue']]])
  const { html, left } = embedShortcode(cards, '[cf7]')
  assert.match(html, /<div id="a"><h3>Sales<\/h3>\n\[cf7\]\n<\/div>/)
  assert.match(html, /<p id="mid">Or, for support:<\/p>/, 'the content between the forms stays')
  assert.match(html, /<div id="b"><h3>Support<\/h3>[^]*<textarea>/)
  assert.deepEqual(left, [{ submit: 'Open', fields: ['Issue'] }])
  // A button inside a field's row is part of that field, not the end of the form.
  const inline = sourceForms('<div><div><label>Password</label><input type="password"><button type="button">Show</button></div><div><label>Email</label><input type="email"></div><button>Sign up</button></div>')
  assert.equal(inline.length, 1)
  assert.deepEqual(inline[0].fields.map((x) => x.label), ['Password', 'Email'])
})
