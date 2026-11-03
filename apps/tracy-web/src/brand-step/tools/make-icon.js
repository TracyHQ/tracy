// make_icon(subject, colours): an image model draws a flat, very simple icon and code makes it exact. The tool owns
// the drawing prompt (make-icon-prompt.js); the picture comes from ctx.draw (the existing picture door, see
// ../brand-draw.js) and every drawing is checked against the run's cost cap before it goes out and logged after.
// Every failure is a TOOL FAILURE (`toolFailure: true`): per the prompt it does not consume a drawing attempt.
// Files of attempt N, in the run folder: icon/icon-N.png (the exact icon), .raw.<ext> (the model's image),
// .on-black.png, .on-white.png, .unplated.png (only with a plate), .json. Ported from the approved lab's make-icon.
import sharp from 'sharp'
import { BrandToolError, writeJson } from './common.js'
import { plateIcon } from './icon-plate.js'
import { quantizeIcon } from './icon-quantize.js'
import { iconPrompt } from './make-icon-prompt.js'

const HEX = /^#[0-9a-f]{6}$/
const EXT = { jpeg: '.jpg', webp: '.webp', gif: '.gif' }

/** The colours as the agent gave them: an array, or the lab's comma-separated string. */
function coloursOf(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  return list.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
}

const attemptNumber = (files) =>
  Math.max(
    0,
    ...files
      .list('icon/')
      .map((f) => /^icon\/icon-(\d+)\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number)
  ) + 1

/** The drawing, or a failure to report: a refusal (nothing was spent) or a call that gave nothing. */
async function drawIcon(ctx, prompt) {
  const started = Date.now()
  try {
    const drawn = await ctx.draw({ prompt, size: 1024 })
    if (!drawn?.image?.length) throw new Error('the model answered without an image')
    return { drawn, latencyMs: Date.now() - started }
  } catch (error) {
    return {
      failed: String(error?.message ?? error).slice(0, 300),
      refused: error?.refusal === true,
      latencyMs: Date.now() - started
    }
  }
}

export const tool = {
  name: 'make_icon',
  description:
    'An image model draws a flat, very simple icon and code makes it exact. You give only the subject (one short line: the business type and the one visual element that tells it apart) and the colours; the tool writes the model instructions. Returns a transparent square mark (512) in exactly the given colours, with the attempt number, the model, the share of each colour and the raw image. With two colours and a one-colour drawing, code puts the icon on a plate of the missing colour (no new drawing). Every failure is a tool failure and is not a drawing attempt.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'One short line, 200 characters at most.' },
      colours: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        items: { type: 'string', description: '#rrggbb' },
        description: 'The icon colours: 1 or 2, #rrggbb, different.'
      }
    },
    required: ['subject', 'colours'],
    additionalProperties: false
  },
  async run(input, ctx) {
    const subject = String(input?.subject ?? '').trim()
    const colours = coloursOf(input?.colours)
    if (!subject || !colours.length)
      throw new BrandToolError('usage: make_icon(subject, colours): both are required')
    if (colours.length > 2 || colours.some((c) => !HEX.test(c)))
      throw new BrandToolError('colours: 1 or 2 colours, #rrggbb')
    if (new Set(colours).size !== colours.length)
      throw new BrandToolError('colours: the two colours must differ')
    if (subject.length > 200) throw new BrandToolError('subject: one short line (200 characters at most)')
    if (typeof ctx.draw !== 'function' || !ctx.spend)
      throw new BrandToolError('no picture model is available in this run')

    const { prompt, ground } = iconPrompt(subject, colours)
    const n = attemptNumber(ctx.files)
    const stem = `icon/icon-${n}`
    // The cap is checked before the drawing goes out; a reached cap ends the call here, nothing is drawn.
    await ctx.spend.check()
    const done = await drawIcon(ctx, prompt)
    const base = { attempt: n, subject, colours, askedGround: ground.hex, prompt }
    if (done.failed) {
      if (!done.refused)
        await ctx.spend.record({
          kind: 'drawing',
          tool: 'make_icon',
          model: null,
          purpose: 'draw the icon mark',
          status: 'failed',
          latencyMs: done.latencyMs,
          error: { code: 'DRAW_FAILED', reason: done.failed }
        })
      const failure = { ok: false, error: `drawing failed: ${done.failed}`, toolFailure: true, ...base }
      writeJson(ctx.files, `${stem}.json`, failure)
      return failure
    }
    const { image, cost = null, model, provider = 'seedImage' } = done.drawn
    await ctx.spend.record({
      kind: 'drawing',
      tool: 'make_icon',
      model,
      purpose: 'draw the icon mark',
      status: 'answered',
      latencyMs: done.latencyMs,
      costUsd: cost
    })
    const format = (
      await sharp(image)
        .metadata()
        .catch(() => ({}))
    ).format
    const raw = ctx.files.write(`${stem}.raw${EXT[format] ?? '.png'}`, image)
    let q = await quantizeIcon(image, colours).catch((e) => ({
      ok: false,
      error: `unreadable image: ${e.message}`
    }))
    let file = null
    // plate fallback: two colours asked, the model drew one
    let plate = null
    if (!q.ok && q.oneColourOnly && q.png) {
      const unplated = ctx.files.write(`${stem}.unplated.png`, q.png)
      const pl = await plateIcon(q.png, q.oneColourOnly)
      plate = {
        used: pl.ok,
        unplated,
        shape: pl.shape,
        iconColour: pl.iconColour,
        plateColour: pl.plateColour,
        ratio: pl.ratio,
        minRatio: pl.minRatio,
        swapped: pl.swapped,
        shares: pl.shares ?? null,
        outsideCircleShare: pl.outsideCircleShare ?? null,
        error: pl.error
      }
      if (pl.ok) {
        file = ctx.files.write(`${stem}.png`, pl.png)
        const seen = q.colours
        q = {
          ...q,
          ok: true,
          error: undefined,
          colours: colours.map((c) => ({
            colour: c,
            share: pl.shares[c],
            observedInImage: seen.find((x) => x.colour === c)?.observedInImage
          }))
        }
      } else {
        file = ctx.files.write(`${stem}.png`, q.png)
        q = { ...q, error: `${q.error}; ${pl.error}` }
      }
    } else if (q.png) file = ctx.files.write(`${stem}.png`, q.png)
    const proofs = {}
    if (file)
      for (const [name, background] of [
        ['on-black', '#000000'],
        ['on-white', '#ffffff']
      ])
        proofs[name] = ctx.files.write(
          `${stem}.${name}.png`,
          await sharp({ create: { width: 512, height: 512, channels: 4, background } })
            .composite([{ input: ctx.files.read(file) }])
            .png()
            .toBuffer()
        )
    const result = {
      ok: q.ok,
      error: q.error,
      toolFailure: !q.ok,
      ...base,
      plate,
      file,
      raw,
      proofs,
      provider,
      model,
      cost,
      measure: {
        ground: q.ground,
        colours: q.colours,
        coverage: q.coverage,
        offPaletteShare: q.offPaletteShare,
        specksRemoved: q.specksRemoved,
        sourceSize: q.sourceSize,
        cropAtSource: q.cropAtSource
      }
    }
    writeJson(ctx.files, `${stem}.json`, result)
    return result
  }
}
