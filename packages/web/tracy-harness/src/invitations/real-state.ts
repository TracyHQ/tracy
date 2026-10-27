import type { Page, RecipientSummary } from './real-api'
export interface RealState {
  campaignId: string
  group: string
  queryId: number
  recipients: RecipientSummary[]
  cursor: string | null
  dirty: boolean
}
export interface QueryToken {
  campaignId: string
  group: string
  queryId: number
}
export function beginRealQuery(state: RealState, filter: { campaignId: string; group: string }) {
  const next = { ...state, ...filter, queryId: state.queryId + 1, recipients: [], cursor: null }
  return { state: next, token: { campaignId: next.campaignId, group: next.group, queryId: next.queryId } }
}
export function acceptRealQuery(
  state: RealState,
  token: QueryToken,
  page: Page<RecipientSummary>
): RealState {
  return state.campaignId === token.campaignId &&
    state.group === token.group &&
    state.queryId === token.queryId
    ? { ...state, recipients: page.items, cursor: page.nextCursor }
    : state
}
