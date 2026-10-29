import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { checkDemoLeftovers } from 'website-opportunities/domain/demo-leftovers.mjs'

const reviews = [
  { author: 'Mara Vale', text: 'The bread was fresh. The team explained the ingredients carefully.' },
  { author: 'Theo Brook', text: 'The repair was careful. The team explained the work clearly.' }
]
const check = (html, review) =>
  runLeftoverCheck({
    readPage: async (path) => (path === '/' ? { status: 200, html } : { status: 404, html: '' }),
    check: checkDemoLeftovers,
    brief: { business: { name: 'Fictional Workshop' }, googlePlace: { reviews: [review] } },
    contentMap: { slots: [] }
  })

for (const [i, trade] of ['bakery', 'garage'].entries()) {
  const review = reviews[i]
  test(`${trade}: the final check rejects a clipped review and attribution borrowed from another card`, async () => {
    const clipped = await check(
      `<article><blockquote>${review.text.split('.')[0]}...</blockquote><cite>${review.author}</cite><p>Google review</p></article>`,
      review
    )
    assert.equal(clipped.pass, false)
    assert.ok(clipped.findings.some((f) => f.kind === 'review-integrity'))
    const missing = await check(
      `<section><article><blockquote>${review.text}</blockquote></article><article><blockquote>Another guest's words.</blockquote><cite>${review.author}</cite><p>Google review</p></article></section>`,
      review
    )
    assert.equal(missing.pass, false)
    assert.ok(missing.findings.some((f) => f.reason === 'missing-review-author'))
  })
  test(`${trade}: a whole review with its own author and platform passes`, async () => {
    const result = await check(
      `<article><blockquote>${review.text}</blockquote><cite>${review.author}</cite><p>Google review</p></article>`,
      review
    )
    assert.equal(result.pass, true, JSON.stringify(result.findings))
  })
  test(`${trade}: plain module markup preserves attribution beside punctuation and rejects a missing platform`, async () => {
    const valid = await check(
      `<div class="hero"><div class="hero-desc">${review.text}</div><div>${review.author}, Google review</div></div>`,
      review
    )
    assert.equal(valid.pass, true, JSON.stringify(valid.findings))
    const bad = await check(
      `<div class="hero"><div class="hero-desc">${review.text}</div><div>${review.author}</div></div>`,
      review
    )
    assert.equal(bad.pass, false)
    assert.ok(bad.findings.some((f) => f.reason === 'missing-review-platform'))
  })
}

for (const [i, trade] of ['bakery', 'garage'].entries())
  test(`${trade}: the review's own leading sentences pass; words cut inside a sentence do not`, async () => {
    const review = reviews[i]
    const first = `${review.text.split('. ')[0]}.`
    const excerpt = await check(
      `<article><blockquote>${first}</blockquote><cite>${review.author}</cite><p>Google review</p></article>`,
      review
    )
    assert.equal(excerpt.pass, true, JSON.stringify(excerpt.findings))
    const cut = await check(
      `<article><blockquote>${review.text.slice(0, review.text.indexOf('. ') + 12)}</blockquote><cite>${review.author}</cite><p>Google review</p></article>`,
      review
    )
    assert.equal(cut.pass, false)
    assert.ok(cut.findings.some((f) => f.reason === 'not-whole-sourced-review'))
  })
