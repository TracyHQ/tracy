/* Generated from Tracy chat voice modules. esbuild uses var for bundle bindings. */
/* oxlint-disable no-var */

// packages/ui/tracy-chat-input/src/client/voice-mic.mjs
function audioConstraints(deviceId) {
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {})
  }
}
function fellBack(wanted, opened) {
  if (!wanted) return false
  if (!opened) return false
  return opened !== wanted
}

// packages/ui/tracy-chat-input/src/client/voice-pcm.mjs
var OUTPUT_RATE = 16e3
var FRAME_SAMPLES = 1600
function downsampler(inputRate) {
  const ratio = inputRate / OUTPUT_RATE
  let carry = new Float32Array(0)
  let pos = 0
  return (block) => {
    const data = new Float32Array(carry.length + block.length)
    data.set(carry)
    data.set(block, carry.length)
    const out = []
    while (pos + ratio <= data.length) {
      const from = Math.floor(pos)
      const to = Math.max(from + 1, Math.floor(pos + ratio))
      let sum = 0
      for (let i = from; i < to; i++) sum += data[i]
      out.push(sum / (to - from))
      pos += ratio
    }
    const used = Math.min(Math.floor(pos), data.length)
    carry = data.slice(used)
    pos -= used
    return Float32Array.from(out)
  }
}
function toPcm16(samples) {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767)
  }
  return out
}
function loudness(samples) {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}
function framer(send) {
  let buffer = new Int16Array(FRAME_SAMPLES)
  let filled = 0
  return {
    /** @param {Int16Array} samples */
    push(samples) {
      let offset = 0
      while (offset < samples.length) {
        const take = Math.min(FRAME_SAMPLES - filled, samples.length - offset)
        buffer.set(samples.subarray(offset, offset + take), filled)
        filled += take
        offset += take
        if (filled === FRAME_SAMPLES) {
          send(buffer.buffer)
          buffer = new Int16Array(FRAME_SAMPLES)
          filled = 0
        }
      }
    },
    /** Hand out what is left, shorter than a frame: the last words before Done. */
    flush() {
      if (filled === 0) return
      send(buffer.slice(0, filled).buffer)
      buffer = new Int16Array(FRAME_SAMPLES)
      filled = 0
    }
  }
}

// packages/ui/tracy-chat-input/src/client/voice-capture.ts
var MicrophoneError = class extends Error {
  constructor(problem) {
    super(problem)
    this.problem = problem
  }
}
var TAP = `class TracyVoiceTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) this.port.postMessage(channel.slice(0))
    return true
  }
}
registerProcessor('tracy-voice-tap', TracyVoiceTap)`
function problemOf(error) {
  const name = error?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
    return 'noMicrophone'
  return 'unsupported'
}
async function openMicrophone(onFrame, onLevel, onLost, { deviceId = '' } = {}) {
  const Context = globalThis.AudioContext
  if (!navigator.mediaDevices?.getUserMedia || !Context || typeof AudioWorkletNode === 'undefined')
    throw new MicrophoneError('unsupported')
  const context = new Context()
  let stream = null
  let moduleUrl = null
  const release = async () => {
    stream?.getTracks().forEach((track2) => track2.stop())
    if (moduleUrl) URL.revokeObjectURL(moduleUrl)
    await context.close().catch(() => {})
  }
  try {
    void context.resume().catch(() => {})
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) })
    moduleUrl = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(moduleUrl)
  } catch (error) {
    await release()
    throw new MicrophoneError(problemOf(error))
  }
  const source = context.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(context, 'tracy-voice-tap', { numberOfInputs: 1, numberOfOutputs: 1 })
  const down = downsampler(context.sampleRate)
  const frames = framer(onFrame)
  tap.port.onmessage = (event) => {
    onLevel(loudness(event.data))
    frames.push(toPcm16(down(event.data)))
  }
  source.connect(tap)
  tap.connect(context.destination)
  const track = stream.getAudioTracks()[0]
  track?.addEventListener('ended', onLost)
  return {
    fellBack: fellBack(deviceId, track?.getSettings?.().deviceId),
    async close() {
      track?.removeEventListener('ended', onLost)
      tap.port.onmessage = null
      frames.flush()
      source.disconnect()
      tap.disconnect()
      await release()
    }
  }
}

// packages/ui/tracy-chat-input/src/client/voice-pcm-out.mjs
function pcmSamples() {
  let carry = null
  return {
    push(chunk) {
      const bytes = carry === null ? chunk : concat(carry, chunk)
      const whole = bytes.length - (bytes.length % 2)
      carry = whole < bytes.length ? bytes[bytes.length - 1] : null
      const view = new DataView(bytes.buffer, bytes.byteOffset, whole)
      const out = new Float32Array(whole / 2)
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 32768
      return out
    }
  }
}
function concat(first, rest) {
  const bytes = new Uint8Array(rest.length + 1)
  bytes[0] = first
  bytes.set(rest, 1)
  return bytes
}

// packages/ui/tracy-chat-input/src/client/voice-player.ts
var DUCKED = 0.25
var LEAD_SECONDS = 0.08
var STALL_MS = 6e3
function openPlayer() {
  const Context = globalThis.AudioContext
  const context = Context ? new Context() : null
  void context?.resume().catch(() => {})
  const analyser = context?.createAnalyser() ?? null
  const volume = context?.createGain() ?? null
  if (analyser && volume && context) {
    analyser.fftSize = 512
    analyser.connect(volume)
    volume.connect(context.destination)
  }
  const samples = new Float32Array(512)
  let playing = /* @__PURE__ */ new Set()
  let stopCurrent = null
  return {
    async play(sound, sampleRate, onStart) {
      if (!context || !analyser) {
        await sound.cancel().catch(() => {})
        return
      }
      if (context.state === 'suspended') await context.resume().catch(() => {})
      const reader = sound.getReader()
      const pcm = pcmSamples()
      const sources = /* @__PURE__ */ new Set()
      playing = sources
      let next = 0
      let stopped = false
      let lastEnded = Promise.resolve()
      stopCurrent = () => {
        stopped = true
        void reader.cancel().catch(() => {})
        for (const source of sources) {
          try {
            source.stop()
          } catch {}
        }
        sources.clear()
      }
      try {
        for (;;) {
          let timer
          const stalled = new Promise((resolve) => {
            timer = setTimeout(() => resolve('stalled'), STALL_MS)
          })
          const read = await Promise.race([reader.read(), stalled])
          clearTimeout(timer)
          if (read === 'stalled') {
            void reader.cancel().catch(() => {})
            break
          }
          const { done, value } = read
          if (done || stopped) break
          const chunk = pcm.push(value)
          if (chunk.length === 0) continue
          const buffer = context.createBuffer(1, chunk.length, sampleRate)
          buffer.copyToChannel(chunk, 0)
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(analyser)
          const at = Math.max(next, context.currentTime + (next === 0 ? LEAD_SECONDS : 0.01))
          source.start(at)
          if (next === 0) onStart?.(performance.now() + Math.max(0, at - context.currentTime) * 1e3)
          next = at + buffer.duration
          sources.add(source)
          lastEnded = new Promise((resolve) => {
            source.onended = () => {
              sources.delete(source)
              resolve()
            }
          })
        }
      } catch {}
      if (!stopped) await lastEnded
      if (playing === sources) stopCurrent = null
    },
    stop() {
      stopCurrent?.()
      stopCurrent = null
    },
    duck(on) {
      if (!volume || !context) return
      volume.gain.setTargetAtTime(on ? DUCKED : 1, context.currentTime, 0.04)
    },
    level() {
      if (!analyser || playing.size === 0) return 0
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      return Math.min(1, Math.sqrt(sum / samples.length) * 4)
    },
    async close() {
      stopCurrent?.()
      stopCurrent = null
      await context?.close().catch(() => {})
    }
  }
}

// packages/ui/tracy-chat-input/src/client/interrupted.mjs
var SITE_IN_PATH = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/
function siteKeyFromPath(pathname) {
  const m = SITE_IN_PATH.exec(pathname)
  return m ? /** @type {string} */ m[1] : null
}

// packages/ui/tracy-chat-input/src/client/voice-link.mjs
var SPEECH_PATH = '/api/speech/stream'
var WAITING_FRAMES = 50
function speechHttpPath(path, where = globalThis.location) {
  if (!['/api/speech', '/api/speech/say', SPEECH_PATH].includes(path)) throw new Error('SPEECH_PATH_INVALID')
  return where?.pathname?.startsWith('/widget/native/') || where?.pathname === '/widget/native'
    ? (path === SPEECH_PATH ? '/widget' : '/widget/backend') + path
    : path
}
function speechSocketUrl(where = globalThis.location, language = '', turns = false, site = '') {
  const params = new URLSearchParams()
  if (/^[a-z]{2,3}$/.test(language)) params.set('language', language)
  if (turns) params.set('turns', 'voice')
  if (siteKeyFromPath(`/${site}`) === site && site !== '') params.set('site', site)
  const query = params.toString() === '' ? '' : `?${params}`
  return `${where.protocol === 'https:' ? 'wss:' : 'ws:'}//${where.host}${speechHttpPath(SPEECH_PATH, where)}${query}`
}
function openSpeechLink(handlers, { url = speechSocketUrl(), WebSocketImpl = WebSocket } = {}) {
  const socket = new WebSocketImpl(url)
  socket.binaryType = 'arraybuffer'
  let waiting = []
  const committed = []
  let partial = ''
  let done = false
  const finish = (reason, settled) => {
    if (done) return
    done = true
    handlers.onEnd(reason, settled)
  }
  socket.addEventListener('open', () => {
    for (const frame of waiting) socket.send(frame)
    waiting = []
  })
  socket.addEventListener('message', (event) => {
    if (done || typeof event.data !== 'string') return
    let message = null
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    switch (message?.type) {
      case 'ready':
        handlers.onReady?.(message)
        return
      case 'partial':
        partial = String(message.text ?? '')
        handlers.onWords(committed, partial)
        return
      case 'committed':
        committed.push(String(message.text ?? ''))
        partial = ''
        handlers.onWords(committed, partial)
        return
      case 'language':
        if (typeof message.code === 'string' && message.code !== '') handlers.onLanguage?.(message.code)
        return
      case 'end':
        finish(String(message.reason ?? 'network'), message.settled !== false)
        return
    }
  })
  socket.addEventListener('close', () => finish('network', false))
  socket.addEventListener('error', () => finish('network', false))
  return {
    /** @param {ArrayBuffer} frame */
    sendAudio(frame) {
      if (done) return
      if (socket.readyState === WebSocketImpl.OPEN) socket.send(frame)
      else if (socket.readyState === WebSocketImpl.CONNECTING && waiting.length < WAITING_FRAMES)
        waiting.push(frame)
    },
    /** The person is done: the relay confirms what is still being spoken, then ends. */
    stop() {
      if (done) return
      if (socket.readyState === WebSocketImpl.OPEN) socket.send(JSON.stringify({ type: 'stop' }))
      else {
        done = true
        socket.close()
        handlers.onEnd('stopped', true)
      }
    },
    /** Drop the session without a word to anyone (Cancel, the page going away). */
    close() {
      done = true
      waiting = []
      if (socket.readyState === WebSocketImpl.OPEN || socket.readyState === WebSocketImpl.CONNECTING)
        socket.close()
    }
  }
}
export { openMicrophone, openPlayer, openSpeechLink, speechSocketUrl }
