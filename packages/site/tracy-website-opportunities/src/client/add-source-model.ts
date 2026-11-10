/**
 * The state of the Add source popover (#537, option C): closed, open with the link being typed, sending it, or
 * open with the server's refusal code under the field. Pure: the popover component sends the link itself.
 */
export interface AddSourceState {
  open: boolean
  url: string
  busy: boolean
  /** The refusal code shown under the field (`source.add.error.<code>`), or null. */
  error: string | null
}

export type AddSourceAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'toggle' }
  | { type: 'type'; url: string }
  | { type: 'submit' }
  | { type: 'done'; code: string | null }

export const ADD_SOURCE_CLOSED: AddSourceState = Object.freeze({
  open: false,
  url: '',
  busy: false,
  error: null
})

/** The link the popover sends on Add, or null when the press sends nothing (busy, closed or an empty field). */
export function addSourceLinkOf(state: AddSourceState): string | null {
  if (!state.open || state.busy) return null
  const typed = state.url.trim()
  return typed === '' ? null : typed
}

export function addSourceStep(state: AddSourceState, action: AddSourceAction): AddSourceState {
  switch (action.type) {
    case 'open':
      return state.open ? state : { ...ADD_SOURCE_CLOSED, open: true }
    case 'close':
      return ADD_SOURCE_CLOSED
    case 'toggle':
      return state.open ? ADD_SOURCE_CLOSED : { ...ADD_SOURCE_CLOSED, open: true }
    case 'type':
      // Typing again clears the refusal: it was about the link before.
      return state.open ? { ...state, url: action.url, error: null } : state
    case 'submit': {
      if (!state.open || state.busy) return state
      if (state.url.trim() === '') return { ...state, error: 'INVALID_URL' }
      return { ...state, busy: true, error: null }
    }
    case 'done':
      // Closed while it was sending: it stays closed whatever the answer.
      if (!state.open) return state
      return action.code === null ? ADD_SOURCE_CLOSED : { ...state, busy: false, error: action.code }
  }
}
