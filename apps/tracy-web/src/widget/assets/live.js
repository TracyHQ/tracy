import { speechLanguageCode, speechParts } from './email-voice.js'
import { speechCursor } from './speech-cursor.js'
import { openWidgetSpeechLink, readySpeechFacts } from './speech-facts.js'

let activeAuthLanguagePack = null
const authWords = await fetch(new URL('./auth-voice.json', import.meta.url)).then((r) => r.json())

import { createAuth } from './auth-panel.js'
import { openMicrophone, openPlayer, speechSocketUrl } from './voice.js'

const stage = document.getElementById('workspace')
if (new URLSearchParams(location.search).get('embed') === '1') {
  document.body.classList.add('embedded')
  new ResizeObserver(() =>
    parent.postMessage(
      {
        type: 'tracy:widget:size',
        conversation: document.body.classList.contains('in-conversation'),
        height: stage.getBoundingClientRect().height + 16
      },
      '*'
    )
  ).observe(stage)
}
const micIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>'
const waveform = '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>'
let nativeSession = null,
  nativeOpening = null,
  nativeVoiceWanted = false
let catalogue = { templates: [], systems: [] },
  state = { history: [], brief: { platform: 'wordpress' }, templateIds: [], systemIds: [] },
  speech = {},
  mode = 'templates',
  catalogueOpen = false,
  query = '',
  pageSize = 12,
  voiceGeneration = 0,
  authSpeechId = 0,
  authOpening = false,
  voiceOn = false,
  microphone = null,
  link = null,
  player = null,
  talking = false,
  busy = false,
  sendTimer = null,
  committed = '',
  draft = '',
  preroll = [],
  loudFrames = 0,
  notice = '',
  audioAbort = null,
  language = '',
  reconnects = 0,
  reconnectUntil = 0,
  pendingDraft = sessionStorage.getItem('tracy-widget-pending-draft') || ''
const restoredDraft = sessionStorage.getItem('tracy-widget-voice-draft') || ''
if (restoredDraft.trim()) keepPendingDraft(restoredDraft)
sessionStorage.removeItem('tracy-widget-voice-draft')
const e = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const safeURL = (s) => {
  if (typeof s !== 'string' || !s.trim()) return ''
  try {
    const u = new URL(s, location.origin)
    return ['http:', 'https:'].includes(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}
function widgetSocket(lang) {
  const u = new URL(speechSocketUrl(location, lang))
  u.pathname = '/widget/api/speech/stream'
  return u.href
}
async function api(url, body, signal) {
  if (url.startsWith('/api/')) url = '/widget/backend' + url
  const r = await fetch(
    url,
    body !== undefined
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {})
        }
      : signal
        ? { signal }
        : {}
  )
  let x
  try {
    x = await r.json()
  } catch {
    throw new Error('The server returned an unreadable response.')
  }
  if (!r.ok)
    throw Object.assign(new Error(x.code || `HTTP ${r.status}`), {
      code: x.code,
      status: r.status,
      retryable: typeof x.retryable === 'boolean' ? x.retryable : undefined,
      reason: ['authentication', 'configuration', 'upstream'].includes(x.reason) ? x.reason : undefined
    })
  return x
}
function modelFailureMessage(error) {
  let message = 'Tracy could not get a valid answer from the model service.'
  if (error.reason === 'authentication') message = 'Tracy’s model service rejected its credentials.'
  else if (error.reason === 'configuration') message = 'Tracy’s model connection needs to be checked.'
  else if (error.reason === 'upstream') {
    if (error.status === 402)
      message = 'Tracy’s model service cannot answer because its credits or billing are unavailable.'
    else if (error.status === 429) message = 'The model service reached a request limit.'
    else if (error.status === 504) message = 'The model service took too long to answer.'
  }
  return message + ' Your words are kept for review. Nothing will be sent again automatically.'
}
function head(status) {
  return (
    '<div class="stage-top"><div class="assistant"><span class="mini"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2v28M2 16h28M6 6l20 20M6 26 26 6M10 3l12 26M3 10l26 12M3 22 26 10M10 29 22 3"/></svg></span> Tracy <span style="font-weight:400;color:#a3a3a3">/ Your website, together</span></div><span class="badge-live">' +
    e(status) +
    '</span></div>'
  )
}
function setNotice(text) {
  notice = text
  const n = document.getElementById('notice')
  if (n) {
    n.textContent = text
    n.hidden = !text
  }
}
function keepPendingDraft(words) {
  const text = words.trim()
  const held = pendingDraft.trim().replace(/\s+/g, ' ')
  const incoming = text.replace(/\s+/g, ' ')
  // Recovery may repeat a phrase already retained from an earlier failure or reload.
  if (!incoming || (' ' + held + ' ').includes(' ' + incoming + ' ')) return
  pendingDraft =
    held && !(' ' + incoming + ' ').includes(' ' + held + ' ') ? [pendingDraft, text].join(' ') : text
  if (pendingDraft) sessionStorage.setItem('tracy-widget-pending-draft', pendingDraft)
}
function holdVoiceDraft() {
  keepPendingDraft(draft)
  draft = ''
  committed = ''
  preroll = []
  loudFrames = 0
  sessionStorage.removeItem('tracy-widget-voice-draft')
}
function status(text) {
  const s = document.getElementById('voice-status')
  if (s) s.textContent = text
  const cap = document.getElementById('live-caption')
  if (cap) cap.textContent = draft
}
function renderWelcome() {
  if (nativeSession) return renderNative()
  document.body.classList.remove('in-conversation')
  stage.innerHTML =
    head('Tracy website assistant') +
    '<div class="voice"><div class="orb" aria-hidden="true"></div><h2>What would you like to create?</h2><p>Talk to Tracy. Explore ' +
    catalogue.templates.length +
    ' real templates and ' +
    catalogue.systems.length.toLocaleString() +
    ' design systems.<br>Your choices stay with you as you create your website.</p><button class="button primary" id="start-voice">' +
    waveform +
    ' Talk to Tracy</button><button class="text-option" id="start-text">I’d rather type</button><p style="font-size:10px;margin-top:20px;margin-bottom:0">Microphone access starts when you choose Voice.</p><div id="notice" class="notice" hidden></div></div>'
  document.getElementById('start-voice').onclick = startVoice
  document.getElementById('start-text').onclick = () => render()
}
function visibleRows() {
  let rows = mode === 'templates' ? catalogue.templates : catalogue.systems
  if (query.trim()) {
    const words = query.toLowerCase().split(/\s+/)
    rows = rows.filter((r) =>
      words.every((w) =>
        JSON.stringify({
          name: r.name || r.label,
          group: r.group,
          description: r.description,
          blurb: r.card?.blurb,
          theme: r.theme
        })
          .toLowerCase()
          .includes(w)
      )
    )
  } else {
    const ids = mode === 'templates' ? state.templateIds : state.systemIds
    rows = [
      ...ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean),
      ...rows.filter((r) => !ids.includes(r.id))
    ]
  }
  return rows
}
/** The catalogue choices on screen, as `/widget/api/visible` takes them. */
function visibleChoices() {
  const rows = visibleRows().slice(0, pageSize)
  return {
    templates: mode === 'templates' ? rows.map((r) => r.id) : [],
    systems: mode === 'systems' ? rows.map((r) => r.id) : []
  }
}
function renderCards() {
  const grid = document.getElementById('real-grid')
  if (!grid) return
  const rows = visibleRows(),
    shown = rows.slice(0, pageSize)
  grid.innerHTML = shown.length
    ? shown
        .map((r) => {
          const template = mode === 'templates',
            selected = template ? state.selectedTemplate === r.id : state.selectedSystem === r.id,
            image = safeURL(
              template && r.card?.image ? '/widget/api/template-thumb/' + encodeURIComponent(r.id) : r.image
            )
          return (
            '<article class="real-card ' +
            (selected ? 'selected' : '') +
            '"><button style="border:0;background:none;padding:0;width:100%;text-align:left" data-pick="' +
            e(r.id) +
            '">' +
            (image
              ? '<img src="' + e(image) + '" alt="' + e(r.label || r.name) + '" loading="lazy">'
              : '<div class="empty">No preview image available</div>') +
            '<div class="info"><h3>' +
            e(r.label || r.name) +
            '</h3><p>' +
            e(template ? r.card?.blurb : r.description || r.group || '') +
            '</p><div class="tags">' +
            e(
              template
                ? r.platforms
                    .map(
                      (p) =>
                        ({ wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' })[p.platform] ||
                        p.platform
                    )
                    .join(' · ')
                : [r.group, r.theme].filter(Boolean).join(' · ')
            ) +
            '</div>' +
            (!template
              ? '<div class="palette">' +
                (r.colors || [])
                  .filter((c) => /^#[a-f0-9]{3,8}$/i.test(c))
                  .map((c) => '<span style="background:' + c + '"></span>')
                  .join('') +
                '</div>'
              : '') +
            '</div></button><button class="preview-action" data-preview="' +
            e(r.id) +
            '">View reference ↗</button></article>'
          )
        })
        .join('')
    : '<div class="empty">No matching ' +
      (mode === 'templates' ? 'templates' : 'design systems') +
      '. Try another search.</div>'
  grid
    .querySelectorAll('[data-pick]')
    .forEach((b) => (b.onclick = () => select(mode === 'templates' ? 'template' : 'system', b.dataset.pick)))
  grid.querySelectorAll('[data-preview]').forEach((b) => (b.onclick = () => preview(b.dataset.preview)))
  document.getElementById('pager').innerHTML =
    rows.length > pageSize ? '<button id="more">Show more (' + rows.length + ' results)</button>' : ''
  document.getElementById('more')?.addEventListener('click', () => {
    pageSize += 12
    renderCards()
  })
  grid.querySelectorAll('img').forEach(
    (img) =>
      (img.onerror = () => {
        img.replaceWith(
          Object.assign(document.createElement('div'), {
            className: 'empty',
            textContent: 'Preview unavailable'
          })
        )
      })
  )
}
function nativeFrame() {
  return document.getElementById('native-conversation')
}
function renderNative() {
  document.body.classList.add('in-conversation')
  if (nativeFrame()?.dataset.session === nativeSession.sessionId) return
  stage.classList.remove('voice-active', 'catalogue-open')
  stage.innerHTML =
    '<div class="native-toolbar"><span>Tracy</span><a href="' +
    e(nativeSession.expandedUrl) +
    '" target="_blank" rel="noopener">Open workspace ↗</a></div><iframe id="native-conversation" class="native-conversation" ' +
    'title="Tracy conversation" allow="microphone; autoplay" data-session="' +
    e(nativeSession.sessionId) +
    '" src="' +
    e(nativeSession.url) +
    '"></iframe>' +
    '<div id="notice" class="notice" hidden></div>'
  document.querySelector('.suggestions')?.remove()
}
async function enterNative() {
  if (nativeSession) return renderNative()
  if (nativeOpening) return nativeOpening
  nativeOpening = (async () => {
    nativeVoiceWanted = voiceOn
    await stopVoice()
    await player?.close()
    player = null
    nativeSession = await api('/widget/api/native/open', {})
    renderNative()
  })().finally(() => {
    nativeOpening = null
  })
  return nativeOpening
}
window.addEventListener('message', (event) => {
  const frame = nativeFrame()
  if (!nativeSession || event.origin !== location.origin || event.source !== frame?.contentWindow) return
  if (event.data.type === 'tracy-widget-native-signed-out') {
    nativeSession = null
    void api('/widget/api/state').then((value) => {
      state = value
      render()
    })
    return
  }
  if (event.data?.sessionId !== nativeSession.sessionId) return
  if (event.data.type === 'tracy-widget-native-ready')
    frame.contentWindow.postMessage(
      {
        type: 'tracy-widget-native-draft',
        sessionId: nativeSession.sessionId,
        text: pendingDraft,
        startVoice: nativeVoiceWanted
      },
      location.origin
    )
  if (event.data.type === 'tracy-widget-native-draft-kept') {
    nativeVoiceWanted = false
    pendingDraft = ''
    sessionStorage.removeItem('tracy-widget-pending-draft')
  }
})
function render() {
  if (nativeSession) return renderNative()
  document.body.classList.add('in-conversation')
  stage.classList.toggle('catalogue-open', catalogueOpen)
  stage.classList.toggle('voice-active', voiceOn)
  const t = catalogue.templates.find((r) => r.id === state.selectedTemplate),
    d = catalogue.systems.find((r) => r.id === state.selectedSystem)
  stage.innerHTML =
    head(busy ? 'Finding the right direction…' : voiceOn ? 'Voice is on' : 'Live catalogue') +
    '<div class="live-layout"><div class="conversation-panel"><div class="voice-presence" ' +
    (!voiceOn ? 'hidden' : '') +
    '><div class="orb" aria-hidden="true"></div></div><div id="voice-status" class="eyebrow">' +
    (busy ? 'Tracy is thinking…' : voiceOn ? 'Listening' : 'Tell me what you have in mind') +
    '</div><div class="transcript" aria-live="polite">' +
    (state.history.length
      ? state.history
          .slice(-30)
          .map(
            (h) =>
              '<div class="bubble ' +
              (h.role === 'user' ? 'user' : '') +
              '"><small>' +
              (h.role === 'user' ? 'You' : 'Tracy') +
              '</small>' +
              e(h.text) +
              '</div>'
          )
          .join('')
      : '<div class="bubble">What kind of website do you want to create? Tell me about your business, and I’ll help you find a look.</div>') +
    '</div><div class="live-caption" id="live-caption">' +
    e(draft) +
    '</div></div><div class="catalogue-panel"><div class="library-head"><div class="tabs"><button id="tab-templates" class="' +
    (mode === 'templates' ? 'on' : '') +
    '">Templates</button><button id="tab-systems" class="' +
    (mode === 'systems' ? 'on' : '') +
    '">Design systems</button></div><span class="count">' +
    catalogue.templates.length +
    ' templates · ' +
    catalogue.systems.length.toLocaleString() +
    ' systems</span></div><input id="search" class="search-box" aria-label="Search catalogue" placeholder="' +
    (mode === 'templates' ? 'Search real templates…' : 'Search a brand, industry or style…') +
    '" value="' +
    e(query) +
    '"><div class="real-grid" id="real-grid"></div><div class="pager" id="pager"></div></div></div><div id="notice" class="notice" ' +
    (!notice ? 'hidden' : '') +
    '>' +
    e(notice) +
    '</div>' +
    (pendingDraft.trim()
      ? '<div class="notice" id="pending-draft-note">Earlier unsent words are in the message box. Review them and press Send if you still want to send them. <button class="button" id="discard-pending">Discard earlier words</button></div>'
      : '') +
    '<div class="live-dock"><button class="icon-button" id="mic" aria-label="' +
    (voiceOn ? 'Pause microphone' : 'Start voice') +
    '" style="color:' +
    (voiceOn ? 'var(--primary)' : 'inherit') +
    '">' +
    micIcon +
    '</button><button class="button" id="stop-speech" ' +
    (!talking ? 'hidden' : '') +
    '>Stop speaking</button><button class="button" id="send-heard" ' +
    (!draft.trim() ? 'hidden' : '') +
    '>Send heard words</button><form id="message-form"><input id="message" aria-label="Message Tracy" placeholder="Or type your idea here…" value="' +
    e(pendingDraft) +
    '" ' +
    (busy ? 'disabled' : '') +
    '><button class="button dark" ' +
    (busy ? 'disabled' : '') +
    '>Send →</button></form></div><div class="brief-strip"><div><span>Your choices</span><div style="margin-top:5px">' +
    e(t?.label || 'Choose a template') +
    ' · ' +
    e(d?.name || 'Original template design') +
    '</div></div><button class="button ' +
    (t ? 'primary' : '') +
    '" id="brief-button" ' +
    (!t ? 'disabled' : '') +
    '>' +
    (state.build ? 'View build status →' : 'Your website brief →') +
    '</button></div>' +
    buildLinks(state.buildStatus) +
    '<div class="source-line">Live data from Tracy · Released templates on joomlart-products · Quality-checked Refero design systems. Voice uses Tracy’s configured speech service.</div>'
  document.getElementById('tab-templates').onclick = () => switchTab('templates')
  document.getElementById('tab-systems').onclick = () => switchTab('systems')
  document.getElementById('search').oninput = (ev) => {
    query = ev.target.value
    pageSize = 12
    renderCards()
  }
  document.getElementById('mic').onclick = () => (voiceOn ? stopVoice() : startVoice())
  document.getElementById('stop-speech').onclick = stopSpeaking
  document.getElementById('send-heard').onclick = () => {
    if (draft.trim()) submit(draft.trim())
  }
  document.getElementById('message-form').onsubmit = (ev) => {
    ev.preventDefault()
    const input = document.getElementById('message')
    const msg = input.value.trim()
    if (msg) submit(msg, false, true)
  }
  document.getElementById('message').oninput = (event) => {
    pendingDraft = event.target.value
    if (pendingDraft) sessionStorage.setItem('tracy-widget-pending-draft', pendingDraft)
    else sessionStorage.removeItem('tracy-widget-pending-draft')
  }
  document.getElementById('discard-pending')?.addEventListener('click', () => {
    pendingDraft = ''
    sessionStorage.removeItem('tracy-widget-pending-draft')
    document.getElementById('message').value = ''
    document.getElementById('pending-draft-note')?.remove()
  })
  document.getElementById('brief-button').onclick = state.build ? () => resumeBuild() : showBrief
  const browse = document.createElement('button')
  browse.className = 'button mobile-browse'
  browse.textContent = catalogueOpen ? 'Back to conversation' : 'Explore designs'
  browse.setAttribute('aria-expanded', String(catalogueOpen))
  browse.onclick = () => {
    catalogueOpen = !catalogueOpen
    render()
  }
  document.querySelector('.stage-top').append(browse)
  renderCards()
  const tr = document.querySelector('.transcript')
  tr.scrollTop = tr.scrollHeight
  auth.mount()
  if (auth.active) {
    document.getElementById('message').disabled = true
    document.getElementById('message').placeholder = 'Use the sign-in form above. Your conversation is kept.'
    document.querySelector('#message-form button').disabled = true
    status(auth.listening ? 'Listening · sign-in guidance' : 'Sign in here · your voice conversation is kept')
  }
}
function switchTab(tab) {
  mode = tab
  query = ''
  pageSize = 12
  render()
}
async function select(kind, id) {
  if (busy) return
  stopSpeaking()
  try {
    state = { ...state, ...(await api('/widget/api/select', { kind, id })) }
    const row = (kind === 'template' ? catalogue.templates : catalogue.systems).find((r) => r.id === id)
    if (kind === 'template') {
      const current = row.platforms.find((p) => p.platform === state.brief.platform)
      if (!current)
        state = {
          ...state,
          ...(await api('/widget/api/select', { kind: 'platform', id: row.platforms[0].platform }))
        }
    }
    render()
    await submit(
      'I choose this ' +
        (kind === 'system' ? 'design system' : 'template') +
        ': ' +
        (row.name || row.label) +
        '.',
      true
    )
  } catch (err) {
    setNotice(err.message)
  }
}
async function submit(message, describeSelection = false, confirmPending = false) {
  if (nativeSession) {
    nativeFrame()?.focus()
    return
  }
  if (busy || auth.active) return
  if (confirmPending) {
    pendingDraft = ''
    sessionStorage.removeItem('tracy-widget-pending-draft')
  }
  sessionStorage.setItem('tracy-widget-voice-draft', message)
  voiceGeneration++
  stopSpeaking()
  clearTimeout(sendTimer)
  link?.close()
  link = null
  committed = ''
  draft = ''
  busy = true
  const optimisticMessage = { role: 'user', text: message }
  let answered = false
  state.history.push(optimisticMessage)
  render()
  try {
    const rows = visibleRows().slice(0, pageSize)
    await api('/widget/api/visible', {
      templates: mode === 'templates' ? rows.map((r) => r.id) : [],
      systems: mode === 'systems' ? rows.map((r) => r.id) : []
    })
    const out = await api('/widget/api/turn', { message, describeSelection })
    state = { ...state, ...out }
    answered = true
    sessionStorage.removeItem('tracy-widget-voice-draft')
    notice = ''
    if (out.systemIds?.length && !out.templateIds?.length) mode = 'systems'
    render()
    if (out.action?.type === 'open_login') {
      await openSignInAction()
    } else if (voiceOn) await say(out.speak)
  } catch (err) {
    if (!answered) {
      // Remove only this attempt's optimistic row, never an earlier matching server message.
      state.history = state.history.filter((row) => row !== optimisticMessage)
      keepPendingDraft(message)
    }
    sessionStorage.removeItem('tracy-widget-voice-draft')
    setNotice(
      answered
        ? 'Your message was answered, but the next step could not finish. Nothing will be sent again automatically.'
        : err.code === 'MODEL_UNAVAILABLE'
          ? modelFailureMessage(err)
          : 'Tracy could not answer: ' + err.message + '. Your message is kept here; try again.'
    )
  } finally {
    busy = false
    render()
  }
}
async function say(text, once = false) {
  if ((!voiceOn && !once) || !player) return
  if (!speech.speak) return
  const speechId = authSpeechId
  const activePlayer = player
  talking = true
  if (!auth.active) {
    link?.close()
    link = null
  }
  preroll = []
  audioAbort = new AbortController()
  status('Tracy is speaking')
  const stop = document.getElementById('stop-speech')
  if (stop) stop.hidden = false
  try {
    const r = await fetch('/widget/backend/api/speech/say', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, speech.speak?.maxChars || 600),
        voice: speech.voices?.[0]?.id,
        ...(speech.revision ? { revision: speech.revision } : {}),
        ...(speech.sessionToken ? { sessionToken: speech.sessionToken } : {}),
        ...(language ? { language } : {})
      }),
      signal: AbortSignal.any([audioAbort.signal, AbortSignal.timeout(speech.speak?.answerMs || 10000)])
    })
    if (!r.ok) {
      const x = await r.json()
      if (r.status === 409 && x.code === 'VOICE_RESTART_REQUIRED') {
        await stopVoice()
        speech = await api('/api/speech')
        setNotice(
          'Voice settings changed. Start the microphone again to continue. Your conversation is kept.'
        )
        return
      }
      throw new Error(x.code)
    }
    if (speechId !== authSpeechId || !voiceOn || activePlayer !== player) {
      await r.body?.cancel()
      return
    }
    await activePlayer.play(r.body, Number(r.headers.get('x-sample-rate')) || 24000)
  } catch (err) {
    if (err.name !== 'AbortError')
      setNotice('Voice playback unavailable: ' + err.message + '. The answer is in the conversation.')
  } finally {
    talking = false
    status(
      auth.active
        ? auth.listening
          ? 'Listening · sign-in guidance'
          : 'Sign in here · your conversation is kept'
        : voiceOn
          ? 'Listening'
          : 'Microphone paused'
    )
    if (stop) stop.hidden = true
    preroll = []
  }
}
function stopSpeaking() {
  authSpeechId++
  audioAbort?.abort()
  player?.stop()
  talking = false
  const b = document.getElementById('stop-speech')
  if (b) b.hidden = true
  status(
    auth.active
      ? auth.listening
        ? 'Listening · sign-in guidance'
        : 'Sign in here · your conversation is kept'
      : voiceOn
        ? 'Listening'
        : 'Microphone paused'
  )
}
function frameRms(buffer) {
  const data = new Int16Array(buffer)
  let sum = 0
  for (const n of data) sum += (n / 32768) ** 2
  return Math.sqrt(sum / Math.max(data.length, 1))
}
function onFrame(frame) {
  if (
    !voiceOn ||
    talking ||
    authOpening ||
    (!auth.active && busy) ||
    (auth.active && !auth.listening) ||
    Date.now() < reconnectUntil
  )
    return
  if (link) {
    link.sendAudio(frame)
    return
  }
  preroll.push(frame)
  if (preroll.length > 10) preroll.shift()
  loudFrames = frameRms(frame) > 0.012 ? loudFrames + 1 : 0
  if (loudFrames >= 2) {
    loudFrames = 0
    openLink()
    for (const f of preroll) link?.sendAudio(f)
    preroll = []
  }
}
function openLink() {
  if (draft.trim()) {
    holdVoiceDraft()
    render()
  }
  speech = { ...speech, sessionToken: undefined }
  let done = false
  const generation = ++voiceGeneration
  const routedWords = speechCursor(auth.active ? auth.voiceRoute : 'chat')
  link = openWidgetSpeechLink(
    {
      onReady: (facts) => {
        if (done || generation !== voiceGeneration) return
        speech = readySpeechFacts(speech, facts)
        reconnects = 0
        // Hearing readiness does not resolve an unanswered message kept for manual review.
        if (!pendingDraft.trim()) setNotice('')
        status('Listening')
      },
      onLanguage: (code) => {
        if (done || generation !== voiceGeneration) return
        const previous = language
        language = code
        if (auth.active && auth.listening && !authOpening && previous !== code) void auth.beginVoice()
      },
      onWords: (words, partial) => {
        if (done || generation !== voiceGeneration) return
        const currentWords = routedWords(auth.active ? auth.voiceRoute : 'chat', words)
        if (authOpening) return
        if (auth.active) {
          if (!talking) auth.receiveWords(currentWords, partial)
          return
        }
        committed = currentWords.join(' ').trim()
        draft = [committed, partial].filter(Boolean).join(' ')
        sessionStorage.setItem('tracy-widget-voice-draft', draft)
        status('Listening')
        const send = document.getElementById('send-heard')
        if (send) send.hidden = !draft.trim()
        clearTimeout(sendTimer)
        if (committed && !partial)
          sendTimer = setTimeout(() => {
            if (done || generation !== voiceGeneration || !voiceOn || !draft.trim()) return
            done = true
            const text = draft.trim()
            link?.stop()
            link?.close()
            link = null
            submit(text)
          }, 1600)
      },
      onEnd: (reason, settled) => {
        if (generation !== voiceGeneration) return
        link = null
        clearTimeout(sendTimer)
        if (done) return
        done = true
        if (auth.active) {
          auth.voiceEnded(reason)
          return
        }
        if (reason === 'silence' || reason === 'stopped') {
          if (draft.trim() && settled) {
            done = true
            submit(draft.trim())
          } else {
            if (draft.trim() && !settled) {
              holdVoiceDraft()
              render()
            }
            status('Listening')
          }
        } else if (reason === 'network' && voiceOn && reconnects < 3) {
          reconnects++
          reconnectUntil = Date.now() + 1000 * reconnects
          holdVoiceDraft()
          setNotice(
            'Connection interrupted. Earlier words need your confirmation in the message box. New speech will reconnect automatically.'
          )
          render()
          status('Reconnecting…')
        } else {
          holdVoiceDraft()
          speech = { ...speech, sessionToken: undefined }
          voiceOn = false
          setNotice(
            'Voice ended: ' +
              reason +
              '. Your heard words are kept. Retry the microphone, send them, or type.'
          )
          microphone?.close()
          microphone = null
          render()
        }
      }
    },
    { url: widgetSocket(language === 'vi' ? 'vi' : '') }
  )
}
async function startVoice() {
  if (voiceOn) return
  player ??= openPlayer()
  voiceOn = true
  reconnects = 0
  reconnectUntil = 0
  render()
  status('Opening microphone…')
  try {
    speech = await api('/api/speech')
    if (!voiceOn) return
    if (!speech.available) throw new Error('Voice is unavailable in the current configuration.')
    // The voice socket serves only a visitor the server already made, and reading the page makes none
    // (council 19/10/2026): this write makes it, before the microphone is asked for. A native
    // conversation refuses it (409) and already is a visitor.
    await api('/widget/api/visible', visibleChoices()).catch((error) => {
      if (error.code !== 'WIDGET_NATIVE_ACTIVE') throw error
    })
    if (!voiceOn) return
    microphone = await openMicrophone(
      onFrame,
      (level) => {
        const orb = document.querySelector('.orb')
        if (orb && !talking) orb.style.transform = `scale(${1 + level * 0.12})`
      },
      () => {
        stopVoice()
        setNotice('The microphone disconnected. You can keep typing.')
      }
    )
    status('Listening')
    if (auth.active) {
      await auth.beginVoice()
      return
    }
    if (!state.history.length)
      await say(
        'Hi, I’m Tracy. I can help you choose a template and a design style, then create your website on WordPress, Joomla or EmDash. What kind of website would you like to make?'
      )
  } catch (err) {
    voiceOn = false
    render()
    setNotice(
      err.problem === 'denied'
        ? 'Microphone permission was denied. Allow access in your browser, or type below.'
        : err.problem === 'unsupported' && globalThis.isSecureContext === false
          ? 'Your browser blocks microphone access because this page is not secure. Open the page over HTTPS, or keep typing.'
          : 'Could not open the microphone: ' + (err.problem || err.message)
    )
  }
}
async function stopVoice() {
  voiceGeneration++
  speech = { ...speech, sessionToken: undefined }
  holdVoiceDraft()
  auth.pauseVoice()
  voiceOn = false
  clearTimeout(sendTimer)
  link?.close()
  link = null
  await microphone?.close()
  microphone = null
  stopSpeaking()
  render()
}
function modal(html) {
  document.querySelector('dialog')?.remove()
  const d = document.createElement('dialog')
  d.innerHTML =
    '<div class="modal"><button class="modal-close" aria-label="Close dialog">×</button>' + html + '</div>'
  document.body.append(d)
  d.querySelector('.modal-close').onclick = () => d.close()
  d.addEventListener('click', (ev) => {
    if (ev.target === d) d.close()
  })
  d.showModal()
  return d
}
function preview(id) {
  const row = (mode === 'templates' ? catalogue.templates : catalogue.systems).find((r) => r.id === id)
  const image = safeURL(row.card?.image || row.image)
  modal(
    '<h2>' +
      e(row.label || row.name) +
      '</h2><p>' +
      e(row.card?.blurb || row.description || 'Reference from the Tracy catalogue') +
      '</p>' +
      (image
        ? '<img class="preview-image" src="' + e(image) + '" alt="' + e(row.label || row.name) + '">'
        : '<p>No preview available.</p>') +
      '<p>This is the published template or design reference. The combined website is created after you confirm your brief.</p>'
  )
}
async function showBrief() {
  stopSpeaking()
  const t = catalogue.templates.find((r) => r.id === state.selectedTemplate)
  if (!t) return
  const d = catalogue.systems.find((r) => r.id === state.selectedSystem)
  const dialog = modal(
    '<h2>Your website, ready to start.</h2><p>' +
      e(state.brief.about || 'Tell Tracy about your business to personalize the template.') +
      '</p><label>Business name</label><input id="business-name" value="' +
      e(state.brief.name) +
      '" placeholder="Your business name"><label>Template</label><p>' +
      e(t.label) +
      '</p><label>Platform</label><select id="platform">' +
      t.platforms
        .map(
          (p) =>
            '<option value="' +
            e(p.platform) +
            '" ' +
            (p.platform === state.brief.platform ? 'selected' : '') +
            '>' +
            ({ wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }[p.platform] || p.platform) +
            '</option>'
        )
        .join('') +
      '</select><label>Design system</label><p>' +
      e(d?.name || 'Original template design') +
      '</p><div id="support-note" class="progress-copy">Checking template compatibility…</div><label>Site address</label><input id="site-label" placeholder="my-studio" pattern="[a-z][a-z0-9-]{2,31}" value="' +
      e(
        (state.brief.name || 'my-site')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 22) +
          '-' +
          Math.random().toString(36).slice(2, 6)
      ) +
      '"><p>Tracy will create your website on this environment.</p><div id="create-error" class="modal-error" role="alert"></div><button class="button primary" id="create-site">Create website →</button>'
  )
  const platform = document.getElementById('platform')
  async function support() {
    await api('/widget/api/select', { kind: 'platform', id: platform.value })
    state.brief.platform = platform.value
    const out = await api('/widget/api/support')
    document.getElementById('support-note').textContent = out.supported
      ? 'This template supports design systems.'
      : state.selectedSystem
        ? 'Design system unavailable on this template: ' +
          (out.reason || 'not ready') +
          '. Choose another template or use the original design.'
        : 'The template’s original design will be used.'
    document.getElementById('create-site').disabled = !!state.selectedSystem && !out.supported
    if (state.selectedSystem && !out.supported) {
      const b = document.createElement('button')
      b.className = 'text-option'
      b.textContent = 'Use the original template design'
      b.onclick = async () => {
        state = { ...state, ...(await api('/widget/api/select', { kind: 'system', id: null })) }
        dialog.close()
        showBrief()
      }
      document.getElementById('support-note').append(b)
    }
  }
  platform.onchange = () =>
    support().catch((err) => (document.getElementById('create-error').textContent = err.message))
  support().catch((err) => (document.getElementById('create-error').textContent = err.message))
  document.getElementById('create-site').onclick = async () => {
    const button = document.getElementById('create-site')
    button.disabled = true
    try {
      state = {
        ...state,
        ...(await api('/widget/api/select', {
          kind: 'brief',
          name: document.getElementById('business-name').value
        }))
      }
      const me = await api('/widget/api/auth/status')
      if (!me.signedIn) {
        const label = document.getElementById('site-label').value
        dialog.close()
        login(() => createSite(label))
        return
      }
      await createSite(document.getElementById('site-label').value)
      dialog.close()
    } catch (err) {
      document.getElementById('create-error').textContent = err.message
      button.disabled = false
    }
  }
}
async function openSignInAction() {
  await login()
}
function resetSpeechSegment() {
  speech = { ...speech, sessionToken: undefined }
  voiceGeneration++
  clearTimeout(sendTimer)
  link?.close()
  link = null
  committed = ''
  preroll = []
  loudFrames = 0
}
async function authGuide(input) {
  const key = typeof input === 'string' ? input : input.key
  const code = speechLanguageCode(language || navigator.language || 'en') || 'en'
  const requestId = (authGuide.requestId = (authGuide.requestId || 0) + 1)
  let pack = authWords[code]
    ? { language: code, guides: authWords[code], lexicon: authWords[code].lexicon }
    : null
  if (!pack) {
    authGuide.packs ??= new Map()
    let pending = authGuide.packs.get(code)
    if (!pending) {
      pending = api('/widget/api/auth/language', { language: code })
      authGuide.packs.set(code, pending)
    }
    try {
      pack = await pending
      if (pack.language !== code || !pack.guides?.[key] || !pack.lexicon)
        throw Error('AUTH_LANGUAGE_UNAVAILABLE')
    } catch {
      authGuide.packs.delete(code)
      if (requestId !== authGuide.requestId) return
      activeAuthLanguagePack = null
      setNotice(
        'Voice sign-in instructions for this language are unavailable right now. You can use the sign-in form or try voice again.'
      )
      return
    }
  }
  if (requestId !== authGuide.requestId) return
  activeAuthLanguagePack = pack
  let text = pack.guides[key]
  if (typeof input === 'object')
    text = text.replace('{email}', input.email).replace('{spelling}', input.spelling)
  setNotice(text)
  if (voiceOn) {
    player ??= openPlayer()
    stopSpeaking()
    const id = ++authSpeechId
    for (const part of speechParts(text, speech.speak?.maxChars || 600)) {
      if (id !== authSpeechId || !voiceOn) break
      await say(part, true)
    }
  }
}
const auth = createAuth({
  api,
  escape: e,
  isVoiceOn: () => voiceOn,
  ensureVoice: () => {
    if (voiceOn && !link) openLink()
  },
  onGuide: authGuide,
  getLexicon: () => activeAuthLanguagePack?.lexicon,
  onSpeechLanguage: async (code) => {
    language = code
    await authGuide('code')
  },
  canReadWords: () =>
    activeAuthLanguagePack?.language === speechLanguageCode(language || navigator.language || 'en'),
  onExit: resetSpeechSegment,
  onClose: async () => {
    render()
    await authGuide('cancelled')
  },
  onDone: async () => {
    state.signedIn = true
    // The old discovery callback must not replay a create request into a new native scope.
    await enterNative()
  }
})
async function login(after) {
  if (state.signedIn) {
    setNotice('You are already signed in. We can continue with your website.')
    return
  }
  if (auth.active || authOpening) return
  authOpening = true
  catalogueOpen = false
  clearTimeout(sendTimer)
  stopSpeaking()
  try {
    await api('/widget/api/auth/cancel', {})
    render()
    auth.open(after)
    if (voiceOn) await auth.beginVoice()
  } catch (err) {
    setNotice('Could not open sign-in: ' + err.message)
  } finally {
    authOpening = false
  }
}
async function createSite(label) {
  const d = modal(
    '<h2>Creating your website.</h2><p id="build-step">Sending your brief to Tracy…</p><div class="progress"><span></span></div><div id="build-result"></div>'
  )
  try {
    const job = await api('/widget/api/create', { label })
    state.build = job
    await pollBuild(job, d)
  } catch (err) {
    d.querySelector('.progress').remove()
    document.getElementById('build-step').textContent = 'The website could not be created: ' + err.message
  }
}
function buildLinks(facts) {
  if (facts?.state !== 'done') return ''
  const links = facts.links || {}
  let result = ''
  for (const [key, label] of [
    ['openWebsite', 'Open your website ↗'],
    ['continueTracy', 'Continue with Tracy ↗']
  ]) {
    try {
      const url = new URL(links[key], location.origin)
      if (
        !links[key] ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash
      )
        continue
      if (key === 'continueTracy' && url.origin !== location.origin) continue
      result +=
        '<a class="button" href="' + e(url.href) + '" target="_blank" rel="noopener">' + label + '</a>'
    } catch {}
  }
  return result
}
async function resumeBuild() {
  const d = modal(
    '<h2>Your website build.</h2><p id="build-step">Checking the real build status…</p><div class="progress"><span></span></div><div id="build-result"></div>'
  )
  try {
    const facts = await api('/widget/api/build-status')
    state.buildStatus = facts
    d.querySelector('.progress')?.remove()
    const labels = {
      done: 'Your website is ready.',
      pending: 'Your website build is pending.',
      running: 'Your website is being prepared.',
      failed: 'The website build failed.',
      missing: 'The current build could not be found.',
      expired: 'The build context has expired.',
      signed_out: 'Sign in to check your website.',
      unavailable: 'Build status is currently unavailable.'
    }
    document.getElementById('build-step').textContent = labels[facts.state] || labels.unavailable
    document.getElementById('build-result').innerHTML = buildLinks(facts)
  } catch (err) {
    d.querySelector('.progress')?.remove()
    document.getElementById('build-step').textContent = err.message
  }
}
async function pollBuild(job, dialog) {
  if (!job.jobId) {
    document.getElementById('build-step').textContent = 'Site request saved. Open Tracy to continue.'
    return
  }
  for (let n = 0; n < 500; n++) {
    const out = await api(
      '/api/sites/' + encodeURIComponent(job.siteKey) + '/jobs/' + encodeURIComponent(job.jobId)
    )
    const step = document.getElementById('build-step')
    if (!dialog.open) return
    if (step) step.textContent = out.step || out.state || 'Creating your website…'
    if (out.state === 'failed') throw new Error(out.reason || out.error || 'BUILD_FAILED')
    if (out.state === 'done') {
      dialog.querySelector('h2').textContent = 'Your website is ready.'
      dialog.querySelector('.progress')?.remove()
      if (out.briefState === 'failed')
        document.getElementById('build-step').textContent =
          'The website is running with its original template content. Personalization could not be applied: ' +
          (out.briefError || 'not available')
      if (out.designSystem?.state === 'failed' || out.designSystem?.state === 'skipped')
        document.getElementById('build-step').textContent =
          'Website created; the design system was not applied: ' +
          (out.designSystem.reason || out.designSystem.state)
      state.buildStatus = await api('/widget/api/build-status')
      document.getElementById('build-result').innerHTML = buildLinks(state.buildStatus)
      return
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  throw new Error('Build is still running. Reopen Tracy to check its status.')
}
window.widgetExplore = () => {
  catalogueOpen = true
  mode = 'templates'
  render()
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
window.widgetLogin = () => openSignInAction()
window.widgetSend = (message) => submit(message)
window.addEventListener('pagehide', () => {
  speech = { ...speech, sessionToken: undefined }
  voiceOn = false
  link?.close()
  microphone?.close()
  player?.close()
})
let bootstrapPending = null
async function readBootstrap(url) {
  if (!['/widget/api/state', '/widget/api/catalogue'].includes(url)) throw new Error('BOOTSTRAP_READ_INVALID')
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      return await api(url, undefined, controller.signal)
    } catch (error) {
      const transient =
        typeof error.status === 'number'
          ? error.code === 'WIDGET_UNAVAILABLE' &&
            error.status >= 500 &&
            error.status < 600 &&
            error.retryable !== false
          : controller.signal.aborted || error.name === 'TypeError'
      if (!transient || attempt === 2) throw error
    } finally {
      clearTimeout(timer)
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
}
function bootstrap() {
  if (bootstrapPending) return bootstrapPending
  const retry = document.getElementById('retry-connection')
  if (retry) retry.disabled = true
  bootstrapPending = (async () => {
    try {
      stage.innerHTML =
        head('Connecting to Tracy…') +
        '<div class="loading-text">Loading the real template and design-system catalogue…</div>'
      // Only these two reads retry. Adoption, sign-in and conversation writes keep their own policy.
      const restoredState = await readBootstrap('/widget/api/state')
      const discoveredCatalogue = await readBootstrap('/widget/api/catalogue')
      state = { ...state, ...restoredState }
      catalogue = discoveredCatalogue
      if (state.recovery?.manualOnly && state.recovery.message) keepPendingDraft(state.recovery.message)
      auth.resume(state.authPending)
      speech = state.speech || {}
      // A refused hand-off (work still settling, no seat now) leaves discovery as it was: the state and
      // catalogue above were read, so the page renders them instead of failing to connect.
      if (state.signedIn) await enterNative().catch(() => {})
      if (state.resumeRequiresSignIn)
        notice = 'Sign in again to restore your saved conversation and website choices.'
      else if (!speech.available) notice = 'Voice is unavailable on this stand. You can continue by typing.'
      auth.active ||
      state.history.length ||
      draft.trim() ||
      pendingDraft.trim() ||
      state.selectedTemplate ||
      state.selectedSystem
        ? render()
        : renderWelcome()
      if (notice) setNotice(notice)
    } catch {
      stage.innerHTML =
        head('Connection unavailable') +
        '<div class="notice" role="alert">Tracy could not connect. Your conversation has not been cleared.</div>' +
        '<button class="button" id="retry-connection" disabled>Retry connection</button>'
      document.getElementById('retry-connection').onclick = bootstrap
    }
  })().finally(() => {
    bootstrapPending = null
    const button = document.getElementById('retry-connection')
    if (button) button.disabled = false
  })
  return bootstrapPending
}
await bootstrap()

function fitViewport() {
  const viewport = window.visualViewport
  document.documentElement.style.setProperty('--widget-height', (viewport?.height || innerHeight) + 'px')
  document.documentElement.style.setProperty('--widget-top', (viewport?.offsetTop || 0) + 'px')
}
window.visualViewport?.addEventListener('resize', fitViewport)
window.visualViewport?.addEventListener('scroll', fitViewport)
window.addEventListener('resize', fitViewport)
fitViewport()
