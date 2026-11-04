// look_logo(files, checks): an independent reviewer (a vision model, injected as ctx.review) sees only the images and
// the checks, and answers every check for every image, pass or fail with a reason. A transparent image is shown on
// the ground given with it (as it will sit on the site); without one it is shown on a mid grey. An image under 128 px
// is enlarged by a whole factor with nearest-neighbour sampling, so its real pixels are shown.
// Ported from the approved lab tool look-logo; the model call is ctx.review, the lab's OpenRouter fetch is gone.
import path from 'node:path'
import { BrandToolError, imageBytes } from './common.js'
import { renderLooks } from './look-logo-render.js'

/** "path@#ground" strings and {file, ground} objects, both accepted. */
const itemsOf = (files) =>
  files.map((f) => {
    if (typeof f === 'string') {
      const [file, ground] = f.split('@')
      return { file: file.trim(), ground: ground?.trim() ?? '#808080' }
    }
    return { file: f?.file, ground: f?.ground ?? '#808080' }
  })

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
    'A separate reviewer looks at images, each on the ground you give it, and answers each check pass or fail with a reason. You never judge your own result.',
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
        description: 'Optional reference image shown last and not judged.'
      }
    },
    required: ['files', 'checks'],
    additionalProperties: false
  },
  async run(input, ctx) {
    const { checks, original } = input
    if (!Array.isArray(input.files) || !input.files.length || !Array.isArray(checks) || !checks.length)
      throw new BrandToolError('usage: look_logo(files, checks): both must be non-empty lists')
    if (typeof ctx.review !== 'function') throw new BrandToolError('no reviewer is available in this run')
    const items = itemsOf(input.files)
    for (const it of items) if (!it.file) throw new BrandToolError('every entry of files needs a file')

    const label = (it, i) => `image ${i + 1} = ${path.posix.basename(it.file)} shown on ${it.ground}`
    const question = [
      'You review images made for a website logo. You did not make them. Judge only what you see.',
      `There are ${items.length} image(s), in order: ${items.map(label).join('; ')}.`,
      ...(original
        ? ['After them comes one more image, the ORIGINAL material, for reference only: do not judge it.']
        : []),
      'Answer every check for every image, pass or fail, with one short reason naming what you see. Be strict: a',
      'misspelled, missing or added letter or word, a symbol cut off, ground or stray marks left around a shape fail.',
      'Letter case does not matter: a name set in capitals only is the same name.',
      'Reply with JSON only: {"images":[{"image":1,"checks":[{"check":"<check text>","verdict":"pass|fail","reason":"..."}]}]}',
      'Checks:',
      ...checks.map((c, i) => `${i + 1}. ${c}`)
    ].join('\n')

    const images = await renderLooks(items, ctx.files)
    if (original) images.push(imageBytes(ctx.files, original))

    const reply = await ctx.review({ images, question })
    const parsed = parseAnswer(reply?.answer)
    const cost = reply?.cost ?? null
    if (!parsed?.images)
      throw new BrandToolError('reviewer gave no parsable answer', {
        cost,
        text: String(
          typeof reply?.answer === 'string' ? reply.answer : JSON.stringify(reply?.answer ?? null)
        ).slice(0, 400)
      })

    const results = items.map((it, i) => {
      const got = parsed.images.find((x) => Number(x.image) === i + 1)?.checks ?? []
      const verdict = got.length === checks.length && got.every((c) => c.verdict === 'pass') ? 'pass' : 'fail'
      return {
        file: it.file,
        ground: it.ground,
        verdict,
        checks: got,
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
      results
    }
  }
}
