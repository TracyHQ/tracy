/** Whitelist for discovery data; shared by encrypted storage and native context handoff. */
const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '')
const ids = (value, max = 36) =>
  Array.isArray(value)
    ? value
        .filter((v) => typeof v === 'string')
        .slice(0, max)
        .map((v) => text(v))
    : []
export function baseConversationPayload(input = {}) {
  const brief = input.brief || {}
  return {
    history: (Array.isArray(input.history) ? input.history : [])
      .filter((row) => ['user', 'assistant'].includes(row?.role) && typeof row.text === 'string')
      .slice(-30)
      .map((row) => ({ role: row.role, text: text(row.text, 4000) })),
    brief: {
      name: text(brief.name, 2000),
      about: text(brief.about, 2000),
      goal: ['contact', 'book', 'sell', 'showcase', 'publish'].includes(brief.goal) ? brief.goal : 'contact',
      style: ['professional', 'friendly', 'modern', 'bold', 'elegant'].includes(brief.style)
        ? brief.style
        : 'modern',
      platform: ['wordpress', 'joomla', 'emdash'].includes(brief.platform) ? brief.platform : 'wordpress'
    },
    selectedTemplate: text(input.selectedTemplate) || null,
    selectedSystem: text(input.selectedSystem) || null,
    templateIds: ids(input.templateIds, 6),
    systemIds: ids(input.systemIds, 6),
    visibleTemplates: ids(input.visibleTemplates),
    visibleSystems: ids(input.visibleSystems),
    buildId: text(input.buildId) || null,
    clientPending: {
      pendingDraft: text(input.clientPending?.pendingDraft, 4000),
      voiceDraft: text(input.clientPending?.voiceDraft, 4000)
    },
    build:
      input.build && typeof input.build.siteKey === 'string'
        ? { siteKey: text(input.build.siteKey), jobId: text(input.build.jobId) || null }
        : null,
    inflight: ['turn', 'create'].includes(input.inflight?.kind)
      ? {
          kind: input.inflight.kind,
          message: input.inflight.kind === 'turn' ? text(input.inflight.message, 4000) : '',
          // When it started: a stored one older than any run can last is not running (`native-session.js`).
          ...(Number.isSafeInteger(input.inflight.at) ? { at: input.inflight.at } : {}),
          // A create's request, sent again as it was when its answer never came (`route.js`).
          ...(input.inflight.kind === 'create' && createRequest(input.inflight.request)
            ? { request: createRequest(input.inflight.request) }
            : {})
        }
      : null
  }
}

/** The create request a widget press sent (`route.js` `/api/create`), its own fields only, or null. */
function createRequest(value) {
  if (!value || typeof value !== 'object') return null
  const request = {
    platform: text(value.platform),
    design: text(value.design),
    quickstart: text(value.quickstart),
    label: text(value.label),
    ...(typeof value.designSystem === 'string' ? { designSystem: text(value.designSystem) } : {})
  }
  return ['wordpress', 'joomla', 'emdash'].includes(request.platform) &&
    request.design &&
    request.quickstart &&
    /^[a-z][a-z0-9-]{2,31}$/.test(request.label)
    ? request
    : null
}
