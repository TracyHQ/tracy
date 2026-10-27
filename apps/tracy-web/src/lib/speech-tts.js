import WebSocket from 'ws'
import { speechTtsRequest } from './speech-provider.js'
import { localSpeechFetch } from './speech-network.js'

/** A single reading. Dialogue sockets never hold an agent or conversation session. */
export async function openSpeechTts(
  snapshot,
  asked,
  { fetchImpl = fetch, connect, signal, dialogueOptions } = {}
) {
  const request = speechTtsRequest(snapshot, asked)
  if (request.transport === 'dialogue-ws')
    return openDialogueReading(request, { ...dialogueOptions, connect, signal })
  const response = await (snapshot.provider === 'voicestudio' && fetchImpl === fetch
    ? localSpeechFetch
    : fetchImpl)(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    redirect: 'error',
    signal
  })
  return request.transport === 'dialogue-http' && response.ok
    ? boundedDialogueHttp(response, signal, dialogueOptions)
    : response
}

/** Resolve only after valid PCM arrives, allowing one-hop fallback before output, never after it. */
export function openDialogueReading(
  request,
  {
    connect = (url, options) => new WebSocket(url, options),
    signal,
    firstAudioMs = request.timeoutMs,
    totalMs = 60_000,
    idleMs = 15_000,
    maxBufferedBytes = 2_000_000,
    maxAudioBytes = 20_000_000
  } = {}
) {
  return new Promise((resolve, reject) => {
    let socket,
      controller,
      delivered = false,
      ended = false,
      bytes = 0,
      idleTimer
    const stream = new ReadableStream(
      {
        start(value) {
          controller = value
        },
        cancel() {
          if (!ended) {
            ended = true
            cleanup()
          }
        }
      },
      { highWaterMark: maxBufferedBytes, size: (chunk) => chunk.byteLength }
    )
    const firstTimer = setTimeout(() => fail('generation_timeout'), firstAudioMs)
    const totalTimer = setTimeout(() => fail('generation_timeout'), totalMs)
    function cleanup() {
      clearTimeout(firstTimer)
      clearTimeout(totalTimer)
      clearTimeout(idleTimer)
      signal?.removeEventListener('abort', onAbort)
      try {
        socket?.terminate()
      } catch {
        /* Already closed. */
      }
    }
    function finish() {
      if (ended) return
      ended = true
      cleanup()
      if (!delivered) resolve(Response.json({ detail: { status: 'empty_audio' } }, { status: 502 }))
      controller.close()
    }
    function fail(code, status = 502) {
      if (ended) return
      ended = true
      cleanup()
      if (delivered) controller.error(new Error('SPEECH_STREAM_FAILED'))
      else {
        controller.close()
        resolve(Response.json({ detail: { status: code } }, { status }))
      }
    }
    function onAbort() {
      if (ended) return
      ended = true
      cleanup()
      if (delivered) controller.error(new DOMException('Reading cancelled', 'AbortError'))
      else {
        controller.close()
        reject(new DOMException('Reading cancelled', 'AbortError'))
      }
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      socket = connect(new URL(request.url), {
        headers: { 'xi-api-key': request.headers['xi-api-key'] },
        perMessageDeflate: false,
        handshakeTimeout: Math.min(firstAudioMs, 10_000),
        maxPayload: 1_500_000,
        followRedirects: false
      })
      socket.on('open', () => {
        if (ended) return
        try {
          socket.send(JSON.stringify({ voices: [request.voice] }))
          socket.send(
            JSON.stringify({ inputs: [{ text: request.text, voice_id: request.voice }], close_socket: true })
          )
        } catch {
          fail('socket_error')
        }
      })
      socket.on('unexpected-response', (_, response) => {
        response.resume?.()
        fail(
          'provider_refused',
          [400, 401, 402, 403, 404, 422, 429].includes(response.statusCode) ? response.statusCode : 502
        )
      })
      socket.on('error', () => fail('socket_error'))
      socket.on('close', () => {
        if (!ended) fail('incomplete_audio')
      })
      socket.on('message', (raw, binary) => {
        if (ended) return
        if (binary || raw.length > 1_500_000) {
          fail('invalid_audio')
          return
        }
        let message
        try {
          message = JSON.parse(raw.toString())
        } catch {
          fail('invalid_audio')
          return
        }
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          fail('invalid_audio')
          return
        }
        if (message.error || message.error_type) {
          const code =
            message.error_type ??
            message.error?.code ??
            message.code ??
            (typeof message.error === 'string' ? message.error : '')
          const auth = /auth|permission|api_key/i.test(code)
          const model = /model|voice|language|invalid_request/i.test(code)
          fail(
            auth ? 'authentication_failed' : model ? 'configuration_refused' : 'provider_error',
            auth
              ? 401
              : model
                ? 400
                : /quota|credit|payment/i.test(code)
                  ? 402
                  : /rate|concurren/i.test(code)
                    ? 429
                    : 502
          )

          return
        }
        if (message.audio !== undefined && message.audio !== '') {
          if (
            typeof message.audio !== 'string' ||
            message.audio.length % 4 !== 0 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.audio)
          ) {
            fail('invalid_audio')
            return
          }
          const audio = Buffer.from(message.audio, 'base64')
          bytes += audio.length
          if (
            !audio.length ||
            audio.length % 2 ||
            bytes > maxAudioBytes ||
            audio.length > controller.desiredSize
          ) {
            fail('invalid_audio')
            return
          }
          controller.enqueue(audio)
          clearTimeout(firstTimer)
          clearTimeout(idleTimer)
          idleTimer = setTimeout(() => fail('generation_timeout'), idleMs)
          if (!delivered) {
            delivered = true
            resolve(
              new Response(stream, { headers: { 'content-type': 'audio/pcm', 'x-sample-rate': '24000' } })
            )
          }
        }
        if (message.is_final_audio_for_turn || message.is_final || message.final) finish()
      })
    } catch {
      fail('socket_error')
    }
  })
}

/** HTTP network chunks can split an int16 sample; keep at most one trailing byte. */
async function boundedDialogueHttp(
  response,
  signal,
  { firstAudioMs = 30_000, totalMs = 60_000, idleMs = 15_000 } = {}
) {
  if (!/^(?:audio\/pcm|application\/octet-stream)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => {})
    return Response.json({ detail: { status: 'invalid_audio_format' } }, { status: 502 })
  }
  if (!response.body) return Response.json({ detail: { status: 'empty_audio' } }, { status: 502 })
  const reader = response.body.getReader()
  let ended = false,
    controller,
    pending = Buffer.alloc(0),
    bytes = 0,
    failure = null,
    idleTimer
  const timer = setTimeout(() => stop(new Error('SPEECH_STREAM_TIMEOUT')), totalMs)
  const firstTimer = setTimeout(() => stop(new Error('SPEECH_STREAM_TIMEOUT')), firstAudioMs)
  const onAbort = () => stop(new DOMException('Reading cancelled', 'AbortError'))
  function cleanup() {
    clearTimeout(timer)
    clearTimeout(firstTimer)
    clearTimeout(idleTimer)
    signal?.removeEventListener('abort', onAbort)
  }
  function stop(error) {
    if (ended) return
    ended = true
    failure = error
    cleanup()
    void reader.cancel().catch(() => {})
    if (controller) controller.error(error)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  async function next() {
    while (!ended) {
      const { value, done } = await reader.read()
      if (ended) throw failure ?? new DOMException('Reading cancelled', 'AbortError')
      if (done) {
        if (pending.length) throw new Error('INVALID_PCM')
        ended = true
        cleanup()
        return null
      }
      bytes += value.length
      if (bytes > 20_000_000 || value.length > 2_000_000) throw new Error('AUDIO_LIMIT')
      const data = Buffer.concat([pending, value])
      const count = data.length - (data.length % 2)
      pending = data.subarray(count)
      if (count) {
        clearTimeout(firstTimer)
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => stop(new Error('SPEECH_STREAM_TIMEOUT')), idleMs)
        return data.subarray(0, count)
      }
    }
    throw new DOMException('Reading cancelled', 'AbortError')
  }
  let first
  try {
    first = await next()
  } catch (error) {
    stop(error)
    throw error
  }
  if ((ended && first) || signal?.aborted)
    throw failure ?? new DOMException('Reading cancelled', 'AbortError')
  if (!first) return Response.json({ detail: { status: 'empty_audio' } }, { status: 502 })
  return new Response(
    new ReadableStream({
      start(value) {
        controller = value
        controller.enqueue(first)
      },
      async pull() {
        try {
          const chunk = await next()
          if (chunk) controller.enqueue(chunk)
          else controller.close()
        } catch (error) {
          stop(error)
        }
      },
      cancel() {
        if (!ended) {
          ended = true
          cleanup()
          void reader.cancel().catch(() => {})
        }
      }
    }),
    { headers: { 'content-type': 'audio/pcm', 'x-sample-rate': '24000' } }
  )
}
