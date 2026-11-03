import assert from 'node:assert/strict'
import { test } from 'node:test'
import { breaks, check, copy, slotOf } from './_site-copy-check.mjs'

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
