import assert from 'node:assert/strict'
import { test } from 'node:test'
import { breaks, check, copy, ruleOf, slotOf } from './_site-copy-check.mjs'

const EM = String.fromCharCode(0x2014)
const EN = String.fromCharCode(0x2013)
const PAD = 'Small group classes run every day and every member is welcome. '
const status = (c, id) => check(c).rules.find((x) => x.id === id).status

test('W04 fails numbers, times, prices, phones, emails and links the cited facts do not hold', () => {
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').text += ' Join for 40 dirhams.'
    },
    /block-2\.2.*40/
  )
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').text = `${PAD}Open 05:30 to 21:00, call +000 555 0100.`
    },
    /05:30/
  )
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').text = `${PAD}Call +000 555 0199 to reserve.`
    },
    /0199/
  )
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').text = `${PAD}Write to desk@quay-fitness.example to reserve.`
    },
    /desk@quay-fitness\.example/
  )
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').text = `${PAD}Book at https://quay-fitness.example/book to reserve.`
    },
    /https:\/\/quay-fitness\.example\/book/
  )
  breaks(
    'W04',
    (c) => {
      slotOf(c, 'block-2.2').factIds = ['f-nope']
    },
    /f-nope/
  )
  // phone punctuation and spacing do not matter
  const c = copy()
  slotOf(c, 'block-2.2').text = `${PAD}Call +000-555-0100 to reserve your place, we open at 06:00.`
  assert.equal(status(c, 'W04'), 'pass')
})

test('W05 fails a quoted review that is not an exact passage of a review in the brief', () => {
  breaks(
    'W05',
    (c) => {
      slotOf(c, 'block-3.5').text =
        '"The coaches know every member by name and the classes are always packed."'
    },
    /block-3\.5/
  )
  const c = copy()
  slotOf(c, 'block-3.5').text = 'Members say "the classes never feel crowded" and we agree with them.'
  assert.equal(status(c, 'W05'), 'pass')
})

test('W06 fails a sentence repeated or nearly repeated anywhere on the site', () => {
  breaks(
    'W06',
    (c) => {
      slotOf(c, 'block-3.6').text = 'Early sessions are calm. Small group classes run every day.'
    },
    /block-3\.6.*block-2\.2/
  )
  breaks(
    'W06',
    (c) => {
      c.seo[1].description =
        'Meet us: coaches who know your name, and the strength coach who leads the sessions every day.'
      c.seo[0].description = 'Coaches who know your name, open every day but Sunday.'
    },
    /seo|page-about/
  )
  const c = copy()
  c.alts[0].text = 'Small group classes run every day'
  assert.equal(status(c, 'W06'), 'pass')
})

test('W06 lets a fact value repeat: phone, address and hours run through the site', () => {
  const c = copy()
  slotOf(c, 'block-3.6').text = 'Early sessions are the calm ones. +000 555 0100'
  c.pages[1].body = ['Ask at the desk. +000 555 0100']
  c.pages[0].body.push('The studio is at 12 Harbour Row, Quay District, Example City.')
  c.seo[1].description = 'Meet the coach: 12 Harbour Row, Quay District, Example City.'
  c.seo[2].description = 'We are open 06:00 to 21:00, Monday to Saturday, if you need us.'
  assert.equal(status(c, 'W06'), 'pass', JSON.stringify(check(c).rules.find((x) => x.id === 'W06').failures))
})

test('W06 still fails prose repeated around a fact value or with no fact in it', () => {
  breaks(
    'W06',
    (c) => {
      c.pages[1].body = ['Call +000 555 0100 to reserve your place before you come.']
    },
    /notFound.*block-2\.2/
  )
  breaks(
    'W06',
    (c) => {
      slotOf(c, 'block-3.6').text = 'Our coaches bring a patient teaching style to every class.'
      c.pages[1].body = ['Here too, coaches bring a patient teaching style to every class.']
    },
    /notFound.*block-3\.6/
  )
})

test('W07 fails a demo sentence or a demo proper name left in the copy', () => {
  breaks(
    'W07',
    (c) => {
      slotOf(c, 'block-3.6').text = 'Another long demo review sentence from the template sits right here.'
    },
    /block-3\.6.*demo sentence/
  )
  breaks(
    'W07',
    (c) => {
      slotOf(c, 'block-5.1').text = 'Marta Quill'
    },
    /block-5\.1/
  )
  breaks(
    'W07',
    (c) => {
      c.seo[0].title = 'Demo Gym, group classes'
    },
    /page-home.*Demo Gym/
  )
  breaks(
    'W07',
    (c) => {
      c.alts[0].text = 'A coach at demo_gym'
    },
    /demo_gym|Demo Gym|demo gym/i
  )
})

test('W08 fails phrases from the avoid, forbidden and missing lists', () => {
  breaks(
    'W08',
    (c) => {
      slotOf(c, 'block-3.1').text = 'World-class members'
    },
    /block-3\.1.*world-class/i
  )
  breaks(
    'W08',
    (c) => {
      c.seo[0].description = 'Small group classes with a money back guarantee for every new member.'
    },
    /money back guarantee/
  )
  breaks(
    'W08',
    (c) => {
      slotOf(c, 'block-3.1').text = 'Try a Free Trial'
    },
    /free trial/
  )
  const c = copy()
  slotOf(c, 'block-3.1').text = 'Worldwide members'
  assert.equal(status(c, 'W08'), 'pass')
})

test('W09 fails missing or long alt, title and description, and duplicate titles', () => {
  breaks(
    'W09',
    (c) => {
      c.alts = []
    },
    /block-2\.f1.*alt/
  )
  breaks(
    'W09',
    (c) => {
      c.alts[0].text = 'a'.repeat(126)
    },
    /126.*125/
  )
  breaks(
    'W09',
    (c) => {
      c.seo = c.seo.filter((s) => s.page !== 'page-about')
    },
    /page-about.*seo/
  )
  breaks(
    'W09',
    (c) => {
      c.seo[0].title = 'T'.repeat(61)
    },
    /61.*60/
  )
  breaks(
    'W09',
    (c) => {
      c.seo[0].description = 'D'.repeat(161)
    },
    /161.*160/
  )
  breaks(
    'W09',
    (c) => {
      c.seo[1].title = c.seo[0].title
    },
    /same title/
  )
})

test('W10 fails sentences that describe the page or section itself', () => {
  breaks(
    'W10',
    (c) => {
      slotOf(c, 'block-3.1').text = 'This section shows our members'
    },
    /block-3\.1.*this section/i
  )
  breaks(
    'W10',
    (c) => {
      slotOf(c, 'block-3.6').text = 'Here you will find the early sessions of the club.'
    },
    /here you will find/i
  )
  breaks(
    'W10',
    (c) => {
      c.seo[1].description = 'Made to show the shape of a lesson with our coach.'
    },
    /shape of/i
  )
  const c = copy()
  slotOf(c, 'block-3.1').text = 'Our members'
  assert.equal(status(c, 'W10'), 'pass')
})

test('W11 fails long dashes in any written text', () => {
  breaks(
    'W11',
    (c) => {
      slotOf(c, 'block-3.1').text = `Members ${EM} our best`
    },
    /block-3\.1/
  )
  breaks(
    'W11',
    (c) => {
      c.alts[0].text = `A coach ${EN} lifting`
    },
    /block-2\.f1/
  )
  breaks(
    'W11',
    (c) => {
      c.seo[0].title = `Quay ${EM} classes`
    },
    /page-home/
  )
})

test('W04 checks details in pages entries against every fact of the brief', () => {
  breaks(
    'W04',
    (c) => {
      c.pages[1].body = ['Ask at the desk or call +000 555 0188.']
    },
    /notFound.*0188/
  )
  const c = copy()
  c.pages[1].body = ['Ask at the desk or call +000 555 0100.']
  assert.equal(status(c, 'W04'), 'pass')
})

test('W06 compares pages entries with the rest of the site', () => {
  breaks(
    'W06',
    (c) => {
      c.pages[1].body = ['Small group classes run every day, so come back soon.']
    },
    /notFound.*block-2\.2/
  )
})

test('W08, W10 and W11 read pages entries', () => {
  breaks(
    'W08',
    (c) => {
      c.pages[0].body = ['Every member gets a free trial.']
    },
    /legal:privacy.*free trial/
  )
  breaks(
    'W10',
    (c) => {
      c.pages[1].body = ['This page shows what an error looks like.']
    },
    /notFound.*this page/i
  )
  breaks(
    'W11',
    (c) => {
      c.pages[0].title = `Privacy ${EM} policy`
    },
    /legal:privacy/
  )
})

test('W09 asks the created legal page for a seo entry but notFound for none', () => {
  assert.ok(!copy().seo.some((s) => s.page === 'notFound'))
  assert.equal(status(copy(), 'W09'), 'pass')
  const w09 = check(copy()).rules.find((x) => x.id === 'W09')
  assert.ok(
    w09.notes.some((n) => /notFound/.test(n) && /no seo/i.test(n)),
    w09.notes.join('\n')
  )
  breaks(
    'W09',
    (c) => {
      c.seo = c.seo.filter((s) => s.page !== 'legal:privacy')
    },
    /legal:privacy.*seo/
  )
})

test('W11 reports a long dash in a planner label as a note, not a failure', () => {
  const c = copy()
  slotOf(c, 'block-1.1').text = `Join ${EM} us`
  const r = check(c)
  // the label differs from the plan's words, which is W02's business; W11 itself must not fail
  const w11 = r.rules.find((x) => x.id === 'W11')
  assert.equal(w11.status, 'pass')
  assert.deepEqual(w11.failures, [])
  assert.ok(
    w11.notes.some((n) => /block-1\.1/.test(n) && /planner label, return to planner/.test(n)),
    w11.notes.join('\n')
  )
})

test('W13 fails a created page title written as a browser title, and passes an on-page heading', () => {
  const page = (c) => c.pages.find((p) => p.page === 'legal:privacy')
  breaks(
    'W13',
    (c) => {
      page(c).title = 'Privacy | Acme'
    },
    /legal:privacy: title "Privacy \| Acme" holds a " \| " separator/
  )
  breaks(
    'W13',
    (c) => {
      page(c).title = 'Privacy policy, Quay Fitness Studio'
    },
    /legal:privacy: title .* ends with the business name/
  )
  const c = copy()
  page(c).title = 'Privacy policy'
  assert.equal(ruleOf(c, 'W13').status, 'pass')
})
