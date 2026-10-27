/**
 * Server-only adoption contract. Identity comes from verified authentication, never request JSON.
 * Persist the preparing mapping with the conversation CAS BEFORE calling native session/create.
 * This module does not authenticate a cookie, execute a prompt, or transfer workspace authority.
 */
import { createHash, randomUUID } from 'node:crypto'
import { baseConversationPayload } from './conversation-payload.js'

const SCHEMA = 'widget-native-handoff/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION = /^session-widget-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail = (code) => {
  throw Error(code)
}

/**
 * Copy only the discovery data already admitted to durable history. Private authentication must
 * stay outside that history at capture time; numeric text alone cannot safely be classified as OTP.
 * Imported words are context with provenance, not commands to replay or native execution records.
 */
export function nativeImportedContext(visitor) {
  const value = baseConversationPayload(visitor)
  return {
    schema: 'widget-imported-context/v1',
    source: 'widget-discovery',
    history: value.history,
    brief: value.brief,
    selection: {
      template: value.selectedTemplate,
      designSystem: value.selectedSystem,
      visibleTemplates: value.visibleTemplates,
      visibleSystems: value.visibleSystems
    }
  }
}

function assertIdentity(visitor, identity) {
  const { visitorId, ownerAccountId, expectedRevision, now = Date.now() } = identity ?? {}
  if (
    !UUID.test(ownerAccountId ?? '') ||
    typeof visitorId !== 'string' ||
    !visitorId ||
    visitorId.length > 200 ||
    visitor?.id !== visitorId ||
    visitor.ownerId !== ownerAccountId ||
    visitor.locked ||
    !Number.isFinite(now) ||
    !Number.isFinite(visitor.expires) ||
    visitor.expires <= now
  )
    fail('WIDGET_NATIVE_IDENTITY_INVALID')
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    visitor.revision !== expectedRevision
  )
    fail('WIDGET_NATIVE_REVISION_CONFLICT')
}

function existingMapping(visitor, identity) {
  const mapping = visitor.nativeHandoff
  if (!mapping) return null
  if (
    mapping.schema !== SCHEMA ||
    mapping.scope !== 'onboarding' ||
    mapping.visitorId !== identity.visitorId ||
    mapping.ownerAccountId !== identity.ownerAccountId ||
    !SESSION.test(mapping.sessionId ?? '') ||
    !['preparing', 'ready'].includes(mapping.state) ||
    !Number.isSafeInteger(mapping.sourceRevision) ||
    mapping.sourceRevision < 0 ||
    mapping.sourceRevision > visitor.revision ||
    !mapping.context ||
    hash(mapping.context) !== mapping.contextHash ||
    (mapping.state === 'ready' && (typeof mapping.workspaceId !== 'string' || !mapping.workspaceId))
  )
    fail('WIDGET_NATIVE_MAPPING_INVALID')
  // Re-sanitize persisted context as well: an added credential field must not be imported.
  if (JSON.stringify(mapping.context) !== JSON.stringify(nativeImportedContext(visitor)))
    fail('WIDGET_NATIVE_CONTEXT_CHANGED')
  return structuredClone(mapping)
}

/** Return an idempotent mapping; the caller persists it before creating any native resources. */
export function prepareNativeHandoff(visitor, identity) {
  assertIdentity(visitor, identity)
  const existing = existingMapping(visitor, identity)
  if (existing) return existing
  const context = nativeImportedContext(visitor)
  return {
    schema: SCHEMA,
    state: 'preparing',
    scope: 'onboarding',
    visitorId: identity.visitorId,
    ownerAccountId: identity.ownerAccountId,
    sessionId: `session-widget-${randomUUID()}`,
    sourceRevision: visitor.revision,
    contextHash: hash(context),
    context
  }
}

/** Mark only the persisted native identity ready after the native adapter completed its import. */
export function finishNativeHandoff(visitor, identity, native) {
  assertIdentity(visitor, identity)
  const mapping = existingMapping(visitor, identity)
  if (
    !mapping ||
    native?.sessionId !== mapping.sessionId ||
    typeof native.workspaceId !== 'string' ||
    !native.workspaceId ||
    native.workspaceId.length > 200 ||
    (mapping.state === 'ready' && mapping.workspaceId !== native.workspaceId)
  )
    fail('WIDGET_NATIVE_RESULT_INVALID')
  return { ...mapping, state: 'ready', workspaceId: native.workspaceId }
}

/** Validate then whitelist adoption metadata before encryption or restoration. */
export function nativeHandoffPayload(mapping, discovery) {
  const context = nativeImportedContext(discovery)
  const contextHash = hash(context)
  if (
    mapping?.schema !== SCHEMA ||
    mapping.scope !== 'onboarding' ||
    typeof mapping.visitorId !== 'string' ||
    !mapping.visitorId ||
    mapping.visitorId.length > 200 ||
    !UUID.test(mapping.ownerAccountId ?? '') ||
    !SESSION.test(mapping.sessionId ?? '') ||
    !['preparing', 'ready'].includes(mapping.state) ||
    !Number.isSafeInteger(mapping.sourceRevision) ||
    mapping.sourceRevision < 0 ||
    mapping.contextHash !== contextHash ||
    hash(mapping.context) !== contextHash ||
    (mapping.state === 'ready' &&
      (typeof mapping.workspaceId !== 'string' || !mapping.workspaceId || mapping.workspaceId.length > 200))
  )
    fail('WIDGET_NATIVE_MAPPING_INVALID')
  return {
    schema: SCHEMA,
    state: mapping.state,
    scope: 'onboarding',
    visitorId: mapping.visitorId,
    ownerAccountId: mapping.ownerAccountId,
    sessionId: mapping.sessionId,
    sourceRevision: mapping.sourceRevision,
    contextHash,
    context,
    ...(mapping.state === 'ready' ? { workspaceId: mapping.workspaceId } : {})
  }
}
