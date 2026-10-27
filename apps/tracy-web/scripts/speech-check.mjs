#!/usr/bin/env node
/**
 * Check voice input end to end with spoken audio: real customer requests in several languages are
 * spoken by ElevenLabs text to speech (Flash v2.5 and Turbo v2.5), streamed at the pace of a real
 * microphone through the voice socket (`src/speech/relay.js` — the very relay the chat box talks to),
 * and what comes back is judged against what was said: the words (word error rate; characters for
 * Chinese and Japanese), the language the service heard, and how soon words appear.
 *
 * WHY TEXT TO SPEECH. It gives the same sentence, in every language, every run: the pipeline and the
 * protocol are checked, not a person's accent (council 15/10/2026: a synthetic voice does not stand
 * for real speakers, noise or microphones — measure those with people before turning it on widely).
 *
 *   node scripts/speech-check.mjs --env ../../deploy/.env [--models eleven_flash_v2_5,eleven_turbo_v2_5]
 *        [--langs en,vi,fr] [--voice <voice id>] [--wav-dir <dir>] [--repeat <n>] [--trace]
 *        [--via http://tracy.test:51710 --cookie-file <f>]
 *
 * The key is `SPEECH_TO_TEXT_API_KEY`, from the environment or the `--env` file; it is never printed.
 * It needs the Text to Speech and Speech to Text permissions. Without `--via`, the relay runs in this
 * process (no database, no sign-in); with `--via`, the audio goes through that running tracy-web's
 * own door, signed in with the `tracy_sess` cookie in `--cookie-file`.
 * `--wav-dir` keeps each spoken request as a 16 kHz WAV — the file Chrome plays as a fake microphone
 * (`--use-file-for-fake-audio-capture`) when the chat box is tested in a browser.
 *
 * Prints one line per (model, language) and a JSON summary; exits 1 when a request is not
 * transcribed, is heard in the wrong language, or comes back with more errors than words right
 * (an error rate above 50% — what a phrase written twice looks like). `--trace` prints every
 * message the page was told for such a request.
 */
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'
import { SPEECH_STREAM_PATH, speechRelay } from '../src/speech/relay.js'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback
}

/**
 * Requests a customer types into the chat box, one per language (and one that mixes two), in
 * `speech-check-requests.json`: words in other languages are data, not code (gate `language`).
 */
const REQUESTS = JSON.parse(readFileSync(new URL('./speech-check-requests.json', import.meta.url), 'utf8'))
const CHARACTER_SCRIPTS = new Set(['ja', 'zh'])
/** ISO 639-3 codes of each language: the service may name a language either way. */
const THREE_LETTER = {
  en: ['eng'],
  vi: ['vie'],
  fr: ['fra', 'fre'],
  de: ['deu', 'ger'],
  es: ['spa'],
  it: ['ita'],
  nl: ['nld', 'dut'],
  ja: ['jpn'],
  zh: ['zho', 'chi', 'cmn', 'yue']
}
const sameLanguage = (code, language) =>
  code !== null &&
  (code.toLowerCase().split(/[-_]/)[0] === language ||
    (THREE_LETTER[language] ?? []).includes(code.toLowerCase()))

function readKey() {
  if (process.env.SPEECH_TO_TEXT_API_KEY) return process.env.SPEECH_TO_TEXT_API_KEY
  const file = flag('--env')
  if (!file) return null
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('SPEECH_TO_TEXT_API_KEY='))
  return line
    ? line
        .slice('SPEECH_TO_TEXT_API_KEY='.length)
        .replace(/\s+#.*$/, '')
        .trim()
        .replace(/^["']|["']$/g, '') || null
    : null
}

/** Speak `text` with `model`: 16 kHz PCM, 16-bit little-endian, mono. */
async function speak(key, voice, model, text, language) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, language_code: language })
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`text to speech answered ${res.status}: ${body.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function wav(pcm) {
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(16_000, 24)
  head.writeUInt32LE(32_000, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([head, pcm])
}

/** Words (or characters, for scripts written without spaces) of `text`, for the error rate. */
function units(text, characters) {
  const plain = text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .trim()
  return characters ? [...plain.replace(/\s+/g, '')] : plain.split(/\s+/).filter(Boolean)
}

function errorRate(said, heard, characters) {
  const a = units(said, characters)
  const b = units(heard, characters)
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return a.length === 0 ? 0 : d[a.length][b.length] / a.length
}

/** An in-process relay (no database, no sign-in), or the `--via` one. */
async function relayAddress(key) {
  const via = flag('--via')
  if (via) {
    const cookie = readFileSync(flag('--cookie-file'), 'utf8')
      .trim()
      .replace(/^tracy_sess=/, '')
    const url = new URL(SPEECH_STREAM_PATH, via)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return {
      url: url.href,
      headers: { origin: new URL(via).origin, cookie: `tracy_sess=${cookie}` },
      close() {}
    }
  }
  const origin = 'http://speech-check.local'
  const relay = speechRelay({
    config: { origin, sessionSecret: 'unused', speech: { apiKey: key } },
    count: async () => false,
    session: async () => 'speech-check@local',
    log: { log: (line) => console.log(`  ${line}`), warn: (line) => console.warn(`  ${line}`) }
  })
  const server = createServer((_req, res) => res.end())
  server.on('upgrade', (req, socket, head) => void relay.upgrade(req, socket, head))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `ws://127.0.0.1:${server.address().port}${SPEECH_STREAM_PATH}`,
    headers: { origin, cookie: 'x=1' },
    close: () => server.close()
  }
}

/** Stream `pcm` like a microphone (100 ms frames, real time, a second of silence after), then stop. */
async function transcribe(address, pcm) {
  const socket = new WebSocket(address.url, { headers: address.headers })
  const started = Date.now()
  const out = {
    committed: [],
    partial: '',
    language: null,
    firstWordsMs: null,
    end: null,
    stopToEndMs: null,
    told: []
  }
  let stoppedAt = 0
  const ended = new Promise((resolve) => socket.on('close', resolve))
  socket.on('message', (data) => {
    const m = JSON.parse(data.toString())
    out.told.push(`+${Date.now() - started}ms ${JSON.stringify(m)}`)
    if ((m.type === 'partial' || m.type === 'committed') && m.text.trim() && out.firstWordsMs === null)
      out.firstWordsMs = Date.now() - started
    if (m.type === 'partial') out.partial = m.text
    if (m.type === 'committed') {
      out.committed.push(m.text)
      out.partial = ''
    }
    if (m.type === 'language') out.language = m.code
    if (m.type === 'end') {
      out.end = m
      out.stopToEndMs = stoppedAt ? Date.now() - stoppedAt : null
    }
  })
  await once(socket, 'open')
  const audio = Buffer.concat([pcm, Buffer.alloc(32_000)])
  for (let i = 0; i < audio.length; i += 3200) {
    socket.send(audio.subarray(i, i + 3200))
    await new Promise((r) => setTimeout(r, 100))
  }
  stoppedAt = Date.now()
  socket.send(JSON.stringify({ type: 'stop' }))
  await ended
  return out
}

const key = readKey()
if (!key) {
  console.error('speech-check: no SPEECH_TO_TEXT_API_KEY (environment or --env file)')
  process.exit(2)
}
const models = (flag('--models') ?? 'eleven_flash_v2_5,eleven_turbo_v2_5').split(',')
const langs = (flag('--langs') ?? Object.keys(REQUESTS).join(',')).split(',')
const voice = flag('--voice') ?? 'JBFqnCBsd6RMkjVDRZzb'
const wavDir = flag('--wav-dir')
if (wavDir) mkdirSync(wavDir, { recursive: true })
const address = await relayAddress(key)
const rows = []
const repeat = Number(flag('--repeat') ?? 1)
for (let round = 0; round < repeat; round++)
  for (const model of models)
    for (const lang of langs) {
      const said = REQUESTS[lang]
      const language = lang.split('-')[0]
      const row = { model, lang, said }
      try {
        const pcm = await speak(key, voice, model, said, language)
        row.audioSeconds = +(pcm.length / 32_000).toFixed(1)
        if (wavDir)
          writeFileSync(
            join(wavDir, `${lang}-${model}.wav`),
            wav(Buffer.concat([Buffer.alloc(16_000), pcm, Buffer.alloc(64_000)]))
          )
        const got = await transcribe(address, pcm)
        row.heard = [...got.committed, got.partial].filter(Boolean).join(' ')
        row.language = got.language
        row.errorRate = +errorRate(said, row.heard, CHARACTER_SCRIPTS.has(language)).toFixed(3)
        row.firstWordsMs = got.firstWordsMs
        row.stopToEndMs = got.stopToEndMs
        row.end = got.end
        row.ok = row.heard !== '' && got.end?.reason === 'stopped' && row.errorRate <= 0.5
        if (!row.ok && args.includes('--trace')) row.told = got.told
        row.languageOk = sameLanguage(row.language, language)
      } catch (error) {
        row.ok = false
        row.error = String(error?.message ?? error)
      }
      rows.push(row)
      if (row.told) for (const line of row.told) console.log(`  told ${line}`)
      console.log(
        `${row.ok && row.languageOk ? 'PASS' : 'FAIL'} ${model} ${lang.padEnd(8)} ` +
          (row.error
            ? row.error
            : `heard ${row.language ?? '?'} · error ${(row.errorRate * 100).toFixed(1)}% · first words ${row.firstWordsMs} ms · done ${row.stopToEndMs} ms after stop · “${row.heard}”`)
      )
    }
address.close()
console.log(JSON.stringify({ voice, rows }, null, 2))
process.exit(rows.every((r) => r.ok && r.languageOk) ? 0 : 1)
