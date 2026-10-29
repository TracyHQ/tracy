import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { declaredButtonSlots } from 'website-opportunities/domain/declared-button-plan.mjs'
import { ctaBandValues } from '../src/sites/brief-engines/cta-band-messages.js'
import { checkCtaBands } from '../src/opportunities-build/cta-band-check.js'

// The released JA Boxing 1.0.8 map: its home band (module-161) shipped "Free 7-day trial" / "at 5-star clubs" over a
// "SIGN UP FOR FREE TRIAL" button, and a coaching club build showed the button alone on an empty ground (#189 item 7).
const map = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
      import.meta.url
    ),
    'utf8'
  )
)

/** A text model double: answers the band prompt through `say`, and records what it was asked. */
function bandModel(say) {
  const asked = []
  return {
    asked,
    chat: async ({ messages }) => {
      const input = JSON.parse(messages[1].content)
      asked.push(input)
      return JSON.stringify({
        values: Object.fromEntries(input.slots.map((s) => [s.key, say(s, asked.length)]))
      })
    }
  }
}

for (const [trade, name, label, description] of [
  ['pottery studio', 'Clayhouse Studio', 'Book a class', 'A small pottery studio teaching wheel throwing to beginners.'],
  ['dental clinic', 'Brightside Dental', 'Book a check-up', 'A family dental clinic for check-ups and cleaning.']
]) {
  const brief = {
    business: { name },
    primaryAction: { label, channel: 'contact', href: null, basis: 'sourced', evidence: [] }
  }
  const sitePlan = {
    brand: { name: { value: name }, description: { value: description } },
    slots: declaredButtonSlots(brief, map),
    honesty: {}
  }
  // What the build wrote before this step: the declared button words, and an empty pin over the band's claim slots.
  const written = { 'module-161.0': '', 'module-161.1': '', 'module-161.3': label }

  test(`${trade}: the home band of JA Boxing 1.0.8 gets a heading and line written for its primary action`, async () => {
    assert.equal(
      sitePlan.slots.find((s) => s.key === 'module-161.3')?.value,
      label,
      'the band button carries the business action'
    )
    const model = bandModel((s) =>
      s.part === 'heading' ? `Ready to ${s.band.action.toLowerCase()}?` : `${name} is glad to welcome you.`
    )
    const out = await ctaBandValues({
      contentMap: map,
      slots: map.slots,
      sitePlan,
      written,
      briefText: description,
      business: { name, description },
      model
    })
    assert.deepEqual(out.values, {
      'module-161.0': `Ready to ${label.toLowerCase()}?`,
      'module-161.1': `${name} is glad to welcome you.`
    })
    assert.deepEqual(out.removed, [])
    assert.equal(model.asked.length, 1)
    assert.deepEqual(
      model.asked[0].slots.map((s) => [s.key, s.part, s.band.action]),
      [
        ['module-161.0', 'heading', label],
        ['module-161.1', 'line', label]
      ]
    )
    assert.equal(model.asked[0].business.description, description)
  })

  test(`${trade}: an invented offer or number is asked again, never written`, async () => {
    const model = bandModel((s, round) =>
      round === 1
        ? s.part === 'heading'
          ? 'Free 7-day trial'
          : 'at 5-star clubs'
        : s.part === 'heading'
          ? 'Your visit starts here'
          : `Choose ${label.toLowerCase()} below.`
    )
    const out = await ctaBandValues({
      contentMap: map,
      slots: map.slots,
      sitePlan,
      written,
      briefText: description,
      business: { name, description },
      model
    })
    assert.equal(model.asked.length, 2)
    assert.match(model.asked[1].fix, /module-161\.0 \(number\)/)
    assert.equal(out.values['module-161.0'], 'Your visit starts here')
    assert.equal(out.values['module-161.1'], `Choose ${label.toLowerCase()} below.`)
  })

  test(`${trade}: a band whose message cannot be written comes off whole, never a lone button`, async () => {
    const out = await ctaBandValues({
      contentMap: map,
      slots: map.slots,
      sitePlan,
      written: { ...written, 'module-161.0': 'Free 7-day trial' },
      briefText: description,
      business: { name, description },
      model: bandModel(() => '')
    })
    assert.deepEqual(out.values, {})
    assert.deepEqual(out.removed, [{ entity: 'module-161', reason: 'cta-band-without-message' }])
  })

  test(`${trade}: a heading that stands keeps the band; a line that cannot be written is emptied, not left in demo words`, async () => {
    const out = await ctaBandValues({
      contentMap: map,
      slots: map.slots,
      sitePlan,
      written,
      briefText: description,
      business: { name, description },
      model: bandModel((s) => (s.part === 'heading' ? 'Come and see us' : 'Save on every visit'))
    })
    assert.deepEqual(out.values, { 'module-161.0': 'Come and see us' })
    assert.deepEqual(
      out.blanks.map((s) => s.key),
      ['module-161.1']
    )
  })

  test(`${trade}: the build check reports a kept band that shows a button with no message`, () => {
    const band = (inner) =>
      `<html><body><div id="Mod161"><div class="acm-cta" style="background-image:url(/a.jpg)">${inner}</div></div></body></html>`
    const button = `<div class="btn-action"><a class="btn" href="/contact">${label}</a></div>`
    const lone = checkCtaBands({ pages: [{ path: '/', status: 200, html: band(button) }], contentMap: map, sitePlan })
    assert.deepEqual(
      lone.map((f) => [f.entity, f.reason, f.severity]),
      [['module-161', 'cta-band-lone-button', 'major']]
    )
    const whole = band(`<h2>Ready to ${label.toLowerCase()}?</h2><p>${name} is glad to welcome you.</p>${button}`)
    assert.deepEqual(checkCtaBands({ pages: [{ path: '/', status: 200, html: whole }], contentMap: map, sitePlan }), [])
    assert.deepEqual(
      checkCtaBands({ pages: [{ path: '/', status: 200, html: '<html><body></body></html>' }], contentMap: map, sitePlan }),
      [],
      'a band taken off is not reported'
    )
  })
}
