/**
 * Runs a row's one next action (`nextAction`), the same from the Action column, the Inspector header
 * and the Details page. Every door already exists (plan D2); this only picks it and says what the
 * screen does next: refresh, open the Brief page (a demo site needs a name), or go to the site.
 */
import { requestTemplatePick, type TemplatePick, type TemplateRanking } from '@tracy/core/template-picker'
import { type Api, startResearch } from './api.ts'
import type { NextAction, OpportunityListRow } from './opportunity-row.ts'
import type { DemoAction } from './outreach-model.ts'
import type { RequestIds } from './request-ids.ts'
import { siteLinks } from './status.ts'

export type ActionOutcome =
  | { kind: 'done' }
  | { kind: 'demo-chat'; actions: DemoAction[] }
  | { kind: 'send-demo' }
  | { kind: 'failed'; code: string }
  | { kind: 'open-brief'; revisionId: string }
  | { kind: 'navigate'; href: string }

type ActionApi = Pick<Api, 'cancel' | 'resume' | 'research' | 'buildDemo'> &
  Pick<Partial<Api>, 'templateRanking'>

/**
 * The server's trade ranking for the template picker before these opportunities are built (`templateRanking`), or
 * null: no such door on this surface, a refusal or a network failure all open the picker ungrouped, as before.
 */
export async function rankingFor(
  api: Pick<Partial<Api>, 'templateRanking'>,
  ids: string[]
): Promise<TemplateRanking | null> {
  if (!api.templateRanking || ids.length === 0) return null
  try {
    const answer = await api.templateRanking(ids)
    return answer.ok ? (answer.body?.ranking ?? null) : null
  } catch {
    return null
  }
}

const settled = (answer: { ok: boolean; code?: string }): ActionOutcome =>
  answer.ok ? { kind: 'done' } : { kind: 'failed', code: answer.code ?? 'HTTP_500' }

const missing: ActionOutcome = { kind: 'failed', code: 'NOT_FOUND' }

export async function runAction(
  api: ActionApi,
  ids: RequestIds,
  action: NextAction,
  row: OpportunityListRow,
  pickTemplate: (ranking: TemplateRanking | null) => Promise<TemplatePick | null> = (ranking) =>
    requestTemplatePick(undefined, { ranking })
): Promise<ActionOutcome> {
  const jobId = row.job?.id
  switch (action) {
    case 'cancel':
      return typeof jobId === 'string' ? settled(await api.cancel(jobId)) : missing
    case 'resume':
      return typeof jobId === 'string' ? settled(await api.resume(jobId)) : missing
    case 'start':
      return settled(await startResearch(api, row.id, ids))
    case 'send-demo':
      return { kind: 'send-demo' }
    case 'retry-demo':
    case 'build': {
      let selection: TemplatePick | undefined
      if (action === 'build') {
        try {
          const picked = await pickTemplate(await rankingFor(api, [row.id]))
          if (!picked) return { kind: 'done' }
          selection = picked
        } catch {
          return { kind: 'failed', code: 'TEMPLATE_PICKER_UNAVAILABLE' }
        }
      }
      const choiceKey = selection ? `:${selection.cms}:${selection.design}:${selection.quickstart}` : ''
      const key = `demo:${row.id}:${action === 'retry-demo' ? (row.demoAction?.id ?? '') : ''}${choiceKey}`
      const { id: requestId } = ids.begin(key)
      const answer = await api.buildDemo(
        row.id,
        requestId,
        action === 'retry-demo' ? row.demoAction?.id : undefined,
        selection
      )
      if (answer.ok) ids.succeed(key)
      else ids.fail(key)
      return answer.ok && answer.body.actions?.some((item) => item.workflow === 'agent-demo/1')
        ? { kind: 'demo-chat', actions: answer.body.actions }
        : settled(answer)
    }
    case 'open-demo-chat':
      return row.demoAction?.id && row.demoAction.chatMode === 'client-send/1'
        ? { kind: 'demo-chat', actions: [row.demoAction] }
        : missing
    case 'open-site': {
      const fromBuild = row.latestBuild?.done === true ? row.latestBuild.siteKey : null
      const first = Array.isArray(row.sites)
        ? row.sites.find((s): s is string => typeof s === 'string' && s !== '')
        : undefined
      const links = siteLinks({ key: fromBuild ?? first ?? '' })
      return links === null ? missing : { kind: 'navigate', href: links.workspace }
    }
  }
}
