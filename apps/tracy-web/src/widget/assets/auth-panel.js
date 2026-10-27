import { decimalDigits, normalizeSpeech, phoneticEmail, spokenEmail } from './email-voice.js'
import { openMicrophone, openSpeechLink, speechSocketUrl } from './voice.js'
export function parseCode(text, lexicon = null) {
  const names = {
    zero: '0',
    oh: '0',
    khong: '0',
    one: '1',
    mot: '1',
    two: '2',
    hai: '2',
    three: '3',
    ba: '3',
    four: '4',
    bon: '4',
    tu: '4',
    five: '5',
    nam: '5',
    six: '6',
    sau: '6',
    seven: '7',
    bay: '7',
    eight: '8',
    tam: '8',
    nine: '9',
    chin: '9'
  }
  if (lexicon?.digits) {
    for (const [i, word] of lexicon.digits.entries()) names[normalizeSpeech(word)] = String(i)
    let rest = normalizeSpeech(decimalDigits(text))
      .replace(/[，、。!！？?,.\s-]+/gu, ' ')
      .trim()
    let digits = ''
    const tokens = Object.keys(names).sort((a, b) => b.length - a.length)
    while (rest) {
      const numeric = /^\d+/.exec(rest)
      if (numeric) {
        digits += numeric[0]
        rest = rest.slice(numeric[0].length).trimStart()
        continue
      }
      const token = tokens.find(
        (word) =>
          rest.startsWith(word) && (!/[a-z]/.test(word) || !/^[\p{L}\p{N}]/u.test(rest.slice(word.length)))
      )
      if (!token) return null
      digits += names[token]
      rest = rest.slice(token.length).trimStart()
    }
    return /^\d{6}$/.test(digits) ? digits : null
  }
  text = normalizeSpeech(decimalDigits(text))
  if (/[^a-z0-9\s,.;:!?-]/u.test(text)) return null
  const words =
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[a-z]+|\d+/g) || []
  if (words.some((w) => !/^\d+$/.test(w) && !(w in names))) return null
  const digits = words.map((w) => names[w] ?? w).join('')
  return /^\d{6}$/.test(digits) ? digits : null
}
export function createAuth({
  api,
  escape: e,
  onDone,
  onClose,
  isVoiceOn = () => false,
  ensureVoice = () => {},
  onGuide = async () => {},
  onExit = () => {},
  getLexicon = () => null,
  canReadWords = () => true,
  onSpeechLanguage = async () => {}
}) {
  let active = false,
    step = 'email',
    sharedListening = false,
    epoch = 0,
    lastGuideAt = 0,
    confirmEmail = false,
    email = '',
    error = '',
    localCode = '',
    localPreview = false,
    pending = false,
    mic = null,
    link = null,
    timer = null,
    popup = null,
    flow = null,
    watch = null,
    after = null,
    host = null
  function stop() {
    sharedListening = false
    clearTimeout(timer)
    link?.close()
    link = null
    const m = mic
    mic = null
    void m?.close()
  }
  function draw() {
    if (!active || !host) return
    host.innerHTML =
      '<div class="auth-card"><strong>Sign in to Tracy</strong><p>Your conversation and design choices stay here.</p><button class="button" id="auth-google">Continue with Google ↗</button><p class="auth-divider">or use your email</p><form id="auth-form">' +
      (step === 'email'
        ? '<label for="auth-email">Email address</label><input id="auth-email" type="email" autocomplete="email" required value="' +
          e(email) +
          '" placeholder="you@company.com">'
        : '<label for="auth-code">Code sent to ' +
          e(email) +
          '</label><input id="auth-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required value="' +
          e(localCode) +
          '">' +
          (localPreview
            ? '<small>Local stand: email delivery is disabled. This is the real local code.</small>'
            : '') +
          '<button type="button" class="button" id="auth-read">' +
          (mic || sharedListening ? 'Pause code reading' : 'Read the six digits') +
          '</button>') +
      (confirmEmail
        ? '<p class="auth-confirm">Check the email above. Say yes or press Send sign-in code to confirm.</p>'
        : '') +
      '<button class="button primary" ' +
      (pending ? 'disabled' : '') +
      '>' +
      (pending ? 'Please wait…' : step === 'email' ? 'Send sign-in code' : 'Verify code') +
      '</button></form><p role="alert" id="auth-error">' +
      e(error) +
      '</p>' +
      (step === 'code' ? '<button class="button" id="auth-change">Change email / resend</button>' : '') +
      '<button class="button" id="auth-cancel">Cancel</button></div>'
    host.querySelector('#auth-form').onsubmit = async (ev) => {
      ev.preventDefault()
      if (pending) return
      if (step === 'email') {
        email = host.querySelector('#auth-email').value
        await sendEmail()
      } else await verify(host.querySelector('#auth-code').value)
    }
    host.querySelector('#auth-email')?.addEventListener('input', (event) => {
      email = event.target.value
      confirmEmail = false
    })
    host.querySelector('#auth-code')?.addEventListener('input', (event) => {
      localCode = event.target.value
    })
    host.querySelector('#auth-cancel').onclick = () => close()
    host.querySelector('#auth-change')?.addEventListener('click', () => {
      stop()
      step = 'email'
      epoch++
      sharedListening = isVoiceOn()
      if (sharedListening) void onGuide('email')
      localCode = ''
      error = ''
      draw()
    })
    host.querySelector('#auth-read')?.addEventListener('click', read)
    host.querySelector('#auth-google').onclick = google
  }
  async function sendEmail() {
    if (pending) return
    clearInterval(watch)
    popup?.close()
    flow = null
    pending = true
    confirmEmail = false
    error = ''
    draw()
    try {
      const x = await api('/widget/api/auth/email', { email })
      step = 'code'
      epoch++
      localCode = String(x.localCode || '')
      localPreview = !!x.localCode
      if (isVoiceOn()) {
        sharedListening = true
        await onGuide('code')
        ensureVoice()
      }
    } catch (err) {
      error = err.message
    } finally {
      pending = false
      draw()
    }
  }
  async function verify(code) {
    if (pending || !/^\d{6}$/.test(code)) return
    stop()
    epoch++
    pending = true
    error = ''
    draw()
    try {
      await api('/widget/api/auth/verify', { code })
      await finish()
    } catch (err) {
      error = err.message
      localCode = ''
      if (isVoiceOn()) {
        sharedListening = true
        await onGuide('retry')
        ensureVoice()
      }
    } finally {
      pending = false
      draw()
    }
  }
  function scheduleCode(code) {
    const codeEpoch = epoch
    timer = setTimeout(() => {
      if (
        active &&
        step === 'code' &&
        epoch === codeEpoch &&
        !pending &&
        !flow &&
        canReadWords() &&
        (sharedListening || mic)
      )
        void verify(code)
    }, 1000)
  }
  async function read() {
    if (sharedListening) {
      clearTimeout(timer)
      epoch++
      sharedListening = false
      draw()
      return
    }
    if (isVoiceOn()) {
      sharedListening = true
      epoch++
      ensureVoice()
      draw()
      return
    }
    if (mic) {
      stop()
      draw()
      return
    }
    await onGuide('code')
    if (!active || step !== 'code' || !canReadWords()) return
    localCode = ''
    error = 'Opening microphone…'
    draw()
    try {
      link = openSpeechLink(
        {
          onReady: () => {
            error = 'Listening for six digits. You can also type them.'
            draw()
          },
          onLanguage: (code) => {
            void onSpeechLanguage(code)
          },
          onWords: (words, partial) => {
            clearTimeout(timer)
            if (!canReadWords()) return
            const code = parseCode(words.join(' '), getLexicon())
            if (code && !partial) {
              localCode = code
              draw()
              scheduleCode(code)
            }
          },
          onEnd: () => {
            stop()
            error = 'Microphone stopped. Type the code or try again.'
            draw()
          }
        },
        {
          url: (() => {
            const u = new URL(speechSocketUrl(location))
            u.pathname = '/widget/api/speech/stream'
            return u.href
          })()
        }
      )
      const opened = await openMicrophone(
        (frame) => link?.sendAudio(frame),
        () => {},
        () => {
          stop()
          error = 'Microphone disconnected. Type the code.'
          draw()
        }
      )
      if (!active || step !== 'code') {
        await opened.close()
        return
      }
      mic = opened
      draw()
    } catch {
      stop()
      error = 'Could not open microphone. Type the code below.'
      draw()
    }
  }
  async function finish() {
    stop()
    onExit()
    localCode = ''
    email = ''
    active = false
    clearInterval(watch)
    popup?.close()
    host?.remove()
    const next = after
    after = null
    await onDone(next)
  }
  async function close() {
    stop()
    clearInterval(watch)
    popup?.close()
    localCode = ''
    email = ''
    try {
      await api('/widget/api/auth/cancel', {})
    } catch (err) {
      error = err.message
      draw()
      return
    }
    onExit()
    active = false
    host?.remove()
    await onClose()
  }
  async function google() {
    popup = window.open('about:blank', 'tracy-google-signin', 'popup,width=520,height=700')
    if (!popup) {
      error = 'Allow popups, or sign in with email.'
      draw()
      return
    }
    try {
      const x = await api('/widget/api/auth/google', {})
      flow = x.flow
      popup.location = x.url
      epoch++
      if (isVoiceOn()) {
        sharedListening = true
        void onGuide('google')
      }
      clearInterval(watch)
      const started = Date.now()
      watch = setInterval(() => {
        if (popup.closed || Date.now() - started > 600000) {
          clearInterval(watch)
          flow = null
          epoch++
          sharedListening = isVoiceOn()
          error = 'Google sign-in closed or timed out. Try again or use email.'
          draw()
        }
      }, 700)
    } catch (err) {
      popup.close()
      error = err.message
      draw()
    }
  }
  window.addEventListener('message', async (ev) => {
    if (
      !active ||
      ev.origin !== location.origin ||
      ev.source !== popup ||
      ev.data?.type !== 'tracy:auth:complete' ||
      ev.data.flow !== flow
    )
      return
    const x = await api('/widget/api/auth/status')
    if (x.signedIn) await finish()
  })
  function receiveWords(words, partial) {
    if (!active || !sharedListening || pending || !canReadWords()) return
    clearTimeout(timer)
    if (partial) return
    const text = words.join(' ').trim()
    if (!text) return
    const normalized = normalizeSpeech(text).replace(/[\p{P}\s]+$/gu, '')
    const lexicon = getLexicon()
    const matches = (key) => (lexicon?.[key] || []).some((word) => normalizeSpeech(word) === normalized)
    if (
      matches('cancel') ||
      /^(cancel|cancel sign in|go back|huy|huy dang nhap|quay lai)$/.test(normalized)
    ) {
      void close()
      return
    }
    if (step === 'email' && !flow) {
      if (
        confirmEmail &&
        (matches('yes') ||
          /^(yes|yes please|correct|that is correct|confirm|dung|dung roi|chinh xac|ok|okay)$/.test(
            normalizeSpeech(text).replace(/[\p{P}\s]+$/gu, '')
          ))
      ) {
        void sendEmail()
        return
      }
      if (
        confirmEmail &&
        (matches('no') ||
          /^(no|wrong|incorrect|khong|sai|khong dung)$/.test(
            normalizeSpeech(text).replace(/[\p{P}\s]+$/gu, '')
          ))
      ) {
        confirmEmail = false
        epoch++
        draw()
        void onGuide('emailAgain')
        return
      }
      const candidate = spokenEmail(text, lexicon)
      if (candidate) {
        email = candidate
        confirmEmail = true
        epoch++
        draw()
        void onGuide({ key: 'confirmEmail', email, spelling: phoneticEmail(email, lexicon) })
        return
      }
    }
    const code = step === 'code' && !flow ? parseCode(text, lexicon) : null
    if (code) {
      localCode = code
      draw()
      scheduleCode(code)
      return
    }
    if (Date.now() - lastGuideAt > 5000) {
      lastGuideAt = Date.now()
      epoch++
      void onGuide(step === 'code' ? 'code' : flow ? 'google' : 'email')
    }
  }
  return {
    receiveWords,
    get listening() {
      return sharedListening || !!mic
    },
    get voiceRoute() {
      return 'auth:' + step + ':' + epoch
    },
    async beginVoice() {
      stop()
      sharedListening = true
      epoch++
      draw()
      await onGuide(step === 'code' ? 'code' : flow ? 'google' : 'email')
      if (active && isVoiceOn()) {
        epoch++
        ensureVoice()
      }
    },
    pauseVoice() {
      stop()
      draw()
    },
    voiceEnded(reason) {
      if (!active || !sharedListening) return
      if (!['silence', 'stopped', 'time-limit', 'network'].includes(reason)) {
        sharedListening = false
        error = 'Voice is temporarily unavailable. Continue in the sign-in form or retry the microphone.'
        draw()
      }
    },
    get active() {
      return active
    },
    resume(pendingAuth) {
      if (!pendingAuth) return
      active = true
      step = 'code'
      epoch++
      email = pendingAuth.email
      localCode = ''
      localPreview = false
    },
    open(next) {
      active = true
      epoch++
      flow = null
      confirmEmail = false
      after = next
      step = 'email'
      error = ''
      localCode = ''
      this.mount()
    },
    mount() {
      if (!active) return
      host = document.getElementById('auth-host')
      if (!host) {
        host = document.createElement('div')
        host.id = 'auth-host'
        document.querySelector('.transcript')?.append(host)
      }
      draw()
      host?.scrollIntoView({ block: 'nearest' })
    }
  }
}
