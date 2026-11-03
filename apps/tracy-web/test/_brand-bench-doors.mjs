// The fake outside doors of the end-to-end brand test: Google Fonts (serves the Teko face already in the repo) and the
// reviewer model (passes every check of every image it is shown). No network, no real model.
import { FONT } from './_brand-tool-fixtures.mjs'

const FILE_URL = 'https://fonts.gstatic.com/s/invented/v1/latin.woff2'

/** The Google Fonts door: one stylesheet for any css2 link and the font file it names. Counts its requests. */
export function fakeFontFetch() {
  const seen = []
  const fetchImpl = async (url) => {
    seen.push(String(url))
    if (String(url).startsWith('https://fonts.googleapis.com/css2?'))
      return new Response(
        `/* latin */\n@font-face { font-family: 'Bebas Neue'; font-style: normal; font-weight: 400; src: url(${FILE_URL}) format('woff2'); unicode-range: U+0000-00FF, U+0131; }`
      )
    if (String(url) === FILE_URL) return new Response(FONT.bytes)
    return new Response('', { status: 404 })
  }
  return { fetchImpl, seen }
}

/** The picture model of the seedImage door, and its answer: an OpenRouter-like reply carrying a PNG as a data URI. */
export const PICTURE_MODEL = 'vendor/picture-model'
export const pictureReply = (png) => ({
  model: PICTURE_MODEL,
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Here is the icon.',
        images: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }]
      }
    }
  ],
  usage: { prompt_tokens: 80, completion_tokens: 1200, cost: 0.034 }
})

/** The reviewer: passes every check of every image it is shown. */
export function passingReviewer(body) {
  const parts = body.messages.at(-1).content
  const images = parts.filter((p) => p.type === 'image_url').length
  const checks =
    parts
      .find((p) => p.type === 'text')
      .text.split('Checks:\n')[1]
      ?.split('\n')
      .filter(Boolean) ?? []
  const answer = {
    images: Array.from({ length: images }, (_, i) => ({
      image: i + 1,
      checks: checks.map((c) => ({ check: c.replace(/^\d+\.\s*/, ''), verdict: 'pass', reason: 'it reads' }))
    }))
  }
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
    usage: { prompt_tokens: 500, completion_tokens: 50, cost: 0.002 }
  }
}
