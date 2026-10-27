import { modelForDoor } from '../lib/llm-door.js'
import { allowedAction, loginIntent, loginReply } from './actions.js'
export class WidgetModelError extends Error {
  constructor(status, reason) {
    super('MODEL_UNAVAILABLE')
    this.status = status
    this.reason = reason
  }
}

export function widgetConversation({
  pool,
  config,
  catalog,
  state,
  save,
  isSignedIn = async () => false,
  buildStatus = async () => ({ state: 'missing', links: null }),
  onDiagnostic = (entry) => console.info('[widget:model]', JSON.stringify(entry))
}) {
  function search(rows, q, limit = 8) {
    const words =
      String(q || '')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) || []
    return rows
      .map((row, i) => ({
        row,
        score: words.reduce((n, w) => {
          const name = (row.name || row.label || '').toLowerCase()
          const hay = JSON.stringify({
            name,
            group: row.group,
            description: row.description,
            blurb: row.card?.blurb,
            theme: row.theme
          }).toLowerCase()
          return n + (name.includes(w) ? 5 : hay.includes(w) ? 1 : 0)
        }, 0),
        i
      }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.row)
  }
  function summary(r) {
    return r.platforms
      ? { id: r.id, name: r.label, description: r.card?.blurb, platforms: r.platforms.map((p) => p.platform) }
      : { id: r.id, name: r.name, description: r.description, group: r.group, theme: r.theme }
  }
  async function openLogin(v, message) {
    const speak = loginReply(message)
    v.history.push({ role: 'user', text: message }, { role: 'assistant', text: speak })
    v.inflight = null
    await save(v)
    return { speak, ...state(v), action: { type: 'open_login' } }
  }
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_current_build_status',
        description:
          'Read the current signed-in visitor own website build. No IDs or URLs accepted. Read only.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    {
      type: 'function',
      function: {
        name: 'open_sign_in',
        description:
          'Open the actual sign-in form in this widget when the user asks to log in. Preserve their website choices. This does not sign the person in and never submits credentials.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_design_systems',
        description:
          'Search the real Tracy design-system catalogue. Use English keywords (industry, brand name, light/dark, style). Results are the only design IDs you may offer.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_templates',
        description:
          'Search released Tracy website templates by business and industry. Results declare the actual supported CMSs.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
      }
    }
  ]
  const knownKeys = new Set([
    'id',
    'object',
    'model',
    'choices',
    'usage',
    'error',
    'role',
    'content',
    'tool_calls',
    'reasoning_content',
    'refusal',
    'speak',
    'brief',
    'templateIds',
    'systemIds',
    'selectedTemplate',
    'selectedSystem',
    'action',
    'answer',
    'reply',
    'message',
    'response',
    'text'
  ])
  function keys(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? [
          ...new Set(
            Object.keys(value)
              .slice(0, 32)
              .map((key) => (knownKeys.has(key) ? key : 'unknown'))
          )
        ]
      : []
  }
  function report(stage, detail = {}) {
    // Fixed metadata only: never error messages, provider bodies, tool arguments or visitor data.
    try {
      onDiagnostic({ stage, ...detail })
    } catch {}
  }
  async function turn(req, v, message, describeSelection = false) {
    const signedIn = await isSignedIn(req, v)
    if (loginIntent(message)) {
      if (!signedIn) return openLogin(v, message)
      const speak = 'You are already signed in. We can continue with your website.'
      v.history.push({ role: 'user', text: message }, { role: 'assistant', text: speak })
      v.inflight = null
      await save(v)
      return { speak, ...state(v), signedIn: true, buildStatus: await buildStatus(req, v), action: null }
    }
    let currentBuild = await buildStatus(req, v)
    let model
    try {
      model = await modelForDoor(pool, 'assistant', config)
      if (!model?.apiKey || !model.baseUrl || !model.words) throw new Error('MODEL_NOT_CONFIGURED')
      if (!['http:', 'https:'].includes(new URL(model.baseUrl).protocol))
        throw new Error('MODEL_NOT_CONFIGURED')
    } catch {
      report('configuration')
      throw new WidgetModelError(503, 'configuration')
    }
    const c = await catalog(req, v)
    const allowedTemplates = new Set(c.templates.map((x) => x.id)),
      allowedSystems = new Set(c.systems.map((x) => x.id))
    const prompt = `You are Tracy, a friendly voice website creation guide. Reply in the user's language, at most 2 short sentences and one question. Help the user discover real templates and design systems, collect a useful brief and guide them to create a website on WordPress, Joomla or EmDash. Ask only one missing question at a time; never ask again for known information. Use search tools to find real catalogue choices; never invent template or system IDs, compatibility, facts, progress or URLs. A template defines structure; a design system defines the look. Selecting one does not create a site. Say a create button is available when ready; creation ONLY happens after the signed-in user presses Create website. Never claim this conversation created or changed a site. You may truthfully report an existing completed website ONLY when authoritative build status is done. Use get_current_build_status for status questions; distinguish pending, running, failed, missing, expired and unavailable. Never invent progress. Server links are displayed by the widget; do not invent or read URLs. If the user asks to open sign-in, call open_sign_in; the widget can actually open its form. Never say that opening sign-in is impossible. The signedIn field is authoritative. When true, never ask the user to sign in or call open_sign_in. When false, do not claim they are signed in. Do not start by listing the catalogue. Speak naturally; never read internal codes such as goal=showcase or style=modern aloud. Preserve the business name unless the user explicitly gives a new business name. Template and design-system names are NEVER the business name. If a design system is chosen but no template, find appropriate real templates and ask the user to choose one. Do not say the user is ready to create until selectedTemplate is set. If the user says to use the template as-is or proceed, stop asking optional style questions; briefly summarize the actual choices and point to Your website brief. A design reference is not a preview of the combined site. Design-system compatibility is checked by the real support door at the brief step; do not promise every combination works. Interpret 'the second one' using the visible list and select that exact ID. When a user picks a brand/style, search for it and suggest actual results. You may select a template/system when the user clearly chooses it; otherwise return 3 suggestions. Keep all known brief fields. Valid goal: contact,book,sell,showcase,publish. Valid style: professional,friendly,modern,bold,elegant. Your final answer MUST be JSON: {"speak":"words to say","brief":{"name":"business name or empty","about":"factual brief from user","goal":"contact","style":"modern","platform":"wordpress|joomla|emdash"},"templateIds":[real IDs],"systemIds":[real IDs],"selectedTemplate":real ID or null,"selectedSystem":real ID or null,"action":{"type":"open_login"} or null}. Null selection means keep existing selection. Current state: ${JSON.stringify({ ...state(v), recovery: undefined, signedIn, currentBuild })}. AUTHORITATIVE SELECTED TEMPLATE: ${JSON.stringify(c.templates.find((x) => x.id === v.selectedTemplate) ? summary(c.templates.find((x) => x.id === v.selectedTemplate)) : null)}. AUTHORITATIVE SELECTED SYSTEM: ${JSON.stringify(c.systems.find((x) => x.id === v.selectedSystem) ? summary(c.systems.find((x) => x.id === v.selectedSystem)) : null)}. ${describeSelection ? 'The user just CLICKED the current selection. Preserve its exact ID and label, do not search for a replacement. Describe it accurately and ask one missing brief question.' : ''} Catalogue contains ${c.templates.length} templates and ${c.systems.length} systems. Current visible templates: ${JSON.stringify(
      (v.visibleTemplates || v.templateIds)
        .map((id) => c.templates.find((x) => x.id === id))
        .filter(Boolean)
        .map(summary)
    )}. Current visible systems: ${JSON.stringify(
      (v.visibleSystems || v.systemIds)
        .map((id) => c.systems.find((x) => x.id === id))
        .filter(Boolean)
        .map(summary)
    )}.`
    const messages = [
      { role: 'system', content: prompt },
      ...v.history.slice(-12).map((x) => ({ role: x.role, content: x.text })),
      { role: 'user', content: message }
    ]
    let answer
    let statusToolUsed = false
    for (let i = 0; i < 4; i++) {
      let r
      const diagnostic = { iteration: i + 1 }
      const fail = (stage, status = 502, reason = 'upstream') => {
        report(stage, diagnostic)
        return new WidgetModelError(status, reason)
      }
      try {
        r = await fetch(model.baseUrl.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: model.words,
            messages,
            tools,
            tool_choice: !describeSelection && i < 3 ? 'auto' : 'none',
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 2400
          }),
          signal: AbortSignal.timeout(60000)
        })
      } catch (error) {
        throw fail(
          error?.name === 'TimeoutError' ? 'timeout' : 'network',
          error?.name === 'TimeoutError' ? 504 : 502
        )
      }
      diagnostic.providerHTTP = r.status
      const mime = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      diagnostic.contentType = ['application/json', 'text/plain', 'text/html', 'text/event-stream'].includes(
        mime
      )
        ? mime
        : mime
          ? 'other'
          : 'missing'
      if (!r.ok) {
        await r.body?.cancel().catch(() => {})
        throw fail(
          'provider_http',
          r.status,
          [401, 403].includes(r.status)
            ? 'authentication'
            : [400, 404, 422].includes(r.status)
              ? 'configuration'
              : 'upstream'
        )
      }
      let x
      try {
        x = await r.json()
      } catch {
        throw fail('provider_json')
      }
      diagnostic.parsedKeys = keys(x)
      const choice = x?.choices?.[0]
      const m = choice?.message
      if (!m || typeof m !== 'object' || Array.isArray(m)) throw fail('message_shape')
      diagnostic.parsedKeys = keys(m)
      diagnostic.finishReason = ['stop', 'length', 'tool_calls', 'function_call', 'content_filter'].includes(
        choice.finish_reason
      )
        ? choice.finish_reason
        : choice.finish_reason == null
          ? 'missing'
          : 'other'
      diagnostic.contentLength = typeof m.content === 'string' ? m.content.length : 0
      diagnostic.toolNames = Array.isArray(m.tool_calls)
        ? m.tool_calls
            .slice(0, 16)
            .map((call) =>
              tools.some((tool) => tool.function.name === call?.function?.name)
                ? call.function.name
                : 'unknown'
            )
        : []
      report('provider_response', diagnostic)
      if (m.tool_calls != null && !Array.isArray(m.tool_calls)) throw fail('tool_shape')
      if (m.tool_calls?.length) {
        if (i === 3 || describeSelection) throw fail('tool_budget')
        if (
          m.tool_calls.length > 16 ||
          m.tool_calls.some(
            (call) =>
              !call?.function ||
              typeof call.id !== 'string' ||
              !call.id ||
              typeof call.function.name !== 'string'
          )
        )
          throw fail('tool_shape')
        messages.push(m)
        for (const call of m.tool_calls) {
          if (call.function.name === 'open_sign_in') {
            if (!signedIn) return openLogin(v, message)
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ signedIn: true, action: 'already_signed_in' })
            })
            continue
          }
          if (call.function.name === 'get_current_build_status') {
            let args
            try {
              args = JSON.parse(call.function.arguments)
            } catch {
              args = null
            }
            const toolStatus =
              args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0
                ? (currentBuild = await buildStatus(req, v))
                : { state: 'unavailable', reason: 'INVALID_ARGUMENTS', links: null }
            statusToolUsed =
              toolStatus === currentBuild &&
              toolStatus?.schema === 'widget-build-status/v1' &&
              ['pending', 'running', 'done', 'failed', 'unavailable'].includes(toolStatus.state) &&
              typeof toolStatus.completion?.siteReady === 'boolean' &&
              toolStatus.completion.siteReady === (toolStatus.state === 'done')
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolStatus) })
            continue
          }
          if (!['search_templates', 'search_design_systems'].includes(call.function.name)) {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: 'UNKNOWN_TOOL' })
            })
            continue
          }
          let q
          try {
            q = JSON.parse(call.function.arguments).query
          } catch {
            q = ''
          }
          const rows =
            call.function.name === 'search_templates' ? search(c.templates, q) : search(c.systems, q)
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(rows.map(summary)) })
        }
        continue
      }
      const text = (typeof m.content === 'string' ? m.content : '')
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
      diagnostic.parsedKeys = []
      try {
        answer = JSON.parse(text)
      } catch {
        // Some providers return a plain completed reply despite JSON response mode.
        // Accept speech only before any tool, or after a validated read-only status tool.
        // Never infer brief updates, selections, actions or URLs from plain text.
        if (
          (i === 0 || statusToolUsed) &&
          choice.finish_reason === 'stop' &&
          !m.refusal &&
          text &&
          text.length <= 1800 &&
          !/^[{[`]/.test(text) &&
          !/<[^>]*>/.test(text) &&
          !/https?:\/\/|www\./i.test(text) &&
          !String(m.content).trim().startsWith('```')
        ) {
          answer = { speak: text }
          report(statusToolUsed ? 'plain_status_answer' : 'plain_speech_answer', diagnostic)
        } else throw fail('answer_json')
      }
      diagnostic.parsedKeys = keys(answer)
      if (!answer || typeof answer.speak !== 'string' || !answer.speak.trim()) throw fail('answer_shape')
      report('answer_valid', diagnostic)
      break
    }
    if (!answer || typeof answer.speak !== 'string' || !answer.speak.trim()) {
      report('tool_budget', { iteration: 4 })
      throw new WidgetModelError(502, 'upstream')
    }
    const raw = answer.brief || {}
    for (const k of ['name', 'about']) if (typeof raw[k] === 'string') v.brief[k] = raw[k].slice(0, 2000)
    if (['contact', 'book', 'sell', 'showcase', 'publish'].includes(raw.goal)) v.brief.goal = raw.goal
    if (['professional', 'friendly', 'modern', 'bold', 'elegant'].includes(raw.style))
      v.brief.style = raw.style
    if (['wordpress', 'joomla', 'emdash'].includes(raw.platform)) v.brief.platform = raw.platform
    for (const [k, set] of [
      ['templateIds', allowedTemplates],
      ['systemIds', allowedSystems]
    ])
      if (Array.isArray(answer[k]) && answer[k].length)
        v[k] = answer[k].filter((id) => set.has(id)).slice(0, 6)
    if (!describeSelection && allowedTemplates.has(answer.selectedTemplate))
      v.selectedTemplate = answer.selectedTemplate
    if (!describeSelection && allowedSystems.has(answer.selectedSystem))
      v.selectedSystem = answer.selectedSystem
    v.history.push({ role: 'user', text: message }, { role: 'assistant', text: answer.speak.slice(0, 1800) })
    v.inflight = null
    await save(v)
    return {
      speak: answer.speak,
      ...state(v),
      signedIn,
      buildStatus: currentBuild,
      action: signedIn ? null : allowedAction(answer.action)
    }
  }

  return { turn }
}
