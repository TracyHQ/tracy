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

// CodeQL polynomial-redos (release 2026-11-05): a line's days and its ranges are read in one pass.
test('days and ranges read as before; a long run of spaces, tabs or dashes reads fast and gives no verdict', async () => {
  const { weekOf } = await import('../domain/opening-hours.mjs')
  const week = (lines) => ((w) => (w ? Object.fromEntries(w) : w))(weekOf(lines))
  assert.deepEqual(week(['Monday: 9:00 AM – 5:00 PM']), { mo: '540-1020' })
  assert.deepEqual(
    week(['Mo-Fr 09:00-17:00']),
    week([
      'Monday: 9 AM – 5 PM',
      'Tuesday: 9 AM – 5 PM',
      'Wednesday: 9am-5pm',
      'Thursday: 9:00-17:00',
      'Friday: 9 am - 5 pm'
    ])
  )
  assert.deepEqual(week(['Saturday:   5:00 – 10:00 PM, 11:00 AM – 2:00 PM']), { sa: '1020-1320,660-840' })
  assert.equal(weekOf(['Monday: 9-10-11']), null)
  for (const line of [
    `A${' '.repeat(50_000)}`,
    `A${' '.repeat(50_000)}\n`,
    `A\t${'\t'.repeat(50_000)}\n`,
    `Monday: !${'\t'.repeat(50_000)}x`,
    `Monday: !-${'!-!'.repeat(30_000)}`
  ]) {
    const t = performance.now()
    assert.equal(weekOf([line]), null)
    assert.ok(performance.now() - t < 500, `${JSON.stringify(line.slice(0, 12))} read in one pass`)
  }
})
