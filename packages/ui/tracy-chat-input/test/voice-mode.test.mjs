// A voice conversation (`src/client/voice-mode.mjs`) driven end to end with stand-ins for the
// microphone, the voice socket, the conversation's event window, the reading door and the speakers:
// what is sent, what is said while Tracy works, what is read of the reply, and what is never heard
// back.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createVoiceMode,
  DUCK_MS,
  ECHO_MS,
  IDLE_MS,
  NO_WORDS_MS,
  NOISE_SETTLE,
  PROGRESS_GAP_MS,
  PROGRESS_MAX,
  REPROMPT_MS,
  SEND_AFTER_MS,
  SPEAKING_HOLD_MS,
  SPEAKING_MS,
  STILL_MS,
  STUCK_WORDS_MS,
  UNFINISHED_SEND_MS
} from '../src/client/voice-mode.mjs'
import { PLAN_LOCALES } from '../src/client/voice-turn-taking.mjs'

const SESSION = 'ses-1'
const PHRASES = {
  'voiceMode.say.planReview': 'I have a plan for you to review on screen.',
  'voiceMode.say.planRead': 'Here is the plan: {title}.',
  'voiceMode.say.planAsk':
    'To go ahead, say “approve this plan”. To change it, say “change the plan” and what to change.',
  'voiceMode.say.planApproved': 'Plan approved. I am starting on it now.',
  'voiceMode.say.planFeedback': 'Got it. I will change the plan.',
  'voiceMode.say.planChanged': 'The plan has changed. Here it is again.',
  'voiceMode.say.planWhat': 'What should I change in the plan?',
  'voiceMode.say.start': 'Okay, on it.',
  'voiceMode.say.start2': 'Sure, starting now.',
  'voiceMode.say.steered': 'Got it. I will work that in now.',
  'voiceMode.say.steered2': 'Noted, I am changing course now.',
  'voiceMode.say.look': 'Looking at your site.',
  'voiceMode.say.words': 'Changing the words.',
  'voiceMode.say.files': 'Making the changes.',
  'voiceMode.say.other': 'Still working on it.',
  'voiceMode.say.other2': 'This one takes a little longer.',
  'voiceMode.say.asking': 'I have a question for you on screen.',
  'voiceMode.say.yesOrNo': 'Please say yes or no.',
  'voiceMode.say.answerOnScreen': 'I could not hear your answer clearly. Please answer on screen.',
  'voiceMode.say.rest': 'The rest is in the chat.',
  'voiceMode.say.failed': 'Something went wrong, so I stopped. The details are in the chat.',
  'voiceMode.say.stopped': 'Stopped. Anything already saved stays.',
  'voiceMode.say.bye': 'Okay, back to the chat.'
}

/** A clock whose timers run when the test moves it. */
function fakeClock() {
  let time = 1_000_000
  let next = 1
  const timers = new Map()
  return {
    now: () => time,
    setTimeout: (fn, ms) => {
      const id = next++
      timers.set(id, { at: time + ms, fn })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    async advance(ms) {
      const until = time + ms
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        time = Math.max(time, due[1].at)
        due[1].fn()
        await settle()
      }
      time = until
      await settle()
    }
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** A 100 ms frame of 16-bit PCM at a steady loudness. */
const frame = (amplitude) => new Int16Array(1600).fill(amplitude).buffer

function harness({
  entries = [],
  speakAnswer,
  question,
  warm = false,
  cancelOk = true,
  onRestartRequired,
  cacheScope,
  planReview,
  plan,
  planApproval,
  planLocales,
  uiLanguage = 'en',
  showChat,
  fellBack = false,
  sendResult = 'sent'
} = {}) {
  const clock = fakeClock()
  const mics = []
  const traces = []
  /** Microphones open at once, at most: never two streams. */
  let openMics = 0
  let mostOpen = 0
  const links = []
  const sent = []
  const modes = []
  const cancels = []
  const spoken = []
  const played = []
  let stopped = 0
  const ducks = []
  let releaseCount = 0
  let claimStop = null
  /** @type {Set<() => void>} */
  const eventListeners = new Set()
  const events = { entries: [...entries], change: { kind: 'replace', entries: [...entries] } }
  /** Holds a playing sound until the test lets it end. */
  let finishPlay = null
  const deps = {
    openMic: async (onFrame, onLevel, onLost) => {
      openMics += 1
      mostOpen = Math.max(mostOpen, openMics)
      const mic = {
        onFrame,
        onLevel,
        onLost,
        closed: false,
        fellBack,
        close: async () => {
          if (!mic.closed) openMics -= 1
          mic.closed = true
        }
      }
      mics.push(mic)
      return mic
    },
    trace: (record) => traces.push(record),
    openLink: (handlers) => {
      const link = {
        handlers,
        frames: [],
        stopped: false,
        closed: false,
        sendAudio: (f) => link.frames.push(f),
        stop: () => void (link.stopped = true),
        close: () => void (link.closed = true)
      }
      links.push(link)
      return link
    },
    socketUrl: () => 'wss://tracy.test/api/speech/stream',
    send: async (sessionId, text, mode) => {
      sent.push({ sessionId, text })
      modes.push(mode)
      return sendResult
    },
    question: () => question?.() ?? null,
    planReview: () => planReview?.() ?? false,
    ...(plan ? { plan: () => plan() } : {}),
    ...(planApproval ? { planApproval: () => planApproval() } : {}),
    // The locales verified for a plan by voice: the real list (empty) unless a test stands in for it.
    ...(planLocales ? { planLocales: () => planLocales } : {}),
    showChat: () => showChat?.(),
    cancel: async (sessionId) => {
      cancels.push(sessionId)
      return cancelOk
    },
    warm,
    onRestartRequired,
    events: () => ({
      getSnapshot: () => events,
      subscribe: (listener) => {
        eventListeners.add(listener)
        return () => eventListeners.delete(listener)
      }
    }),
    speak: async (text, options) => {
      spoken.push({ text, ...options })
      if (speakAnswer) return speakAnswer(text)
      return new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 })
    },
    openPlayer: () => ({
      play: async (sound, _rate, onStart) => {
        const bytes = new Uint8Array(await new Response(sound).arrayBuffer())
        played.push(bytes.length)
        // Heard from now, on the page's clock (the trace's marks).
        onStart?.(clock.now())
        await new Promise((resolve) => {
          finishPlay = resolve
        })
      },
      stop: () => {
        stopped += 1
        finishPlay?.()
      },
      duck: (on) => ducks.push(on),
      level: () => 0.5,
      close: async () => {}
    }),
    languageOf: () => 'vi',
    uiLanguage: () => uiLanguage,
    phrase: (key, params) =>
      (PHRASES[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) => String(params?.[name] ?? whole)),
    claim: (stop) => {
      claimStop = stop
      return () => {
        releaseCount += 1
      }
    },
    limits: () => ({
      maxChars: 600,
      cacheKey: cacheScope?.(),
      sampleRate: 24_000,
      silenceSeconds: 30,
      voices: [{ id: 'v1' }, { id: 'v2' }]
    }),
    ...clock,
    monotonic: clock.now
  }
  const mode = createVoiceMode(deps)
  return {
    mode,
    clock,
    mics,
    traces,
    get mostOpen() {
      return mostOpen
    },
    links,
    sent,
    modes,
    cancels,
    spoken,
    played,
    get stopped() {
      return stopped
    },
    ducks,
    get releaseCount() {
      return releaseCount
    },
    claimedAway: () => claimStop?.(),
    /** Let the sound playing now end. */
    async endPlay() {
      const done = finishPlay
      finishPlay = null
      done?.()
      await settle()
    },
    /** Append events to the window, as dsh does while a turn runs. */
    async append(...added) {
      const wrapped = added.map((event) => ({ type: 'event', event }))
      events.entries = [...events.entries, ...wrapped]
      events.change = { kind: 'append', entries: wrapped }
      for (const listener of Array.from(eventListeners)) listener()
      await settle()
    },
    /** The window loaded again with history in front (a reload, a scroll back). */
    async replace(older) {
      const wrapped = older.map((event) => ({ type: 'event', event }))
      events.entries = [...wrapped, ...events.entries]
      events.change = { kind: 'replace', entries: events.entries }
      for (const listener of Array.from(eventListeners)) listener()
      await settle()
    },
    /** The person speaks for `frames` × 100 ms. */
    talk(frames = 3) {
      for (let i = 0; i < frames; i += 1) mics.at(-1).onFrame(frame(4000))
    },
    /** Tracy's own voice coming back through the speakers, after the browser's echo cancelling. */
    murmur(frames = 5) {
      for (let i = 0; i < frames; i += 1) mics.at(-1).onFrame(frame(800))
    },
    quiet(frames = 3) {
      for (let i = 0; i < frames; i += 1) mics.at(-1).onFrame(frame(20))
    }
  }
}

const ev = (type, data) => ({ type, data })
const said = (text) => ev('assistant/message', { message: { content: [{ type: 'text', text }] } })
const call = (callId, name, args) => ev('tool/call', { callId, name, arguments: JSON.stringify(args) })
const result = (callId) => ev('tool/result', { message: { toolCallId: callId, content: [] } })

async function started(h) {
  h.mode.start(SESSION)
  await settle()
  assert.equal(h.mode.getSnapshot().phase, 'on')
}

test('nothing leaves the page until speech is heard; then the second before goes first', async () => {
  const h = harness()
  await started(h)
  h.quiet(5)
  assert.equal(h.links.length, 0, 'quiet frames open no voice session')
  h.talk(2)
  assert.equal(h.links.length, 1)
  assert.equal(h.links[0].frames.length, 7, 'the five quiet frames and the two loud ones, kept and sent')
  h.talk(1)
  assert.equal(h.links[0].frames.length, 8, 'then the microphone goes straight through')
  assert.equal(h.mode.getSnapshot().hearing, true)
})

test('a confirmed phrase is sent like a typed message once no word follows, and Tracy says it heard', async () => {
  const h = harness()
  await started(h)
  h.talk()
  const link = h.links[0]
  link.handlers.onWords([], 'Đổi màu')
  assert.equal(h.mode.getSnapshot().words, 'Đổi màu')
  link.handlers.onWords(['Đổi màu nút liên hệ sang xanh.'], '')
  assert.ok(h.mode.getSnapshot().sendAt !== null, 'the row counts down before it goes')
  // A new word before the time is up keeps it: the two phrases go as one message.
  await h.clock.advance(SEND_AFTER_MS - 100)
  link.handlers.onWords(['Đổi màu nút liên hệ sang xanh.'], 'Và')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
  link.handlers.onWords(['Đổi màu nút liên hệ sang xanh.', 'Và thêm số điện thoại.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [
    { sessionId: SESSION, text: 'Đổi màu nút liên hệ sang xanh. Và thêm số điện thoại.' }
  ])
  assert.equal(h.mode.getSnapshot().words, '')
  assert.equal(h.spoken[0].text, 'Okay, on it.')
  assert.equal(h.spoken[0].language, 'en', 'a phrase of the interface is read in its language')
  // An open session with nothing in it is let go while Tracy talks; the next speech opens another.
  assert.equal(link.closed, true)
  await h.endPlay()
  h.talk(2)
  assert.equal(h.links.length, 2)
})

test('talking while Tracy works steers the words into the work, as a person takes in a correction, and says so', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  assert.equal(h.mode.getSnapshot().tracy, 'working')
  h.talk()
  h.links[0].handlers.onWords(['Thôi, để màu đỏ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Thôi, để màu đỏ.']
  )
  assert.deepEqual(h.modes, ['steer'])
  assert.equal(h.spoken.at(-1).text, 'Got it. I will work that in now.')
  // To an idle Tracy, words are a new message.
  await h.endPlay()
  await h.append(said('Đã đổi.'), ev('turn/end', { turn: 1 }))
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Cảm ơn, giờ thêm logo.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.modes, ['steer', 'queue'])
})

test('while Tracy works it says what it wrote, then what it does, a gap apart; then reads the reply', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 4 }), said("I'll look at the home page first. Then I change it."))
  assert.equal(h.spoken.length, 0, 'words with no call after them may be the reply: not said yet')
  await h.append(call('c1', 'tracy_site', { action: 'content.locate', params: {} }))
  assert.equal(h.spoken.at(-1).text, "I'll look at the home page first.")
  assert.equal(h.spoken.at(-1).language, 'vi', 'Tracy’s own words are read in their language')
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  await h.endPlay()
  // A new kind of work, but too soon after the last line: it waits for the gap.
  await h.append(call('c2', 'tracy_site', { action: 'content.replace', params: {} }))
  assert.equal(h.spoken.length, 1)
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.at(-1).text, 'Changing the words.')
  await h.endPlay()
  await h.append(
    said('Done: the **contact** button is green now.\n\n- Home page\n- Footer'),
    ev('turn/end', { turn: 4 })
  )
  assert.equal(h.spoken.at(-1).text, 'Done: the contact button is green now. Home page. Footer')
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  await h.endPlay()
  assert.equal(h.mode.getSnapshot().talking, null)
  assert.equal(h.mode.getSnapshot().tracy, 'idle')
})

test('never more than a few lines a turn, and never a tool’s name', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  for (let i = 0; i < PROGRESS_MAX + 4; i += 1) {
    await h.append(call(`c${i}`, i % 2 ? 'bash' : 'mystery_tool', {}))
    await h.clock.advance(PROGRESS_GAP_MS)
    await h.endPlay()
  }
  // Played, not asked again: a fixed line is read once and played again from the page's copy.
  assert.equal(h.played.length, PROGRESS_MAX)
  assert.equal(new Set(h.spoken.map((x) => x.text)).size, h.spoken.length, 'no line read twice')
  for (const line of h.spoken) assert.ok(!/bash|mystery|tool/i.test(line.text), line.text)
})

test('a turn before the press, and history loaded later, are never read out', async () => {
  const old = [
    { type: 'event', event: ev('turn/start', { turn: 3 }) },
    { type: 'event', event: said('An old reply.') },
    { type: 'event', event: ev('turn/end', { turn: 3 }) }
  ]
  const h = harness({ entries: old })
  await started(h)
  await h.replace([ev('turn/start', { turn: 2 }), said('Older still.'), ev('turn/end', { turn: 2 })])
  assert.equal(h.spoken.length, 0)
  await h.append(ev('turn/start', { turn: 4 }), said('The new one.'), ev('turn/end', { turn: 4 }))
  assert.deepEqual(
    h.spoken.map((s) => s.text),
    ['The new one.']
  )
})

test('a turn running at the press is followed to its reply', async () => {
  const h = harness({
    entries: [
      { type: 'event', event: ev('turn/start', { turn: 7 }) },
      { type: 'event', event: call('c1', 'read', {}) }
    ]
  })
  await started(h)
  assert.equal(h.mode.getSnapshot().tracy, 'working')
  await h.append(said('All set.'), ev('turn/end', { turn: 7 }))
  assert.equal(h.spoken.at(-1).text, 'All set.')
})

test('Tracy’s voice coming back is not the person: under the talk-over level nothing opens, and its words are never sent', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đổi nút liên hệ sang màu xanh lá.'),
    ev('turn/end', { turn: 1 })
  )
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  h.murmur(8)
  assert.equal(h.links.length, 0, 'an echo quieter than speech opens nothing')
  // Loud enough to open a session, but what comes back is Tracy's own line: it keeps talking.
  h.talk(3)
  assert.equal(h.links.length, 1)
  assert.deepEqual(h.ducks, [true], 'turned down at once')
  h.links[0].handlers.onWords([], 'Mình đổi nút liên hệ')
  assert.equal(h.mode.getSnapshot().talking, 'reply', 'its own words do not stop it')
  assert.equal(h.mode.getSnapshot().words, '')
  await h.clock.advance(DUCK_MS)
  assert.deepEqual(h.ducks, [true, false], 'and back up when no word of the person came')
  h.links[0].handlers.onWords(['Mình đổi nút liên hệ sang màu xanh lá.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0, 'the line coming back is not sent')
  await h.endPlay()
  // The same words well after the line are the person's own: sent.
  await h.clock.advance(ECHO_MS)
  h.links[0].handlers.onWords(
    ['Mình đổi nút liên hệ sang màu xanh lá.', 'Đổi nút liên hệ sang màu xanh lá.'],
    ''
  )
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi nút liên hệ sang màu xanh lá.']
  )
})

test('talking over Tracy: it is turned down, stops at the person’s first words, hears them out, then answers that', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Xong rồi. Mình đã đổi nút liên hệ sang màu xanh lá ở trang chủ và chân trang.'),
    ev('turn/end', { turn: 1 })
  )
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  h.talk(3)
  assert.deepEqual(h.ducks, [true])
  // The pre-roll caught a little of Tracy's line before the person: its run at the start is cut off.
  h.links[0].handlers.onWords([], 'đổi nút liên hệ khoan đã')
  assert.equal(h.stopped, 1, 'the person’s own words stop Tracy')
  await settle()
  assert.equal(h.mode.getSnapshot().talking, null)
  assert.equal(h.mode.getSnapshot().words, 'khoan đã')
  h.links[0].handlers.onWords(['đổi nút liên hệ khoan đã, để màu đỏ thì hơn.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['khoan đã, để màu đỏ thì hơn.']
  )
  // Tracy answers the new message: a new turn, its reply read.
  await h.endPlay()
  await h.append(ev('turn/start', { turn: 2 }), said('Được, mình để màu đỏ.'), ev('turn/end', { turn: 2 }))
  assert.equal(h.spoken.at(-1).text, 'Được, mình để màu đỏ.')
})

test('talking over a line said while Tracy works: the line stops, the words are steered in, and Tracy goes on telling its work', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  h.talk(3)
  h.links[0].handlers.onWords(['Thêm logo vào đầu trang.'], '')
  assert.equal(h.stopped, 1)
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Thêm logo vào đầu trang.']
  )
  await h.endPlay()
  // Talked over is not "stop talking": the next step of the work is still said.
  await h.clock.advance(PROGRESS_GAP_MS)
  await h.append(call('c2', 'edit', {}))
  assert.equal(h.spoken.at(-1).text, 'Making the changes.')
})

test('“ừ”, “okay” over Tracy is the person listening: Tracy goes on at its own volume, nothing is sent', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đã đổi nút liên hệ sang màu xanh lá ở trang chủ và chân trang.'),
    ev('turn/end', { turn: 1 })
  )
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  h.talk(3)
  assert.deepEqual(h.ducks, [true])
  h.links[0].handlers.onWords([], 'Ừ')
  assert.equal(h.stopped, 0, 'not stopped by the person listening')
  assert.equal(h.mode.getSnapshot().words, '', 'and Tracy’s line stays on screen')
  assert.deepEqual(h.ducks, [true, false], 'and back at its own volume')
  h.links[0].handlers.onWords(['Ừ ừ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  assert.equal(h.mode.getSnapshot().sendAt, null)
  // "Okay, but…" is more than listening: Tracy stops and hears it out.
  h.links[0].handlers.onWords(['Ừ ừ.'], 'Okay nhưng mà')
  assert.equal(h.stopped, 1)
  h.links[0].handlers.onWords(['Ừ ừ.', 'Okay nhưng mà màu đậm hơn chút.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Okay nhưng mà màu đậm hơn chút.']
  )
})

test('a sound Tracy cannot make out over its voice: it goes on turned down, and the sound is never sent nor glued to what follows', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình ghi nhận rồi: tiêu đề sẽ viết hoa đúng chữ cái đầu, như bạn muốn.'),
    ev('turn/end', { turn: 1 })
  )
  h.talk(3)
  // How the speech service wrote a hummed "ừ ừ" on the stand (16/10/2026).
  h.links[0].handlers.onWords([], 'Dzuiii')
  assert.equal(h.stopped, 0, 'not enough to stop for')
  assert.deepEqual(h.ducks, [true, true], 'still turned down, waiting for the next word')
  h.links[0].handlers.onWords(['Dzuiii.'], '')
  assert.equal(h.mode.getSnapshot().sendAt, null)
  await h.clock.advance(DUCK_MS)
  assert.equal(h.ducks.at(-1), false, 'no word came: back at its own volume')
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  h.talk(3)
  h.links[0].handlers.onWords(['Dzuiii.'], 'Huân đã')
  assert.equal(h.stopped, 1, 'two words: Tracy stops for the person')
  h.links[0].handlers.onWords(['Dzuiii.', 'Huân đã, trang chủ có mấy mục vậy?'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Huân đã, trang chủ có mấy mục vậy?']
  )
})

test('an “ừ” begun over a short line whose words come back once Tracy is done is still listening, never sent', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  h.talk(3)
  await h.endPlay()
  assert.equal(h.mode.getSnapshot().talking, null)
  // On the stand the service wrote it 1.4 s later, after the line had ended, as "Du. 2.".
  h.links[0].handlers.onWords([], 'Du.')
  h.links[0].handlers.onWords(['Du. 2.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
})

test('one word stops Tracy when it asks to ("khoan"), or answers the question being read ("Đỏ")', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đã đổi tiêu đề, giờ mình làm tiếp phần chân trang.'),
    ev('turn/end', { turn: 1 })
  )
  h.talk(3)
  h.links[0].handlers.onWords([], 'Khoan')
  assert.equal(h.stopped, 1)
  await h.endPlay()
  const asking = harness()
  await started(asking)
  await asking.append(
    ev('turn/start', { turn: 1 }),
    call('q1', 'ask_user_question', {
      questions: [
        { id: 'q1', question: 'Nút liên hệ màu gì?', options: [{ label: 'Đỏ' }, { label: 'Xanh lá' }] }
      ]
    })
  )
  assert.equal(asking.mode.getSnapshot().talking, 'progress')
  asking.talk(3)
  asking.links[0].handlers.onWords([], 'Đỏ')
  assert.equal(asking.stopped, 1)
})

test('hesitation alone is never sent; “okay” while Tracy works is listening, to an idle Tracy an answer', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Ừm…'], '')
  assert.equal(h.mode.getSnapshot().sendAt, null)
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
  await h.append(ev('turn/start', { turn: 1 }))
  h.links[0].handlers.onWords(['Ừm…', 'Ok.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0, 'said while it works: heard, not a new request')
  await h.append(said('Mình đăng luôn nhé?'), ev('turn/end', { turn: 1 }))
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Ok.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Ok.'],
    'after Tracy asked, "ok" is the answer'
  )
})

test('a phrase that stops on “và…” waits for the rest; a question goes like any phrase', async () => {
  const h = harness()
  await started(h)
  h.talk()
  const link = h.links[0]
  link.handlers.onWords(['Đổi màu nút liên hệ và'], '')
  assert.equal(h.mode.getSnapshot().sendAt, h.clock.now() + UNFINISHED_SEND_MS)
  await h.clock.advance(SEND_AFTER_MS + 500)
  assert.equal(h.sent.length, 0, 'the person is thinking')
  link.handlers.onWords(['Đổi màu nút liên hệ và', 'thêm số điện thoại.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi màu nút liên hệ và thêm số điện thoại.']
  )
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Trang chủ có mấy mục vậy?'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.at(-1).text, 'Trang chủ có mấy mục vậy?')
})

test('a phrase due to go waits while the person is still speaking and no word of it is read yet', async () => {
  const h = harness()
  await started(h)
  h.talk()
  const link = h.links[0]
  link.handlers.onWords(['Đổi tiêu đề trang chủ thành Chào mừng, và'], '')
  // On the stand the next phrase's first word came 2.5 s after the person began it.
  await h.clock.advance(UNFINISHED_SEND_MS - 500)
  for (let t = 0; t < 2500; t += 100) {
    h.talk(1)
    await h.clock.advance(100)
  }
  assert.equal(h.sent.length, 0, 'the person is speaking: it waits for their words')
  link.handlers.onWords(['Đổi tiêu đề trang chủ thành Chào mừng, và'], 'thêm một dòng')
  link.handlers.onWords(['Đổi tiêu đề trang chủ thành Chào mừng, và', 'thêm một dòng giới thiệu.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi tiêu đề trang chủ thành Chào mừng, và thêm một dòng giới thiệu.'],
    'one message, as the person said it'
  )
  // Noise that never turns into words holds a phrase no longer than the hold.
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Thêm logo.'], '')
  for (let t = 0; t < SEND_AFTER_MS + SPEAKING_HOLD_MS; t += 200) {
    h.talk(1)
    await h.clock.advance(200)
  }
  await h.clock.advance(SPEAKING_MS)
  assert.equal(h.sent.at(-1).text, 'Thêm logo.')
})

test('“dạ vâng” before a request is no part of it, unless it answers what Tracy asked', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Dạ vâng ạ.', 'Đổi tiêu đề trang chủ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi tiêu đề trang chủ.']
  )
  await h.endPlay()
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Xong. Mình đổi luôn màu nút cho hợp nhé?'),
    ev('turn/end', { turn: 1 })
  )
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Ừ.', 'Màu xanh lá.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.at(-1).text, 'Ừ. Màu xanh lá.', 'the answer, with its “ừ”')
  // To a Tracy that asked nothing, "ừ" alone is listening.
  await h.endPlay()
  await h.append(ev('turn/start', { turn: 2 }), said('Đã đổi màu.'), ev('turn/end', { turn: 2 }))
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Ừ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 2)
})

test('two things said in a row get one “got it”, said before the next line of the work', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Đổi tiêu đề.'], '')
  await h.clock.advance(SEND_AFTER_MS - 100)
  h.talk(2)
  // Sent, but the person speaks on: the "got it" waits for them.
  h.links[0].handlers.onWords(['Đổi tiêu đề.'], 'Và')
  h.links[0].handlers.onWords(['Đổi tiêu đề.', 'Và thêm logo.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 1, 'one phrase after the other, as one message')
  await h.endPlay()
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Logo ở bên trái.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  await h.append(call('c2', 'edit', {}))
  assert.equal(h.spoken.at(-1).text, 'Got it. I will work that in now.', 'not pushed aside by the work line')
  await h.endPlay()
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.at(-1).text, 'Making the changes.')
})

test('Tracy never starts a line while the person is speaking, even before a word of it is read', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk(3)
  await h.append(said('Xong rồi.'), ev('turn/end', { turn: 1 }))
  assert.equal(h.spoken.length, 0, 'the person is talking: the reply waits')
  h.talk(2)
  await h.clock.advance(SPEAKING_MS / 2)
  assert.equal(h.spoken.length, 0)
  h.quiet(8)
  await h.clock.advance(SPEAKING_MS * 2)
  assert.equal(
    h.spoken.at(-1).text,
    'Xong rồi.',
    'they stopped and said nothing Tracy could read: it goes on'
  )
})

test('a long stretch of work with nothing said: Tracy says it is still on it, not after the person stopped its talking', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.spoken.at(-1).text, 'Looking at your site.')
  await h.endPlay()
  await h.clock.advance(STILL_MS - 1000)
  assert.equal(h.spoken.length, 1)
  await h.clock.advance(1000)
  assert.equal(h.spoken.at(-1).text, 'Still working on it.')
  h.mode.stopTalking()
  await settle()
  await h.clock.advance(STILL_MS * 3)
  assert.equal(h.played.length, 2, 'quiet once the person stopped it')
})

test('a question is asked with its choices, and the words said next answer its card', async () => {
  const answers = []
  let pending = null
  const h = harness({ question: () => pending })
  await started(h)
  const questions = [
    {
      id: 'q1',
      question: 'Which colour for the button?',
      options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }]
    }
  ]
  await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions }))
  pending = { questions, answer: async (answer) => void answers.push(answer) }
  assert.equal(
    h.spoken.at(-1).text,
    'I have a question for you on screen. Which colour for the button? Red, Green hoặc Blue.'
  )
  await h.endPlay()
  h.talk()
  h.links[0].handlers.onWords(['Green, please.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(answers, [{ answers: [{ id: 'q1', selected: ['Green'] }] }])
  assert.equal(h.sent.length, 0, 'an answer, not a message waiting behind the card')
  assert.equal(h.spoken.at(-1).text, 'Okay, on it.')
  // A card that takes no answer any more: the words go as a message.
  await h.endPlay()
  pending = { questions, answer: async () => Promise.reject(new Error('gone')) }
  h.talk()
  h.links.at(-1).handlers.onWords(['Actually make it orange.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Actually make it orange.']
  )
})

test('the reply waits for the person to finish a phrase, never talks over them', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  h.links[0].handlers.onWords([], 'Một điều nữa')
  await h.append(said('Done.'), ev('turn/end', { turn: 1 }))
  assert.equal(h.spoken.length, 0)
  h.links[0].handlers.onWords(['Một điều nữa là thêm logo.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.at(-1).text, 'Một điều nữa là thêm logo.')
  assert.equal(h.spoken[0].text, 'Done.', 'the reply first, then nothing over it')
})

test('a turn that failed with nothing written is said, never silent; one the person stopped stays quiet', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    ev('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'UNKNOWN' } } })
  )
  assert.equal(h.spoken.at(-1).text, 'Something went wrong, so I stopped. The details are in the chat.')
  await h.endPlay()
  const count = h.spoken.length
  await h.append(
    ev('turn/start', { turn: 2 }),
    ev('turn/end', { turn: 2, reason: { kind: 'aborted', reason: 'user' } })
  )
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.length, count)
  // Cut off by a dsh restart: the step it was on is never read as its answer.
  await h.append(
    ev('turn/start', { turn: 3 }),
    said('Let me look at the page first.'),
    call('c3', 'read', {}),
    ev('turn/end', { turn: 3, reason: { kind: 'interrupted' } })
  )
  await h.endPlay()
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.at(-1).text, 'Something went wrong, so I stopped. The details are in the chat.')
})

test('a choice said after Tracy read it out is the person choosing, not Tracy’s voice coming back', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đổi nút liên hệ sang màu Đỏ hay Xanh lá?'),
    ev('turn/end', { turn: 1 })
  )
  await h.endPlay()
  await h.clock.advance(1000)
  h.talk()
  h.links[0].handlers.onWords(['Xanh lá.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Xanh lá.']
  )
})

test('a question card being read: “ừ” said over it stops Tracy and answers the card', async () => {
  const answers = []
  let pending = null
  const h = harness({ question: () => pending })
  await started(h)
  const questions = [
    { id: 'q1', question: 'Giữ màu này chứ?', options: [{ label: 'Giữ' }, { label: 'Đổi' }] }
  ]
  await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions }))
  pending = { questions, answer: async (answer) => void answers.push(answer) }
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  h.talk(3)
  h.links[0].handlers.onWords([], 'Ừ')
  assert.equal(h.stopped, 1, 'the person answers: Tracy stops')
  h.links[0].handlers.onWords(['Ừ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(answers, [{ answers: [{ id: 'q1', selected: [], custom: 'Ừ.' }] }])
})

test('a fan or air conditioning louder than the fixed threshold is the room, not the person: one session at most, then speech still opens one', async () => {
  const h = harness()
  await started(h)
  const fan = (frames) => {
    for (let i = 0; i < frames; i += 1) h.mics.at(-1).onFrame(new Int16Array(1600).fill(900).buffer)
  }
  // Before the room is known, the fan may open one session; it hears no word and is let go.
  fan(NOISE_SETTLE)
  await h.clock.advance(NO_WORDS_MS + SPEAKING_MS)
  fan(40)
  await h.clock.advance(NO_WORDS_MS + SPEAKING_MS)
  fan(40)
  assert.ok(h.links.length <= 1, `${h.links.length} sessions for a fan`)
  assert.equal(h.links.at(-1)?.closed ?? true, true, 'none left open')
  // The person speaks over the fan: heard.
  h.talk(3)
  assert.equal(h.links.at(-1).closed, false)
  assert.equal(h.mode.getSnapshot().hearing, true)
})

test('words the service shows and never confirms: once the person is quiet it is asked to finish them; unfinished, they stay for Send now', async () => {
  const h = harness()
  await started(h)
  h.talk()
  const link = h.links[0]
  // Measured on the stand, 17/10/2026: the phrase shown, never confirmed, held 30 s.
  link.handlers.onWords([], 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé')
  h.quiet(3)
  await h.clock.advance(STUCK_WORDS_MS - 500)
  assert.equal(link.stopped, false, 'not yet: the service may still confirm it')
  await h.clock.advance(1000)
  assert.equal(link.stopped, true, 'asked to finish the phrase')
  assert.deepEqual(h.sent, [], 'shown words are never taken for finished ones (council 18/10/2026)')
  // The service finishes it: that goes.
  link.handlers.onWords(['À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.'], '')
  link.handlers.onEnd('stopped', true)
  await settle()
  assert.deepEqual(h.sent, [{ sessionId: SESSION, text: 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.' }])
  // The service cannot finish another: it stays on screen, held, and Send now sends it.
  await h.endPlay()
  h.quiet(10)
  h.talk()
  const next = h.links.at(-1)
  next.handlers.onWords([], 'Thêm một dòng giới thiệu')
  h.quiet(3)
  await h.clock.advance(STUCK_WORDS_MS + 500)
  assert.equal(next.stopped, true)
  next.handlers.onEnd('stopped', false)
  await settle()
  assert.equal(h.sent.length, 1, 'unfinished words are not sent by themselves')
  assert.equal(h.mode.getSnapshot().words, 'Thêm một dòng giới thiệu')
  h.mode.sendNow()
  await settle()
  assert.equal(h.sent.at(-1).text, 'Thêm một dòng giới thiệu')
  // Words that keep changing, or a person still speaking, are not stuck.
  h.quiet(10)
  h.talk()
  const moving = h.links.at(-1)
  for (let t = 0; t < STUCK_WORDS_MS * 2; t += 500) {
    moving.handlers.onWords([], `Thêm một ${'chữ '.repeat(t / 500 + 1)}`.trim())
    h.talk(1)
    await h.clock.advance(500)
  }
  assert.equal(moving.stopped, false)
})

test('a session is never let go while the person is still speaking, even with no word read yet', async () => {
  const h = harness()
  await started(h)
  for (let t = 0; t < NO_WORDS_MS + 3000; t += 100) {
    h.talk(1)
    await h.clock.advance(100)
  }
  assert.equal(h.links[0].closed, false, 'still speaking: still heard')
  h.quiet(5)
  await h.clock.advance(NO_WORDS_MS + SPEAKING_MS)
  assert.equal(h.links[0].closed, true, 'quiet and no word: let go')
})

test('“khoan đã” or “dừng lại” said alone while Tracy works stops the work; “khoan đã, để …” is a correction steered in', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  h.links[0].handlers.onWords(['Khoan đã, để màu đỏ thì hơn.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.cancels, [])
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Khoan đã, để màu đỏ thì hơn.']
  )
  assert.deepEqual(h.modes, ['steer'])
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Ừ.', 'Dừng lại đi.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.cancels, [SESSION])
  assert.equal(h.sent.length, 1, 'a stop is not a message')
  assert.equal(h.spoken.at(-1).text, 'Stopped. Anything already saved stays.')
  // The turn ends as stopped: what it last wrote is not read.
  await h.endPlay()
  await h.append(
    said('Mình đang xem trang chủ.'),
    ev('turn/end', { turn: 1, reason: { kind: 'aborted', reason: 'user' } })
  )
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.at(-1).text, 'Stopped. Anything already saved stays.')
})

test('“khoan đã” alone, said over Tracy’s reply, only stops its talking: never a message', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đã đổi tiêu đề trang chủ, và thêm một dòng giới thiệu ở dưới.'),
    ev('turn/end', { turn: 1 })
  )
  assert.equal(h.mode.getSnapshot().talking, 'reply')
  h.talk(3)
  h.links[0].handlers.onWords([], 'Khoan')
  assert.equal(h.stopped, 1)
  h.links[0].handlers.onWords(['Khoan đã.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
  assert.deepEqual(h.cancels, [], 'nothing was running to stop')
})

test('a question left unanswered is asked once more after a quiet while, then Tracy waits', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Xong rồi. Bạn muốn nút màu đỏ hay xanh lá?'),
    ev('turn/end', { turn: 1 })
  )
  assert.equal(h.spoken.at(-1).text, 'Xong rồi. Bạn muốn nút màu đỏ hay xanh lá?')
  await h.endPlay()
  h.quiet(5)
  await h.clock.advance(REPROMPT_MS)
  assert.equal(h.spoken.at(-1).text, 'Bạn muốn nút màu đỏ hay xanh lá?', 'asked once more')
  await h.endPlay()
  const count = h.spoken.length
  await h.clock.advance(REPROMPT_MS * 3)
  assert.equal(h.spoken.length, count, 'only once')
  // Speech before the time is up: not asked again.
  await h.append(
    ev('turn/start', { turn: 2 }),
    said('Bạn muốn thêm logo không?'),
    ev('turn/end', { turn: 2 })
  )
  await h.endPlay()
  await h.clock.advance(REPROMPT_MS / 2)
  h.talk(3)
  await h.clock.advance(REPROMPT_MS)
  assert.equal(h.spoken.at(-1).text, 'Bạn muốn thêm logo không?')
})

test('the connection to the speech service dropping once goes on listening; twice pauses', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onEnd('network', false)
  assert.equal(h.mode.getSnapshot().phase, 'on', 'once: still listening')
  assert.equal(h.mode.getSnapshot().notice?.key, 'voiceMode.end.reconnecting')
  await h.clock.advance(1000)
  h.quiet(10)
  h.talk()
  assert.equal(h.links.length, 2, 'the next speech opens a new session')
  h.links[1].handlers.onWords([], 'Đổi')
  assert.equal(h.mode.getSnapshot().notice, null, 'words again: the note goes')
  h.links[1].handlers.onEnd('network', false)
  // Words the service never finished are never sent by themselves (council 18/10/2026): kept.
  assert.deepEqual(h.sent, [])
  assert.equal(h.mode.getSnapshot().phase, 'paused', 'twice within half a minute: paused')
  h.mode.resume()
  await settle()
  assert.equal(
    h.mode.getSnapshot().heldWords,
    'Đổi',
    'still there in the separate manual draft to send or drop'
  )
})

test('a line said every time takes its wordings in turn, so Tracy does not sound like a recording', async () => {
  const h = harness()
  await started(h)
  const ask = async (words) => {
    h.talk()
    h.links.at(-1).handlers.onWords([words], '')
    await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
    const saying = h.mode.getSnapshot().saying
    await h.endPlay()
    return saying
  }
  assert.deepEqual(
    [await ask('Đổi tiêu đề.'), await ask('Thêm logo.'), await ask('Đổi màu nút.')],
    ['Okay, on it.', 'Sure, starting now.', 'Okay, on it.']
  )
  assert.equal(h.spoken.length, 2, 'each wording read once, then played from the page’s copy')
})

test('laughter and the sound tags the service writes are never a message', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Haha.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  h.links[0].handlers.onWords(['Haha.', '(laughs)'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
  h.links[0].handlers.onWords(['Haha.', '(laughs)', '(cười) Đổi tiêu đề thôi.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi tiêu đề thôi.']
  )
})

test('the footer’s Stop stops the work, as dsh’s Stop button would', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  h.mode.stopWork()
  await settle()
  assert.equal(h.stopped, 1, 'what Tracy was saying stops')
  assert.deepEqual(h.cancels, [SESSION])
  assert.equal(h.spoken.at(-1).text, 'Stopped. Anything already saved stays.')
})

test('words counting down when the work is stopped wait for Send now; they never restart the work by themselves', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  h.links[0].handlers.onWords(['Thêm một dòng giới thiệu.'], '')
  assert.ok(h.mode.getSnapshot().sendAt !== null)
  h.mode.stopWork()
  await settle()
  assert.deepEqual(h.cancels, [SESSION])
  assert.equal(h.mode.getSnapshot().sendAt, null, 'no countdown left')
  assert.equal(h.mode.getSnapshot().words, 'Thêm một dòng giới thiệu.', 'still on screen')
  await h.clock.advance(SPEAKING_HOLD_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0, 'not sent by itself')
  h.mode.sendNow()
  await settle()
  assert.deepEqual(h.sent, [{ sessionId: SESSION, text: 'Thêm một dòng giới thiệu.' }])
})

test('a request still being finished when the work is stopped is held too; speech begun after the Stop goes as usual', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  const link = h.links[0]
  // On the real page, 17/10/2026: Stop pressed as the person ended the phrase; confirmed 0.3 s later.
  link.handlers.onWords([], 'Thêm một dòng giới thiệu')
  h.mode.stopWork()
  await settle()
  link.handlers.onWords(['Thêm một dòng giới thiệu ngắn ở bên dưới.'], '')
  await h.clock.advance(SPEAKING_HOLD_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0, 'not sent by itself')
  assert.equal(h.mode.getSnapshot().words, 'Thêm một dòng giới thiệu ngắn ở bên dưới.')
  // Tracy says the work stopped without waiting for the words on screen (on the stand it waited 15 s).
  assert.equal(h.spoken.at(-1).text, 'Stopped. Anything already saved stays.')
  const stops = h.stopped
  link.handlers.onWords(['Thêm một dòng giới thiệu ngắn ở bên dưới.'], '')
  assert.equal(h.stopped, stops, 'the same words again do not cut Tracy off')
  // The person speaks again after a pause: that is a new request, and goes with what is on screen.
  h.quiet(10)
  await h.clock.advance(SPEAKING_MS)
  h.talk()
  link.handlers.onWords(['Thêm một dòng giới thiệu ngắn ở bên dưới.', 'Làm tiếp đi.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [
    { sessionId: SESSION, text: 'Thêm một dòng giới thiệu ngắn ở bên dưới. Làm tiếp đi.' }
  ])
})

test('the phrases said the moment words go are read when the voice starts, and then play at once', async () => {
  const h = harness({ warm: true })
  await started(h)
  await settle()
  assert.deepEqual(
    h.spoken.map((x) => x.text),
    [
      'Okay, on it.',
      'Sure, starting now.',
      'Got it. I will work that in now.',
      'Noted, I am changing course now.'
    ]
  )
  h.talk()
  h.links[0].handlers.onWords(['Đổi tiêu đề.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 1)
  assert.equal(h.spoken.length, 4, 'played from the page’s copy, not read again')
  assert.equal(h.played.length, 1)
})

test('Stop speaking quiets the turn’s work lines; its reply is still read', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  h.mode.stopTalking()
  await settle()
  assert.equal(h.stopped, 1)
  await h.clock.advance(PROGRESS_GAP_MS)
  await h.append(call('c2', 'edit', {}))
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.equal(h.spoken.length, 1)
  await h.append(said('Finished.'), ev('turn/end', { turn: 1 }))
  assert.equal(h.spoken.at(-1).text, 'Finished.')
})

test('a question card is said at once, with its question', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    call('q1', 'ask_user_question', {
      questions: [{ question: 'Which page should get the button?', options: [] }]
    })
  )
  assert.equal(h.mode.getSnapshot().tracy, 'asking')
  assert.equal(h.spoken.at(-1).text, 'I have a question for you on screen. Which page should get the button?')
  await h.endPlay()
  await h.append(result('q1'))
  assert.equal(h.mode.getSnapshot().tracy, 'working')
})

test('a card offering “Huỷ” or “Cancel”: saying it answers the card; “dừng lại” still stops the work', async () => {
  for (const [labels, say] of [
    [['Xoá', 'Huỷ'], 'Huỷ.'],
    [['Delete', 'Cancel'], 'Cancel.'],
    [['删除', '取消'], '取消。']
  ]) {
    const answers = []
    /** @type {any} */
    let pending = null
    const h = harness({ question: () => pending })
    await started(h)
    const questions = [
      { id: 'q1', question: 'Delete the old About page?', options: labels.map((label) => ({ label })) }
    ]
    await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions }))
    pending = { questions, answer: async (/** @type {any} */ a) => void answers.push(a) }
    await h.endPlay()
    h.talk()
    h.links[0].handlers.onWords([say], '')
    await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
    assert.deepEqual(answers, [{ answers: [{ id: 'q1', selected: [labels[1]] }] }], say)
    assert.deepEqual(h.cancels, [], `${say} picks the card’s choice; the turn goes on`)
  }
  const h = harness({
    question: () => ({
      questions: [{ id: 'q1', question: 'Delete it?', options: [{ label: 'Xoá' }, { label: 'Huỷ' }] }],
      answer: async () => {}
    })
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions: [] }))
  await h.endPlay()
  h.talk()
  h.links[0].handlers.onWords(['Dừng lại.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.cancels, [SESSION], 'a stop that names no choice stops the work')
})

test('a second card the same turn asks after the first is answered is read too', async () => {
  /** @type {any} */
  let pending = null
  const answers = []
  const h = harness({ question: () => pending })
  await started(h)
  const card = (id, question, labels) => [{ id, question, options: labels.map((label) => ({ label })) }]
  const q1 = card('a', 'Which page?', ['Home', 'About'])
  await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions: q1 }))
  pending = { questions: q1, answer: async (/** @type {any} */ a) => void answers.push(a) }
  await h.endPlay()
  h.talk()
  h.links[0].handlers.onWords(['Home.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  pending = null
  await h.endPlay()
  await h.append(result('q1'))
  // On the stand's flow, the agent asked its second question in the same turn; Tracy stayed silent.
  const q2 = card('b', 'Which colour?', ['Red', 'Green'])
  await h.append(call('q2', 'ask_user_question', { questions: q2 }))
  assert.equal(h.mode.getSnapshot().tracy, 'asking')
  assert.match(h.spoken.at(-1).text, /Which colour\? .*Red.*Green/)
})

test('a question that comes while another line plays is asked when that line ends, not a gap later', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  const questions = [{ id: 'a', question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Green' }] }]
  await h.append(call('q1', 'ask_user_question', { questions }))
  await h.clock.advance(1500)
  await h.endPlay()
  assert.match(h.spoken.at(-1).text, /Which colour\?/, 'asked as soon as the work line ended')
})

test('a one-word answer after Say it again is the person answering, not words over Tracy', async () => {
  const h = harness()
  await started(h)
  await h.append(
    ev('turn/start', { turn: 1 }),
    said('Mình đổi nút liên hệ ở trang chủ rồi. Bạn muốn màu Đỏ hay Xanh lá?'),
    ev('turn/end', { turn: 1 })
  )
  // The person talks over the reply, then thinks better of it: Say it again.
  h.talk(3)
  h.links[0].handlers.onWords([], 'khoan để mình')
  h.mode.dropWords()
  await h.endPlay()
  await h.clock.advance(ECHO_MS + 2000)
  h.quiet(10)
  h.talk()
  h.links.at(-1).handlers.onWords(['Đỏ.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Đỏ.']
  )
})

test('Send now confirms the phrase being spoken, then sends it', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Đổi tiêu đề'], 'thành Chào mừng')
  h.mode.sendNow()
  assert.equal(h.links[0].stopped, true)
  h.links[0].handlers.onWords(['Đổi tiêu đề', 'thành Chào mừng.'], '')
  h.links[0].handlers.onEnd('stopped', true)
  await settle()
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Đổi tiêu đề thành Chào mừng.']
  )
})

test('Say it again drops the words heard; a session with no word at all is let go quietly', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Sai rồi.'], '')
  h.mode.dropWords()
  assert.equal(h.links[0].closed, true)
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.sent.length, 0)
  h.talk()
  assert.equal(h.links.length, 2)
  await h.clock.advance(NO_WORDS_MS)
  assert.equal(h.links[1].closed, true)
  assert.equal(h.mode.getSnapshot().phase, 'on', 'a cough is no reason to pause')
})

test('the service’s end reasons: silence goes on, quota and another tab pause with a word', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onEnd('silence', true)
  await settle()
  assert.equal(h.mode.getSnapshot().phase, 'on')
  h.talk()
  h.links[1].handlers.onEnd('quota', true)
  await settle()
  assert.equal(h.mode.getSnapshot().phase, 'paused')
  assert.deepEqual(h.mode.getSnapshot().notice, { key: 'voiceMode.end.quota' })
  assert.equal(h.mics[0].closed, true, 'paused, the microphone is closed')
  h.mode.resume()
  await settle()
  assert.equal(h.mode.getSnapshot().phase, 'on')
  assert.equal(h.mics.length, 2)
})

test('a hidden page, a long quiet and another box’s microphone pause it', async () => {
  const h = harness()
  await started(h)
  h.mode.hidden()
  assert.deepEqual(h.mode.getSnapshot().notice, { key: 'voiceMode.end.hidden' })
  h.mode.resume()
  await settle()
  await h.clock.advance(IDLE_MS)
  assert.equal(h.mode.getSnapshot().phase, 'paused')
  assert.equal(h.mode.getSnapshot().notice?.key, 'voiceMode.end.idle')
  h.mode.resume()
  await settle()
  h.claimedAway()
  assert.equal(h.mode.getSnapshot().phase, 'paused')
  assert.equal(h.mode.getSnapshot().notice, null)
})

test('pausing the moment the person begins to speak opens no session and sends nothing', async () => {
  const h = harness()
  await started(h)
  const mic = h.mics.at(-1)
  // The real microphone hands over its last short frame as it closes (`voice-capture.ts`).
  mic.close = async () => {
    mic.onFrame(new Int16Array(800).fill(4000).buffer)
    mic.closed = true
  }
  h.quiet(12)
  h.talk(1)
  h.mode.pause()
  await settle()
  assert.equal(h.mode.getSnapshot().phase, 'paused')
  assert.equal(h.links.length, 0, 'no voice session while paused')
  await h.clock.advance(STUCK_WORDS_MS + SPEAKING_MS)
  assert.deepEqual(h.sent, [])
})

test('out of characters for today: said once, and nothing more is read', async () => {
  const h = harness({
    speakAnswer: () => new Response(JSON.stringify({ code: 'SPEAK_QUOTA' }), { status: 429 })
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), said('Done.'), ev('turn/end', { turn: 1 }))
  assert.deepEqual(h.mode.getSnapshot().notice, { key: 'voiceMode.reading.quota' })
  const asked = h.spoken.length
  await h.append(ev('turn/start', { turn: 2 }), said('Again.'), ev('turn/end', { turn: 2 }))
  assert.equal(h.spoken.length, asked)
})

test('End lets everything go; the voice picked stays', async () => {
  const h = harness()
  await started(h)
  h.mode.setVoice('v2')
  h.mode.setVoice('not-offered')
  assert.equal(h.mode.getSnapshot().voice, 'v2')
  h.talk()
  h.mode.end()
  assert.equal(h.mode.getSnapshot().phase, 'off')
  assert.equal(h.mode.getSnapshot().voice, 'v2')
  assert.equal(h.links[0].closed, true)
  assert.equal(h.mics[0].closed, true)
  assert.equal(h.releaseCount, 1)
})

test('a delayed TTS response after leaving Voice is cancelled and never played', async () => {
  let finish
  let cancelled = false
  const h = harness({
    speakAnswer: () =>
      new Promise((resolve) => {
        finish = resolve
      })
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), said('A short answer.'), ev('turn/end', { turn: 1 }))
  assert.equal(typeof finish, 'function')
  h.mode.end()
  await settle()
  finish(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        }
      })
    )
  )
  await settle()
  assert.equal(h.played.length, 0)
  assert.equal(cancelled, true)
})

test('a provider capability can disable speculative prewarming without disabling spoken replies', async () => {
  const h = harness({ warm: () => false })
  await started(h)
  await settle()
  assert.equal(h.spoken.length, 0)
  await h.append(ev('turn/start', { turn: 1 }), said('A short answer.'), ev('turn/end', { turn: 1 }))
  assert.ok(h.spoken.some((x) => x.text === 'A short answer.'))
})

test('configuration revision rejection ends Voice, refreshes facts and never replays a prompt', async () => {
  let refreshed = 0
  const h = harness({
    onRestartRequired: () => refreshed++,
    speakAnswer: () => new Response(JSON.stringify({ code: 'VOICE_RESTART_REQUIRED' }), { status: 409 })
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), said('A short answer.'), ev('turn/end', { turn: 1 }))
  assert.equal(h.mode.getSnapshot().phase, 'off')
  assert.equal(h.mode.getSnapshot().notice.key, 'voiceMode.end.configChanged')
  assert.equal(refreshed, 1)
  assert.equal(h.sent.length, 0)
  assert.equal(h.played.length, 0)
})

test('a new provider configuration never reuses the previous configuration’s warmed speech', async () => {
  let scope = 'revision-one:elevenlabs'
  const h = harness({ warm: true, cacheScope: () => scope })
  await started(h)
  await settle()
  assert.equal(h.spoken.length, 4)
  h.mode.end()
  scope = 'revision-two:elevenlabs'
  await started(h)
  await settle()
  assert.equal(h.spoken.length, 8)
})

test('talked over a line of the work, a reply waiting behind it is kept, and read with its question', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  // The turn ends while that line plays: its reply, with its question, waits behind it.
  await h.append(said('Mình đã đổi màu nút. Bạn muốn đổi cả chân trang không?'), ev('turn/end', { turn: 1 }))
  // The person talks over the line with a new request (it was lost, with the question it asked).
  h.talk(3)
  h.links[0].handlers.onWords([], 'Thêm logo')
  h.links[0].handlers.onWords(['Thêm logo vào đầu trang.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  await h.endPlay()
  await h.clock.advance(PROGRESS_GAP_MS)
  await h.endPlay()
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Thêm logo vào đầu trang.']
  )
  assert.ok(
    h.spoken.some((x) => /chân trang/.test(x.text)),
    h.spoken.map((x) => x.text).join(' | ')
  )
})

test('a spoken stop to an idle Tracy drops the reply that waited too', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  await h.append(said('Xong rồi.'), ev('turn/end', { turn: 1 }))
  h.talk(3)
  h.links[0].handlers.onWords(['Dừng lại.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  await settle()
  const read = h.spoken.map((x) => x.text)
  assert.ok(!read.includes('Xong rồi.'), 'nothing more is read')
})

test('words held by the Stop outlive the session: a quiet and the service closing keep them; a new finished phrase takes their place', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  await h.endPlay()
  h.talk(3)
  h.links[0].handlers.onWords([], 'Đổi tiêu đề thành')
  h.mode.stopWork()
  await settle()
  h.links[0].handlers.onWords(['Đổi tiêu đề thành Chào mừng.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [])
  // Quiet for a long while: the session closes, the words stay (they vanished after 12 s).
  h.quiet(5)
  await h.clock.advance(12_000 + SPEAKING_MS)
  assert.equal(h.links[0].closed, true)
  assert.equal(h.mode.getSnapshot().words, 'Đổi tiêu đề thành Chào mừng.')
  await h.clock.advance(60_000)
  assert.equal(h.mode.getSnapshot().words, 'Đổi tiêu đề thành Chào mừng.', 'no timer takes them')
  // A cough after: nothing replaces them.
  h.talk(3)
  h.links.at(-1).handlers.onWords(['Ừm.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(h.mode.getSnapshot().words, 'Đổi tiêu đề thành Chào mừng.')
  assert.deepEqual(h.sent, [])
  // Send now sends them, though the session they were heard in is gone.
  h.mode.sendNow()
  await settle()
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Đổi tiêu đề thành Chào mừng.']
  )
})

test('a new finished request after the Stop takes the place of the words held, and goes as usual', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  await h.endPlay()
  h.talk(3)
  h.links[0].handlers.onWords(['Đổi màu nút.'], '')
  h.mode.stopWork()
  await settle()
  h.quiet(5)
  await h.clock.advance(12_000 + SPEAKING_MS)
  await h.endPlay()
  assert.equal(h.mode.getSnapshot().words, 'Đổi màu nút.')
  await h.clock.advance(ECHO_MS)
  h.quiet(10)
  h.talk(3)
  const link = h.links.at(-1)
  link.handlers.onWords([], 'Thêm logo')
  assert.equal(
    h.mode.getSnapshot().words,
    'Đổi màu nút.',
    'not replaced by the first word of what comes next'
  )
  link.handlers.onWords(['Thêm logo vào đầu trang.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['Thêm logo vào đầu trang.']
  )
})

test('a question line of a card answered before it was said is not said', async () => {
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  assert.equal(h.mode.getSnapshot().talking, 'progress')
  const questions = [{ id: 'a', question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Green' }] }]
  await h.append(call('q1', 'ask_user_question', { questions }))
  // Answered on screen while the work line still plays.
  await h.append(result('q1'))
  await h.endPlay()
  await h.clock.advance(PROGRESS_GAP_MS)
  assert.ok(!h.spoken.some((x) => /Which colour/.test(x.text)), 'a question no card asks any more')
})

test('a plan waiting on the person’s review: Tracy says so, steers nothing into the turn, and goes to the chat', async () => {
  let reviewing = false
  let chats = 0
  const h = harness({ planReview: () => reviewing, showChat: () => (chats += 1) })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('c1', 'read', {}))
  await h.endPlay()
  reviewing = true
  await h.append(call('p1', 'exit_plan_mode', { plan: '# Đổi màu nút' }))
  assert.equal(h.mode.getSnapshot().tracy, 'asking', 'not "still working"')
  assert.equal(h.spoken.at(-1).text, 'I have a plan for you to review on screen.')
  // Words said meanwhile are not steered into the blocked turn.
  h.talk(3)
  h.links[0].handlers.onWords(['Ừ, làm đi.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [])
  await h.endPlay()
  assert.equal(chats, 1, 'the chat, where the review card is')
})

test('a plan the window shows that dsh does not hold for review yet is asked about again shortly', async () => {
  let reviewing = false
  let chats = 0
  const h = harness({ planReview: () => reviewing, showChat: () => (chats += 1) })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('p1', 'exit_plan_mode', { plan: '# Plan' }))
  assert.equal(h.spoken.length, 0, 'the window alone is no proof')
  reviewing = true
  await h.clock.advance(1000)
  assert.equal(h.spoken.at(-1)?.text, 'I have a plan for you to review on screen.')
  await h.endPlay()
  assert.equal(chats, 1)
})

test('Voice pressed with a plan already waiting on review: once the voice is on, Tracy says so and goes to the chat', async () => {
  let chats = 0
  const h = harness({
    entries: [
      { type: 'event', event: ev('turn/start', { turn: 1 }) },
      { type: 'event', event: call('p1', 'exit_plan_mode', { plan: '# Plan' }) }
    ],
    planReview: () => true,
    showChat: () => (chats += 1)
  })
  h.mode.start(SESSION)
  // Still opening: going to the chat now would be undone by the press that showed the voice view.
  assert.equal(chats, 0)
  await settle()
  await h.clock.advance(1000)
  assert.equal(h.mode.getSnapshot().phase, 'on')
  assert.equal(h.spoken.at(-1)?.text, 'I have a plan for you to review on screen.')
  await h.endPlay()
  assert.equal(chats, 1)
})

test('failed or unsettled endings retain pending words without timer replay or question answers', async () => {
  for (const [reason, settled] of [
    ['network', false],
    ['provider', true],
    ['quota', true],
    ['silence', false]
  ]) {
    let answered = 0
    const h = harness({
      question: () => ({
        questions: [],
        answer: async () => {
          answered += 1
        }
      })
    })
    await started(h)
    h.talk()
    const link = h.links[0]
    link.handlers.onWords(['Change the title please.'], '')
    link.handlers.onEnd(reason, settled)
    await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS + 100)
    assert.equal(h.sent.length, 0, reason)
    assert.equal(answered, 0, reason)
    assert.equal(
      reason === 'silence' ? h.mode.getSnapshot().words : h.mode.getSnapshot().heldWords,
      'Change the title please.',
      reason
    )
    link.handlers.onEnd('silence', true)
    link.handlers.onWords(['Late old phrase.'], '')
    await settle()
    assert.equal(h.sent.length, 0, 'late callbacks cannot admit the old stream')
    h.mode.dropHeldWords()
    assert.equal(h.mode.getSnapshot().heldWords, '')
  }
})

test('network recovery keeps old words separate and automatically submits only the fresh utterance', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Keep this uncertain.'], 'unfinished')
  h.links[0].handlers.onEnd('network', false)
  h.talk()
  h.links[1].handlers.onWords(['Fresh request only.'], '')
  h.mode.sendHeldWords()
  assert.equal(h.sent.length, 0, 'manual old draft cannot consume the active phrase')
  h.links[1].handlers.onEnd('silence', true)
  await settle()
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Fresh request only.']
  )
  assert.equal(h.mode.getSnapshot().heldWords, 'Keep this uncertain. unfinished')
})

test('each phrase sent is traced on the page’s clock: end of speech → confirmed → sent → “got it” heard → reply heard; spans only', async () => {
  const h = harness()
  await started(h)
  h.talk()
  await h.clock.advance(700)
  h.links[0].handlers.onWords(['Đổi màu nút liên hệ sang xanh.'], '')
  await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  assert.equal(h.sent.length, 1)
  assert.equal(h.traces.length, 0, 'reported once the turn is done with, not before')
  await h.endPlay()
  await h.clock.advance(1200)
  await h.append(ev('turn/start', { turn: 1 }), said('Đã đổi màu nút.'), ev('turn/end', { turn: 1 }))
  assert.equal(h.traces.length, 1, 'reported the moment its reply starts to be heard')
  const [record] = h.traces
  assert.equal(typeof record.id, 'string')
  const { id, ...spans } = record
  assert.deepEqual(spans, {
    speechToCommit: 700,
    commitToSent: SEND_AFTER_MS,
    sentToAck: 0,
    sentToReply: 2000,
    speechToReply: 3000,
    ackCached: 0,
    error: 0,
    interrupted: 0,
    pressed: 0
  })
  assert.ok(
    Object.values(spans).every((v) => typeof v === 'number'),
    'numbers only: no words leave the page with it'
  )
  await h.endPlay()
  // The next turn's "got it" plays from the page's copy: said so.
  h.talk()
  h.links.at(-1).handlers.onWords(['Thêm logo nữa.'], '')
  await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  await h.endPlay()
  await h.append(ev('turn/start', { turn: 2 }), said('Đã thêm.'), ev('turn/end', { turn: 2 }))
  assert.equal(h.traces.length, 2)
  assert.notEqual(h.traces[1].id, id, 'each turn its own id')
})

test('a traced turn cut off before its reply, or not sent, says so; a reply waiting from before is not taken for its own', async () => {
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Đổi tiêu đề.'], '')
  await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  await h.endPlay()
  // Spoken again before any reply: the first turn is let go as cut off.
  h.talk()
  h.links.at(-1).handlers.onWords(['À thôi, để nguyên.'], '')
  await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  assert.equal(h.traces.length, 1)
  assert.equal(h.traces[0].interrupted, 1)
  assert.equal(h.traces[0].error, 0)
  assert.equal('sentToReply' in h.traces[0], false)
  await h.endPlay()
  // Leaving Voice cuts the second one off too.
  h.mode.end()
  assert.equal(h.traces.length, 2)
  assert.equal(h.traces[1].interrupted, 1)
  // Words that could not be sent: a failed turn, reported at once.
  const failing = harness({ sendResult: 'failed' })
  await started(failing)
  failing.talk()
  failing.links[0].handlers.onWords(['Đổi màu nền.'], '')
  await failing.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  assert.equal(failing.traces.length, 1)
  assert.equal(failing.traces[0].error, 1)
  assert.equal(failing.traces[0].interrupted, 0)
  assert.equal('commitToSent' in failing.traces[0], false, 'never sent: no span to sent')
})

test('“tắt Voice” said alone: the microphone stops at once, Tracy says one line, then the chat; nothing is sent, the work goes on', async () => {
  let chats = 0
  const h = harness({
    showChat: () => {
      chats += 1
    }
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  h.links[0].handlers.onWords(['Tắt Voice.'], '')
  assert.equal(h.mics[0].closed, true, 'the microphone stops at once')
  assert.equal(h.links[0].closed, true)
  assert.equal(h.mode.getSnapshot().words, '')
  assert.equal(h.spoken.at(-1).text, 'Okay, back to the chat.')
  assert.equal(chats, 0, 'the line is said first')
  // Nothing more of the work is said meanwhile.
  await h.append(call('c1', 'tracy_site', { action: 'content.replace', params: {} }))
  await h.endPlay()
  assert.equal(chats, 1)
  await h.clock.advance(PROGRESS_GAP_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [], 'never a message')
  assert.deepEqual(h.cancels, [], 'the work goes on')
  assert.equal(h.spoken.filter((s) => s.text === 'Okay, back to the chat.').length, 1)
})

test('a goodbye said alone leaves Voice; inside a request it is the request; a line that cannot be read leaves anyway', async () => {
  let chats = 0
  const h = harness({
    showChat: () => {
      chats += 1
    },
    speakAnswer: () => new Response(JSON.stringify({ code: 'SPEAK_PROVIDER' }), { status: 502 })
  })
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['Đổi chữ tạm biệt ở chân trang thành hẹn gặp lại.'], '')
  await h.clock.advance(SEND_AFTER_MS + SPEAKING_MS)
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Đổi chữ tạm biệt ở chân trang thành hẹn gặp lại.']
  )
  assert.equal(chats, 0)
  h.talk()
  h.links.at(-1).handlers.onWords(['Tạm biệt nhé.'], '')
  await settle()
  assert.equal(chats, 1, 'the line could not be read: back to the chat all the same')
  assert.equal(h.sent.length, 1)
})

test('while a question card waits, a goodbye may be its answer; “tắt Voice” still leaves, and the card stays', async () => {
  const answers = []
  let chats = 0
  const questions = [
    { id: 'q1', question: 'Keep the old page?', options: [{ label: 'Yes' }, { label: 'No' }] }
  ]
  const pending = { questions, answer: async (answer) => void answers.push(answer) }
  const h = harness({
    question: () => pending,
    showChat: () => {
      chats += 1
    }
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call('q1', 'ask_user_question', { questions }))
  await h.endPlay()
  h.talk()
  h.links[0].handlers.onWords(['Bye.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.equal(answers.length, 1, 'the card took it as its answer')
  assert.equal(chats, 0)
  await h.endPlay()
  h.talk()
  h.links.at(-1).handlers.onWords(['Turn off voice mode.'], '')
  assert.equal(answers.length, 1, 'never an answer to the card')
  assert.equal(h.spoken.at(-1).text, 'Okay, back to the chat.')
  await settle()
  await h.endPlay()
  assert.equal(chats, 1)
  assert.deepEqual(h.cancels, [])
})

test('a microphone picked while Voice listens restarts capture once on it, never two streams at once; paused, nothing restarts', async () => {
  const h = harness()
  await started(h)
  h.mode.switchMic()
  // Picked again while that restart is under way: one more restart, after it.
  h.mode.switchMic()
  await settle()
  assert.equal(h.mics.length, 3)
  assert.equal(h.mostOpen, 1, 'the old stream closes before the new one opens')
  assert.equal(h.mics.filter((mic) => !mic.closed).length, 1)
  assert.equal(h.mode.getSnapshot().phase, 'on')
  // The new microphone is the one heard.
  h.talk()
  assert.equal(h.links.length, 1)
  h.mode.pause()
  h.mode.switchMic()
  await settle()
  assert.equal(h.mics.length, 3, 'the next opening reads the pick itself')
})

test('the microphone picked was not there: the default one listens, and the person is told', async () => {
  const h = harness({ fellBack: true })
  await started(h)
  assert.deepEqual(h.mode.getSnapshot().notice, { key: 'voice.micFallback' })
})

// ── A plan approved by voice (council 19/10/2026, A6; switch `voice-plan-approval`, off by default).

const PLAN = [
  '# Đổi màu nút Liên hệ',
  '',
  'Đổi nút Liên hệ ở trang chủ sang màu xanh lá. Chữ trên nút giữ nguyên.',
  '',
  '## Các bước',
  '',
  '1. Tìm nút trong phần đầu trang.',
  '2. Đổi màu nền của nút.'
].join('\n')

/** A plan waiting on review as dsh holds it (`pendingPlan`), with the answers it was given. */
function planCard(callId = 'p1', text = PLAN) {
  const card = {
    callId,
    questionId: 'plan-review',
    plan: text,
    approve: 'Approve',
    decline: 'Keep planning',
    answers: [],
    answer: async (value) => {
      card.answers.push(value)
    }
  }
  return card
}

/**
 * Voice on, the switch on, a turn that presents `card` for review; Tracy reads it to its end. Every
 * locale stands in as verified (`locales`; the real list is empty), the interface's `language`.
 */
async function planRead({
  card = planCard(),
  approval = true,
  extra = [],
  locales = PLAN_LOCALES,
  language = 'en'
} = {}) {
  let reviewing = false
  let current = card
  let chats = 0
  const h = harness({
    planReview: () => reviewing,
    plan: () => (reviewing ? current : null),
    planApproval: () => approval,
    ...(locales === null ? {} : { planLocales: locales }),
    uiLanguage: language,
    showChat: () => (chats += 1)
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  reviewing = true
  await h.append(...extra, call(card.callId, 'exit_plan_mode', { plan: card.plan }))
  return {
    h,
    get chats() {
      return chats
    },
    swap(next) {
      current = next
    },
    done() {
      reviewing = false
    },
    /** Both lines heard to their end, then a quiet moment: the person's turn. */
    async heard() {
      await h.endPlay()
      await h.endPlay()
      await h.clock.advance(1000)
    },
    /** The person says `words`, a finished phrase confirmed by the service. */
    async say(words) {
      h.talk(3)
      h.links.at(-1).handlers.onWords([words], '')
      await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
    }
  }
}

test('switch on, one plan waiting: Tracy reads its title and scope, says how to answer, and waits in Voice', async () => {
  const p = await planRead()
  const { h } = p
  assert.equal(
    h.spoken.at(-1).text.startsWith('Here is the plan: Đổi màu nút Liên hệ. Đổi nút Liên hệ ở trang chủ'),
    true
  )
  assert.ok(!/Các bước/.test(h.spoken.at(-1).text), 'a section heading is not scope')
  assert.equal(h.mode.getSnapshot().plan, true)
  assert.equal(h.mode.getSnapshot().tracy, 'asking')
  await h.endPlay()
  assert.equal(h.spoken.at(-1).text, PHRASES['voiceMode.say.planAsk'])
  assert.equal(h.spoken.at(-1).language, 'en', 'how to answer: a phrase of the interface')
  await h.endPlay()
  assert.equal(p.chats, 0, 'stays in Voice')
})

test('“Duyệt kế hoạch này.” said whole after the reading approves that plan, through its own card; nothing is sent', async () => {
  const card = planCard()
  const p = await planRead({ card })
  await p.heard()
  await p.say('Duyệt kế hoạch này.')
  assert.deepEqual(card.answers, [{ answers: [{ id: 'plan-review', selected: ['Approve'] }] }])
  assert.deepEqual(p.h.sent, [], 'not a message: the card’s answer')
  assert.equal(p.chats, 0)
  assert.equal(p.h.spoken.at(-1).text, 'Plan approved. I am starting on it now.')
  assert.equal(p.h.mode.getSnapshot().plan, false)
  // The review answered, the turn works on: Tracy follows it as before.
  p.done()
  await p.h.append(result('p1'))
  assert.equal(p.h.mode.getSnapshot().tracy, 'working')
})

test('“ừ”, “ok”, “yes”, or the words inside a longer sentence are never an approval: the chat, as before', async () => {
  for (const words of [
    'Ừ.',
    'OK',
    'Yes.',
    'Được.',
    'Đừng duyệt kế hoạch này.',
    'Approve this plan but make it blue.'
  ]) {
    const card = planCard()
    const p = await planRead({ card })
    await p.heard()
    await p.say(words)
    assert.deepEqual(card.answers, [], words)
    assert.equal(p.h.spoken.at(-1).text, 'I have a plan for you to review on screen.', words)
    await p.h.endPlay()
    assert.equal(p.chats, 1, words)
  }
})

test('the approval said over the reading, before it ended: not taken; the plan is read once more', async () => {
  const card = planCard()
  const p = await planRead({ card })
  // Still reading the plan: the person speaks over it.
  await p.say('Duyệt kế hoạch này.')
  assert.deepEqual(card.answers, [])
  assert.match(p.h.spoken.at(-1).text, /^Here is the plan: /, 'read again')
  await p.heard()
  await p.say('Duyệt kế hoạch này.')
  assert.equal(card.answers.length, 1, 'heard to its end, the approval is taken')
})

test('a phrase begun right as Tracy finished is not taken (its own reading says the phrase), nor sent', async () => {
  const card = planCard()
  const p = await planRead({ card })
  await p.h.endPlay()
  await p.h.endPlay()
  // No quiet moment: the "approve this plan" of its own line may be coming back.
  await p.say('Approve this plan.')
  assert.deepEqual(card.answers, [])
  assert.deepEqual(p.h.sent, [])
  assert.equal(p.chats, 0, 'dropped, still waiting in Voice')
})

test('a plan whose text changed since it was read is read again, never approved on the older reading', async () => {
  const card = planCard()
  const p = await planRead({ card })
  await p.heard()
  const changed = planCard('p1', `${PLAN}\n3. Đổi cả viền nút.`)
  p.swap(changed)
  await p.say('Duyệt kế hoạch này.')
  assert.deepEqual(card.answers, [])
  assert.deepEqual(changed.answers, [])
  assert.match(p.h.spoken.at(-1).text, /^The plan has changed\. Here it is again\. Here is the plan: /)
  await p.heard()
  await p.say('Duyệt kế hoạch này.')
  assert.equal(changed.answers.length, 1, 'the new text, read, may be approved')
})

test('“Sửa kế hoạch …” is feedback: Keep planning with the words; the revised plan is read anew', async () => {
  const card = planCard()
  const p = await planRead({ card })
  await p.heard()
  await p.say('Sửa kế hoạch, giữ màu cũ cho viền.')
  assert.deepEqual(card.answers, [
    {
      answers: [
        { id: 'plan-review', selected: ['Keep planning'], custom: 'Sửa kế hoạch, giữ màu cũ cho viền.' }
      ]
    }
  ])
  assert.equal(p.h.spoken.at(-1).text, 'Got it. I will change the plan.')
  await p.h.endPlay()
  // The model revises and presents again: a new call, read for its own approval.
  const revised = planCard('p2', `${PLAN}\n\nViền giữ màu cũ.`)
  p.swap(revised)
  await p.h.append(result('p1'), call('p2', 'exit_plan_mode', { plan: revised.plan }))
  assert.match(p.h.spoken.at(-1).text, /^Here is the plan: /)
  await p.heard()
  await p.say('Approve this plan.')
  assert.deepEqual(revised.answers, [{ answers: [{ id: 'plan-review', selected: ['Approve'] }] }])
})

test('the switch off, two plans at once, or a question card beside the plan: today’s way, the chat', async () => {
  for (const [what, options] of [
    ['switch off', { approval: false }],
    ['two plans', { extra: [call('p0', 'exit_plan_mode', { plan: '# Other' })] }],
    ['a card beside', { extra: [call('q1', 'ask_user_question', { question: 'Màu nào?' })] }]
  ]) {
    const card = planCard()
    const p = await planRead({ card, ...options })
    assert.ok(
      p.h.spoken.some((x) => x.text === 'I have a plan for you to review on screen.'),
      `${what}: sent to the chat`
    )
    assert.ok(
      !p.h.spoken.some((x) => x.text.startsWith('Here is the plan')),
      `${what}: not read for approval`
    )
    assert.equal(p.h.mode.getSnapshot().plan, false, what)
    assert.deepEqual(card.answers, [], what)
  }
})

test('words pressed with Send now are never an approval: the chat', async () => {
  const card = planCard()
  const p = await planRead({ card })
  await p.heard()
  p.h.talk(3)
  p.h.links.at(-1).handlers.onWords([], 'Duyệt kế hoạch này')
  p.h.mode.sendNow()
  p.h.links.at(-1).handlers.onWords(['Duyệt kế hoạch này.'], '')
  p.h.links.at(-1).handlers.onEnd('stopped', true)
  await p.h.clock.advance(SPEAKING_MS)
  assert.deepEqual(card.answers, [])
  assert.equal(p.h.spoken.at(-1).text, 'I have a plan for you to review on screen.')
})

test('a plan reading that cannot be read out goes to the chat, as before', async () => {
  let reviewing = false
  let chats = 0
  const card = planCard()
  const h = harness({
    planReview: () => reviewing,
    plan: () => (reviewing ? card : null),
    planApproval: () => true,
    planLocales: PLAN_LOCALES,
    showChat: () => (chats += 1),
    speakAnswer: (text) =>
      text.startsWith('Here is the plan')
        ? new Response(JSON.stringify({ code: 'SPEAK_PROVIDER' }), { status: 502 })
        : new Response(new Uint8Array([1, 0]), { status: 200 })
  })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  reviewing = true
  await h.append(call('p1', 'exit_plan_mode', { plan: PLAN }))
  await settle()
  assert.equal(h.spoken.at(-1).text, 'I have a plan for you to review on screen.')
  await h.endPlay()
  assert.equal(chats, 1)
  assert.deepEqual(card.answers, [])
})

test('the switch is in the catalogue, off by default, beside the voice switch', async () => {
  const { default: catalogue } = await import('../../../core/tracy-core/src/ui-switches/catalogue.json', {
    with: { type: 'json' }
  })
  const row = catalogue.switches.find((s) => s.id === 'voice-plan-approval')
  assert.ok(row)
  assert.equal(row.defaultOn, false)
  assert.equal(row.group, 'composer')
})

test('a second approval heard while the first is being answered never answers the card twice', async () => {
  const card = planCard()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  card.answer = async (value) => {
    card.answers.push(value)
    await gate
  }
  const p = await planRead({ card })
  await p.heard()
  await p.say('Duyệt kế hoạch này.')
  await p.h.clock.advance(1000)
  await p.say('Duyệt kế hoạch này.')
  release()
  await settle()
  assert.equal(card.answers.length, 1)
  assert.equal(p.chats, 0)
})

test('the switch on but the interface locale not verified by a native speaker: today’s way, the chat', async () => {
  for (const [what, options] of [
    ['the real list, empty', { locales: null }],
    ['another locale verified', { locales: ['vi'], language: 'en' }]
  ]) {
    const card = planCard()
    const p = await planRead({ card, ...options })
    assert.ok(
      p.h.spoken.some((x) => x.text === 'I have a plan for you to review on screen.'),
      `${what}: sent to the chat`
    )
    assert.ok(!p.h.spoken.some((x) => x.text.startsWith('Here is the plan')), `${what}: not read`)
    assert.equal(p.h.mode.getSnapshot().plan, false, what)
    assert.deepEqual(card.answers, [], what)
  }
})

test('only the verified locales’ phrases approve: Vietnamese words with English alone verified go to the chat', async () => {
  const card = planCard()
  const p = await planRead({ card, locales: ['en'] })
  await p.heard()
  await p.say('Duyệt kế hoạch này.')
  assert.deepEqual(card.answers, [])
  assert.equal(p.h.spoken.at(-1).text, 'I have a plan for you to review on screen.')
})

test('“Sửa kế hoạch.” with nothing to change: the plan keeps waiting, Tracy asks what, the next phrase is the change', async () => {
  for (const lead of ['Sửa kế hoạch.', 'Change the plan to.', 'Pas het plan aan.']) {
    const card = planCard()
    const p = await planRead({ card })
    await p.heard()
    await p.say(lead)
    // "… to." ends as a sentence that goes on: the longer wait.
    await p.h.clock.advance(UNFINISHED_SEND_MS)
    assert.deepEqual(card.answers, [], `${lead}: an empty change is no change`)
    assert.equal(p.h.spoken.at(-1).text, 'What should I change in the plan?', lead)
    assert.equal(p.h.mode.getSnapshot().plan, true, `${lead}: still waiting in Voice`)
    assert.equal(p.chats, 0, lead)
    await p.h.endPlay()
    await p.h.clock.advance(1000)
    await p.say('Bỏ bước hai.')
    assert.deepEqual(
      card.answers,
      [{ answers: [{ id: 'plan-review', selected: ['Keep planning'], custom: 'Bỏ bước hai.' }] }],
      lead
    )
    assert.equal(p.h.spoken.at(-1).text, 'Got it. I will change the plan.', lead)
    assert.deepEqual(p.h.sent, [], lead)
  }
})

test('asked what to change, “dừng lại” or only listening is no change: the chat, as before', async () => {
  for (const words of ['Dừng lại.', 'Ừ.']) {
    const card = planCard()
    const p = await planRead({ card })
    await p.heard()
    await p.say('Change the plan.')
    await p.h.endPlay()
    await p.h.clock.advance(1000)
    await p.say(words)
    assert.deepEqual(card.answers, [], words)
    assert.equal(p.h.spoken.at(-1).text, 'I have a plan for you to review on screen.', words)
  }
})

// ── Tracy's own confirmation card answered by voice (council 20/10/2026, D5.1).

/** Voice on, a turn asking Tracy's confirm card (`confirm-…`), read to its end; the answers it was given. */
async function confirmAsked({
  id = 'confirm-3f9a',
  labels = ['Yes, go ahead', 'No, keep it'],
  working = false,
  read = true
} = {}) {
  const answers = []
  const questions = [
    { id, question: 'Delete the post “Yêu chính mình”?', options: labels.map((label) => ({ label })) }
  ]
  const pending = { questions, answer: async (/** @type {any} */ a) => void answers.push(a) }
  const h = harness({ question: () => pending })
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }), call(id, 'ask_user_question', { questions }))
  // `read`: the card's reading played to its end, then a quiet moment — the person's turn.
  if (read) {
    await h.endPlay()
    await h.clock.advance(1000)
  }
  if (working) assert.equal(h.mode.getSnapshot().tracy, 'asking')
  return {
    h,
    answers,
    /** @param {string} words - confirmed after what this session of the service confirmed before */
    async say(words) {
      h.talk()
      const link = h.links.at(-1)
      link.said = [...(link.said ?? []), words]
      link.handlers.onWords(link.said, '')
      await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
    }
  }
}

test('“Đồng ý.” to a confirm card with English options picks its go-ahead; “Không.” its keep; nothing is sent', async () => {
  for (const [words, label] of [
    ['是的。', 'Yes, go ahead'],
    ['Đồng ý.', 'Yes, go ahead'],
    ['Ja, bitte.', 'Yes, go ahead'],
    ['Không.', 'No, keep it'],
    ['Non merci.', 'No, keep it']
  ]) {
    const c = await confirmAsked()
    await c.say(words)
    assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: [label] }] }], words)
    assert.deepEqual(c.h.sent, [], words)
    assert.equal(c.h.spoken.at(-1).text, 'Okay, on it.', words)
  }
})

test('a confirm card answered with neither a choice nor a clear yes or no is asked again, never answered with the words', async () => {
  const c = await confirmAsked()
  const asked =
    'I have a question for you on screen. Delete the post “Yêu chính mình”? Yes, go ahead hoặc No, keep it.'
  assert.equal(c.h.spoken.at(-1).text, asked)
  for (const words of ['Ừ.', 'Hmm, which post is that?', 'Không giữ lại.']) {
    await c.say(words)
    assert.deepEqual(c.answers, [], words)
    assert.deepEqual(c.h.sent, [], `${words}: never a message either`)
    assert.equal(
      c.h.spoken.at(-1).text,
      `${asked} Please say yes or no.`,
      `${words}: the same card, asked again, then how to answer it`
    )
    await c.h.endPlay()
    await c.h.clock.advance(1000)
  }
  await c.say('Đồng ý.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }])
})

test('a card the agent wrote (its id not confirm-…) keeps today’s way: “Đồng ý.” goes as its own words', async () => {
  const c = await confirmAsked({ id: 'delete-post' })
  await c.say('Đồng ý.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'delete-post', selected: [], custom: 'Đồng ý.' }] }])
})

test('a yes or a no to a confirm card goes after the usual wait, even “是的” that ends as a sentence going on', async () => {
  for (const words of ['是的。', '对的。']) {
    const c = await confirmAsked()
    c.h.talk()
    c.h.links.at(-1).handlers.onWords([words], '')
    await c.h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
    assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }], words)
  }
  // With no confirm card, a phrase ending so still waits for the rest of the sentence.
  const h = harness()
  await started(h)
  h.talk()
  h.links[0].handlers.onWords(['我要红色的。'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.sent, [], 'still waiting')
  await h.clock.advance(UNFINISHED_SEND_MS)
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['我要红色的。']
  )
})

test('a cancel word to a confirm card answers “keep it” and never stops the work; with no card it still stops it', async () => {
  for (const words of [
    'Huỷ.',
    'Hủy.',
    'Cancel.',
    'Abbrechen.',
    'Annuler.',
    'Annulla.',
    'Cancelar.',
    'Annuleer.',
    '取消。'
  ]) {
    const c = await confirmAsked({ working: true })
    await c.say(words)
    assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['No, keep it'] }] }], words)
    assert.deepEqual(c.h.cancels, [], `${words}: the turn goes on`)
  }
  // Not one of Tracy's cards: the cancel word stops the work, as before.
  const own = await confirmAsked({ id: 'delete-post', working: true })
  await own.say('Cancel.')
  assert.deepEqual(own.answers, [])
  assert.deepEqual(own.h.cancels, [SESSION])
  // No card at all, Tracy working: the same.
  const h = harness()
  await started(h)
  await h.append(ev('turn/start', { turn: 1 }))
  h.talk()
  h.links[0].handlers.onWords(['Cancel.'], '')
  await h.clock.advance(SPEAKING_MS + SEND_AFTER_MS)
  assert.deepEqual(h.cancels, [SESSION])
})

test('a confirm card a yes or a no cannot answer (three options) is asked again without asking for one', async () => {
  const c = await confirmAsked({ labels: ['Delete', 'Hide', 'Keep'] })
  await c.say('Ừ.')
  assert.deepEqual(c.answers, [])
  assert.equal(
    c.h.spoken.at(-1).text,
    'I have a question for you on screen. Delete the post “Yêu chính mình”? Delete, Hide hoặc Keep.'
  )
})

// ── A "yes" from Tracy's own speakers never answers its confirmation card.

const CONFIRM_LINE =
  'I have a question for you on screen. Delete the post “Yêu chính mình”? Yes, go ahead hoặc No, keep it.'

test('a yes heard during the card’s reading is dropped without a word; the card is asked once more after a silence', async () => {
  const c = await confirmAsked({ read: false })
  assert.equal(c.h.mode.getSnapshot().talking, 'progress', 'still reading the card')
  await c.say('Yes.')
  assert.deepEqual(c.answers, [], 'never the card’s answer')
  assert.deepEqual(c.h.sent, [], 'nor a message')
  const count = c.h.spoken.length
  c.h.quiet(5)
  await c.h.clock.advance(REPROMPT_MS + 1000)
  assert.equal(c.h.spoken.length, count + 1, 'asked once more')
  assert.equal(c.h.spoken.at(-1).text, CONFIRM_LINE)
  // Heard to its end this time: a yes said after it answers.
  await c.h.endPlay()
  await c.h.clock.advance(1000)
  await c.say('Yes.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }])
})

test('a yes begun right as the reading ended (its tail) is dropped; a yes said after a quiet moment answers', async () => {
  const c = await confirmAsked({ read: false })
  await c.h.endPlay()
  // No quiet moment: the "yes" of its own line may be coming back.
  await c.say('Yes.')
  assert.deepEqual(c.answers, [])
  assert.deepEqual(c.h.sent, [])
  assert.equal(c.h.spoken.at(-1).text, CONFIRM_LINE, 'nothing said: dropped without a word')
  await c.h.clock.advance(1000)
  await c.say('Yes.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }])
})

test('the last words of what Tracy just said coming back (“yes or no”) are never an answer, nor asked again aloud', async () => {
  const c = await confirmAsked()
  await c.say('Ừ.')
  assert.equal(c.h.spoken.at(-1).text, `${CONFIRM_LINE} Please say yes or no.`)
  await c.h.endPlay()
  await c.h.clock.advance(1000)
  const count = c.h.spoken.length
  // Within `ECHO_MS` of the line's end, as Tracy's voice coming back would be.
  for (const words of ['Yes or no.', 'Say yes or no.']) {
    await c.say(words)
    assert.deepEqual(c.answers, [], words)
    assert.deepEqual(c.h.sent, [], words)
    assert.equal(c.h.spoken.length, count, `${words}: dropped without a word`)
  }
  // Its own words long gone, a real yes answers.
  await c.h.clock.advance(ECHO_MS)
  await c.say('Yes.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }])
})

test('a quick “no” right after “…Please say yes or no.” keeps it at once: a no can only keep things as they are', async () => {
  // (Two words or more that are a run of Tracy's line, "No, keep it.", are its voice coming back to the
  // general echo filter (`isEcho`) when begun in the tail, as before: one word is not.)
  for (const words of ['No.', 'Nope.', 'Huỷ.', 'Không.']) {
    const c = await confirmAsked()
    await c.say('Ừ.')
    await c.h.endPlay()
    // No quiet moment, and the very last word Tracy said: still a no, so it answers.
    await c.say(words)
    assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['No, keep it'] }] }], words)
    assert.deepEqual(c.h.cancels, [], words)
  }
})

test('a no said during the card’s reading answers too; a yes then is dropped', async () => {
  const no = await confirmAsked({ read: false })
  await no.say('Không.')
  assert.deepEqual(no.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['No, keep it'] }] }])
  const yes = await confirmAsked({ read: false })
  await yes.say('Đồng ý.')
  assert.deepEqual(yes.answers, [])
  // The go-ahead label said whole is held to the same guard as a yes.
  const label = await confirmAsked({ read: false })
  await label.say('Yes, go ahead.')
  assert.deepEqual(label.answers, [])
})

test('an echo “yes” right after the re-asked card’s “…Please say yes or no.” is still dropped', async () => {
  const c = await confirmAsked()
  await c.say('Ừ.')
  const count = c.h.spoken.length
  await c.h.endPlay()
  await c.say('Yes.')
  assert.deepEqual(c.answers, [])
  assert.equal(c.h.spoken.length, count, 'dropped without a word')
})

test('talked over twice, the card is asked once more, then Tracy says once to answer on screen and asks no more', async () => {
  const c = await confirmAsked({ read: false })
  await c.say('Yes.')
  assert.deepEqual(c.answers, [])
  c.h.quiet(5)
  await c.h.clock.advance(REPROMPT_MS + 1000)
  assert.equal(c.h.spoken.at(-1).text, CONFIRM_LINE, 'asked once more')
  // Talked over again, while it is asked once more.
  await c.say('Yes.')
  assert.deepEqual(c.answers, [])
  assert.equal(
    c.h.spoken.at(-1).text,
    'I could not hear your answer clearly. Please answer on screen.',
    'said once'
  )
  const count = c.h.spoken.length
  await c.h.endPlay()
  await c.say('Yes.')
  c.h.quiet(5)
  await c.h.clock.advance(REPROMPT_MS * 3)
  assert.equal(c.h.spoken.length, count, 'never again, never asked again')
  assert.deepEqual(c.answers, [])
  assert.deepEqual(c.h.sent, [])
})

test('a real yes said after the whole reading, a quiet moment later, still answers the card', async () => {
  const c = await confirmAsked()
  await c.say('Yes, go ahead.')
  assert.deepEqual(c.answers, [{ answers: [{ id: 'confirm-3f9a', selected: ['Yes, go ahead'] }] }])
  assert.deepEqual(c.h.sent, [])
})
