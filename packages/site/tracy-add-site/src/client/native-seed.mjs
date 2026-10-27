/** Discovery is a draft for the native creation form, never an instruction to create a site. */
import { tracyWebFetch } from '@tracy/core/web-path'

/** @param {string | undefined} sessionId */
export async function readNativeSeed(sessionId) {
  if (!/^session-widget-[a-f0-9-]{36}$/i.test(sessionId || '')) return null
  const door = globalThis.location?.pathname?.startsWith('/widget/native/')
    ? '/widget/api/native/context'
    : '/api/widget-native/context'
  try {
    const [response, catalogue] = await Promise.all([
      globalThis.fetch(door + '?session=' + encodeURIComponent(sessionId || ''), {
        credentials: 'same-origin'
      }),
      tracyWebFetch('/api/templates')
    ])
    if (!response.ok || !catalogue.ok) return null
    const value = await response.json()
    const templates = (await catalogue.json()).templates
    const context = value.context
    const platform = context?.brief?.platform
    if (
      context?.schema !== 'widget-imported-context/v1' ||
      !['wordpress', 'joomla', 'emdash'].includes(platform) ||
      !Array.isArray(templates)
    )
      return null
    const template = templates.find(
      (row) =>
        row.id === context.selection?.template &&
        row.platforms?.some(/** @param {{platform:string}} entry */ (entry) => entry.platform === platform)
    )
    if (!template) return null
    // An existing job belongs to its own resume flow; adoption must not prepare a duplicate build.
    if (value.currentBuild?.state !== 'missing') return null
    return {
      platform,
      template: template.id,
      brief: {
        name: typeof context.brief.name === 'string' ? context.brief.name.slice(0, 200) : '',
        about: typeof context.brief.about === 'string' ? context.brief.about.slice(0, 300) : ''
      },
      designSystem: typeof context.selection.designSystem === 'string' ? context.selection.designSystem : null
    }
  } catch {
    return null
  }
}

/**
 * @param {{feeds?:string[],id:string,kind:string}[]} questions
 * @param {{name:string,about:string}} brief
 * @param {Record<string, unknown>} current
 * @returns {Record<string,string>}
 */
export function nativeBriefAnswers(questions, brief, current) {
  /** @type {Record<string,string>} */
  const result = {}
  for (const question of questions) {
    if (!['text', 'longtext'].includes(question.kind) || current[question.id] != null) continue
    const text = question.feeds?.includes('site.name')
      ? brief.name
      : question.feeds?.includes('copy.about')
        ? brief.about
        : ''
    if (text) result[question.id] = text.slice(0, question.kind === 'text' ? 200 : 300)
  }
  return result
}
