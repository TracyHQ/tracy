// Fakes of the pictures step's finish (#575): the build model's answers to the second look and to the wish call, a
// drawer door whose provider answers a generated test picture, and a memory store of drawings. No paid call.
import sharp from 'sharp'
import { PICTURE_WISHES_PROMPT } from 'website-opportunities/domain/picture-wishes.mjs'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'

/**
 * The fake model's answer to a look or a wish call, or null for any other call.
 * `look(request)` may answer the look itself (a fail, an unreadable answer).
 */
export function finishReply(request, { look } = {}) {
  if (request?.system === picturePrompts().looker) {
    const own = look?.(request)
    if (own !== undefined) return own
    // The fake writes English only: asked an alt in another language, it answers none (the frame keeps its fallback).
    const english = /site's language "en"/.test(String(request.user))
    return JSON.stringify({
      verdict: 'pass',
      faults: [],
      seen: 'An invented test picture.',
      ...(english ? { alt: 'Invented picture' } : {})
    })
  }
  if (request?.system === PICTURE_WISHES_PROMPT) {
    const frames = JSON.parse(request.user).frames
    return JSON.stringify({
      wishes: frames.map((f) => ({
        frame: f.id,
        shows: `an invented scene for ${f.id}`,
        mustInclude: ['the invented subject'],
        avoid: ['readable text'],
        mood: 'calm'
      }))
    })
  }
  return null
}

let picture = null
/** A generated test picture as the drawer's provider answers it (a data address). */
async function drawnPicture() {
  picture ??= await sharp({ create: { width: 96, height: 64, channels: 3, background: '#6a8f5b' } })
    .jpeg()
    .toBuffer()
  return `data:image/jpeg;base64,${picture.toString('base64')}`
}

/**
 * A drawer door over a fake provider and a memory store of drawings.
 * @param {{status?: number}} [options] `status`: the provider answers this HTTP status instead of a picture
 */
export function fakeDrawer({ status } = {}) {
  const asked = []
  const kept = new Map()
  const fetchImpl = async (_url, init) => {
    asked.push(JSON.parse(init.body))
    if (status) return new Response(JSON.stringify({ error: { message: 'invented failure' } }), { status })
    const url = await drawnPicture()
    return new Response(
      JSON.stringify({
        model: 'invented-drawer',
        choices: [{ message: { images: [{ image_url: { url } }] } }],
        usage: { cost: 0.01 }
      }),
      { status: 200 }
    )
  }
  const door = { baseUrl: 'https://drawer.example/api', apiKey: 'invented-key', model: 'invented-drawer' }
  return {
    asked,
    kept,
    pictureDrawer: async () => ({ ok: true, door, snapshot: { model: door.model }, fetchImpl }),
    drawnPictures: {
      find: async (key) => [...kept.values()].find((k) => k.key === key) ?? null,
      keep: async ({ key, bytes, mime }) => {
        const id = `drawn-${kept.size + 1}`
        kept.set(id, { id, key, bytes, mime, sha256: `sha-${id}` })
        return { id, sha256: `sha-${id}`, mime }
      }
    }
  }
}
