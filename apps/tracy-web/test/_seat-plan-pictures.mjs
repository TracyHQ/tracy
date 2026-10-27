// Test-only helper: one turn holding a picture the person pasted and a picture a tool returned, sent
// through a vendor's real `streamOnce` to a fetch that keeps the request body and answers nothing
// more. Synthetic, tiny base64 only: no real picture is ever in a test.
import { inputModalities } from '../src/seat-plan/providers.js'

export const PNG = 'iVBORw0KGgo='
export const JPG = '/9j/4AAQSkZJRg=='
const inline = (data, media) => ({ type: 'image', source: { type: 'base64', media_type: media, data } })

/** The options the broker builds for `provider`/`model`: `supportsImages` from the vendor's own table. */
export function pictureTurn(provider, model) {
  return {
    model,
    sessionId: 'session-1',
    supportsImages: inputModalities(provider, model).includes('image'),
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Like this:' }, inline(PNG, 'image/png')] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'page.look', arguments: '{}' }] },
      {
        role: 'tool',
        toolCallId: 'c1',
        toolName: 'page.look',
        content: [{ type: 'text', text: 'Screenshot:' }, inline(JPG, 'image/jpeg')]
      }
    ]
  }
}

/**
 * The JSON body `vendor.streamOnce` sends for `options`. Requests without a conversation in them
 * (a catalog or project pre-flight) are answered 404, which every vendor here tolerates.
 */
export async function sentBody(vendor, blob, options, config = vendor.defaults()) {
  let body
  const fetchImpl = async (_url, init = {}) => {
    const text = typeof init.body === 'string' ? init.body : ''
    if (/"(messages|input|contents)"/.test(text)) {
      body = JSON.parse(text)
      throw new Error('captured')
    }
    return new Response('{}', { status: 404 })
  }
  await Array.fromAsync(vendor.streamOnce({ blob, config, options, fetchImpl })).catch(() => {})
  if (!body) throw new Error('the vendor sent no conversation')
  return body
}
