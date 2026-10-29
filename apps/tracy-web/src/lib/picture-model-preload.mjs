/** Observe real child provider requests, below any later cache replay preload. No request data leaves the child. */
import { writeSync } from 'node:fs'

let sequence = 0
const realFetch = globalThis.fetch.bind(globalThis)
const send = (phase, kind, id) => {
  try {
    writeSync(3, `${JSON.stringify({ phase, kind, id })}\n`)
  } catch {
    // Diagnostics must never change provider behaviour when the parent has already stopped listening.
  }
}

function requestKind(body, input) {
  if (!body || typeof body.model !== 'string') return null
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
  if (
    body.modalities?.includes('image') ||
    body.images === true ||
    /\/images\/(?:generations|edits)(?:\?|$)/.test(url)
  )
    return 'drawing'
  const messages = body.messages ?? body.input
  return Array.isArray(messages) &&
    messages.some(
      (message) =>
        Array.isArray(message?.content) &&
        message.content.some((part) => part?.type === 'image_url' || part?.type === 'input_image')
    )
    ? 'vision'
    : null
}

async function kindOf(input, init) {
  try {
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : null)
    return typeof body === 'string' ? requestKind(JSON.parse(body), input) : null
  } catch {
    return null
  }
}

/** Retain streaming, cancellation and response metadata while timing through the last consumed body byte. */
function observeBody(response, end) {
  if (!response.body) {
    end()
    return response
  }
  const reader = response.body.getReader()
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          end()
          controller.close()
        } else controller.enqueue(next.value)
      } catch (error) {
        end()
        controller.error(error)
      }
    },
    cancel(reason) {
      end()
      return reader.cancel(reason)
    }
  })
  const observed = new Response(body, response)
  for (const property of ['url', 'redirected', 'type'])
    Object.defineProperty(observed, property, { value: response[property] })
  return observed
}

globalThis.fetch = async (input, init) => {
  const kind = await kindOf(input, init)
  if (!kind) return realFetch(input, init)
  const id = ++sequence
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    send('end', kind, id)
  }
  send('start', kind, id)
  try {
    return observeBody(await realFetch(input, init), end)
  } catch (error) {
    end()
    throw error
  }
}
