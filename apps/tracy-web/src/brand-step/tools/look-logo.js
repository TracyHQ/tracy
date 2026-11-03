// look_logo(files, checks): an independent reviewer (a vision model, injected as ctx.review) sees only the images and
// the checks, and answers every check for every image, pass or fail with a reason. A transparent image is shown on
// the ground given with it (as it will sit on the site); without one it is shown on a mid grey. An image under 128 px
// is enlarged by a whole factor with nearest-neighbour sampling, so its real pixels are shown.
// Blind mode (decision 15), for an icon only: the reviewer is NOT told the business: no file names, no business words
// in the text it gets (the tool refuses checks that contain a word of the business type or of a synonym). All files
// must be the same icon (on different grounds). Besides the checks, the reviewer names the one business type the icon
// suggests and its top 3 guesses. Code (../blind-match.js, no model) compares them with the business type and the
// synonyms; the verdict is added to every image as one more check "blind: ...". The reviewer sees the icon AT 128 PX,
// the size a visitor sees in the site header: trimmed, contained in a 128 x 128 square (4% margin, lanczos3),
// flattened on the image's ground, shown 2x with nearest-neighbour; the text states the real size.
// Ported from the approved lab tool look-logo; the model call is ctx.review, the lab's OpenRouter fetch is gone.
import path from 'node:path'
import { blindVerdict, key, termProblems } from '../blind-match.js'
import { BrandToolError, imageBytes } from './common.js'
import { BLIND_SIZE, BLIND_ZOOM, renderLooks } from './look-logo-render.js'

/** "path@#ground" strings and {file, ground} objects, both accepted. */
const itemsOf = (files) =>
  files.map((f) => {
    if (typeof f === 'string') {
      const [file, ground] = f.split('@')
      return { file: file.trim(), ground: ground?.trim() ?? '#808080' }
    }
    return { file: f?.file, ground: f?.ground ?? '#808080' }
  })

const list = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [])

function parseAnswer(answer) {
  if (answer && typeof answer === 'object') return answer
  try {
    return JSON.parse(String(answer ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''))
  } catch {
    return null
  }
}

export const tool = {
  name: 'look_logo',
  description:
    'A separate reviewer looks at images, each on the ground you give it, and answers each check pass or fail with a reason. You never judge your own result. Blind mode (blind, businessType, accept, neighbour, neighbourAccept) is for an icon only: the reviewer is not told the business and sees the icon at 128 px; code compares its 3 guesses with the business type. Your other checks must not name the business.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            ground: { type: 'string', description: 'The ground it sits on, #rrggbb.' }
          },
          required: ['file'],
          additionalProperties: false
        }
      },
      checks: { type: 'array', minItems: 1, items: { type: 'string' } },
      original: {
        type: 'string',
        description: 'Optional reference image shown last and not judged. Not with blind.'
      },
      blind: { type: 'boolean' },
      businessType: { type: 'string' },
      accept: { type: 'array', items: { type: 'string' } },
      neighbour: { type: 'string' },
      neighbourAccept: { type: 'array', items: { type: 'string' } }
    },
    required: ['files', 'checks'],
    additionalProperties: false
  },
  async run(input, ctx) {
    const { checks, original, blind = false } = input
    if (!Array.isArray(input.files) || !input.files.length || !Array.isArray(checks) || !checks.length)
      throw new BrandToolError('usage: look_logo(files, checks): both must be non-empty lists')
    if (typeof ctx.review !== 'function') throw new BrandToolError('no reviewer is available in this run')
    const items = itemsOf(input.files)
    for (const it of items) if (!it.file) throw new BrandToolError('every entry of files needs a file')

    let terms = null
    if (blind) {
      if (typeof input.businessType !== 'string' || !input.businessType.trim())
        throw new BrandToolError('blind needs businessType (the business type from the brief)')
      if (original) throw new BrandToolError('blind: no original (the material may show the name)')
      terms = {
        businessType: input.businessType.trim(),
        accept: list(input.accept),
        neighbour:
          typeof input.neighbour === 'string' && input.neighbour.trim() ? input.neighbour.trim() : null,
        neighbourAccept: list(input.neighbourAccept)
      }
      const probs = termProblems(terms)
      if (probs.length) throw new BrandToolError('blind terms refused', { problems: probs })
      const secret = new Set([terms.businessType, ...terms.accept].flatMap(key))
      const leak = checks.filter((c) => key(c).some((w) => secret.has(w)))
      if (leak.length)
        throw new BrandToolError('blind: a check names the business; the reviewer must not be told', {
          checks: leak
        })
    }

    const label = (it, i) =>
      blind
        ? `image ${i + 1} shown on ${it.ground}`
        : `image ${i + 1} = ${path.posix.basename(it.file)} shown on ${it.ground}`
    const question = [
      'You review images made for a website logo. You did not make them. Judge only what you see.',
      `There are ${items.length} image(s), in order: ${items.map(label).join('; ')}.`,
      ...(blind
        ? [
            'All images are the same icon on different grounds. Nobody tells you what business it is for.',
            `Each image is the icon at its REAL size of ${BLIND_SIZE} x ${BLIND_SIZE} pixels (the size a visitor sees it in a website header), enlarged ${BLIND_ZOOM} times with nearest-neighbour sampling so every real pixel shows. Judge it as it looks at that size.`
          ]
        : []),
      ...(original
        ? ['After them comes one more image, the ORIGINAL material, for reference only: do not judge it.']
        : []),
      'Answer every check for every image, pass or fail, with one short reason naming what you see. Be strict: a',
      'misspelled, missing or added letter or word, a symbol cut off, ground or stray marks left around a shape fail.',
      'Letter case does not matter: a name set in capitals only is the same name.',
      ...(blind
        ? [
            'Also say, from the icon alone, what kind of business would use it as its logo symbol: "answer" is the one',
            'business type it most suggests, a short noun phrase naming one kind of business, and "guesses" your top 3',
            'business types, most likely first (the first equals the answer). Name a specific kind of business, not a broad category.',
            'Reply with JSON only: {"business":{"answer":"...","guesses":["...","...","..."],"reason":"what in the icon suggests it"},"images":[{"image":1,"checks":[{"check":"<check text>","verdict":"pass|fail","reason":"..."}]}]}'
          ]
        : [
            'Reply with JSON only: {"images":[{"image":1,"checks":[{"check":"<check text>","verdict":"pass|fail","reason":"..."}]}]}'
          ]),
      'Checks:',
      ...checks.map((c, i) => `${i + 1}. ${c}`)
    ].join('\n')

    const images = await renderLooks(items, ctx.files, blind)
    if (original) images.push(imageBytes(ctx.files, original))

    const reply = await ctx.review({ images, question, blind })
    const parsed = parseAnswer(reply?.answer)
    const cost = reply?.cost ?? null
    if (!parsed?.images || (blind && typeof parsed?.business?.answer !== 'string'))
      throw new BrandToolError('reviewer gave no parsable answer', {
        cost,
        text: String(
          typeof reply?.answer === 'string' ? reply.answer : JSON.stringify(reply?.answer ?? null)
        ).slice(0, 400)
      })

    let blindResult = null
    if (blind) {
      const guesses = Array.isArray(parsed.business.guesses)
        ? parsed.business.guesses.map(String).slice(0, 3)
        : []
      blindResult = {
        ...blindVerdict({ answer: parsed.business.answer, guesses, ...terms }),
        reviewerReason: parsed.business.reason ?? null,
        size: BLIND_SIZE,
        shown: `${BLIND_SIZE} px rendering (lanczos3), enlarged ${BLIND_ZOOM}x nearest`
      }
    }
    const blindCheck = blindResult && {
      check: `blind: the business type the icon suggests at ${BLIND_SIZE} px, unprompted`,
      verdict: blindResult.verdict,
      reason: `reviewer answered "${blindResult.answer}" (guesses: ${blindResult.guesses.join('; ')}); business type "${blindResult.businessType}"${blindResult.neighbour ? `, neighbour "${blindResult.neighbour}"` : ''}: ${
        blindResult.verdict === 'pass'
          ? `guess ${blindResult.matchedPosition} "${blindResult.matchedGuess}" matches "${blindResult.matchedTerm}"`
          : blindResult.why === 'neighbour'
            ? `no guess names it; the first names the neighbour ("${blindResult.neighbourMatched}")`
            : 'no guess names it'
      }`
    }
    const results = items.map((it, i) => {
      const got = parsed.images.find((x) => Number(x.image) === i + 1)?.checks ?? []
      const all = blindCheck ? [...got, blindCheck] : got
      const verdict = got.length === checks.length && all.every((c) => c.verdict === 'pass') ? 'pass' : 'fail'
      return {
        file: it.file,
        ground: it.ground,
        verdict,
        checks: all,
        ...(it.shownScale ? { shownScale: it.shownScale } : {}),
        ...(it.shownAt
          ? { shownAt: it.shownAt, rendering: it.rendering ?? null, shownFile: it.shownFile ?? null }
          : {})
      }
    })
    const { model, status, latencyMs } = reply
    return {
      ok: true,
      ...(model ? { model } : {}),
      ...(status ? { status } : {}),
      ...(latencyMs ? { latencyMs } : {}),
      cost,
      ...(blindResult ? { blind: blindResult } : {}),
      results
    }
  }
}
