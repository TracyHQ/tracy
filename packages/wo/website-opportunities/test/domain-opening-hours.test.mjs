import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoursDisagree } from '../domain/opening-hours.mjs'

test('schema.org and Google lines for the same week agree', () => {
  assert.equal(
    hoursDisagree(
      ['Mo-Fr 11:00-14:00', 'Mo-Fr 17:00-22:00', 'Sa,Su 00:00-23:59'],
      [
        'Monday: 11:00 AM – 2:00 PM, 5:00 – 10:00 PM',
        'Friday: 11:00 AM – 2:00 PM, 5:00 – 10:00 PM',
        'Sunday: Open 24 hours'
      ]
    ),
    false
  )
  assert.equal(hoursDisagree(['Monday,Tuesday 09:00:00-17:00:00'], ['Tuesday: 9 AM – 5 PM']), false)
})

test('different hours on a day both name disagree; a closed day too', () => {
  assert.equal(hoursDisagree(['Mo-Su 09:00-17:00'], ['Monday: 9:00 AM – 12:00 PM']), true)
  assert.equal(hoursDisagree(['Mo-Su 09:00-17:00'], ['Tuesday: Closed']), true)
  assert.equal(hoursDisagree(['Mo-Su 18:00-02:00'], ['Saturday: 6:00 PM – 2:00 AM']), false)
})

test('days only one source names, and lines that cannot be read, give no verdict', () => {
  assert.equal(hoursDisagree(['Mo 09:00-17:00'], ['Tuesday: 10:00 AM – 1:00 PM']), false)
  assert.equal(hoursDisagree(['Mo-Su 09:00-17:00'], ['Th\u1ee9 Hai: 10:00\u201313:00']), false)
  assert.equal(hoursDisagree(['Open from 7pm'], ['Monday: 9:00 AM – 5:00 PM']), false)
})
