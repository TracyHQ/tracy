/**
 * English baseline for the `tracy-ask-form` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Other interface languages
 * arrive from `@tracy/dsh-tracy-locale-vi` and `@tracy/dsh-tracy-locales`. `NS` lives beside `en`
 * so `check-dsh-locale` can find the owner.
 */
export const NS = 'tracy-ask-form'

export const en = {
  /** Tab label in the side card and the header of the tab. */
  'tab.title': 'Questions',
  /** The tab when the agent is not waiting on the customer. */
  'empty.title': 'No questions are waiting',

  /** Above the questions: who asks, and that the work waits on the answer. */
  'pane.lead': 'Tracy needs your answer before it continues',

  /** The form's three ways out (tasks/todo-hoi-khach-mot-lan.md). */
  'action.submit': 'Send answer',
  /** Fills each unanswered question with the agent's recommendation; the rest are left to the agent. */
  'action.decide': 'Decide for me',
  /** Sends what is entered so far and asks the agent to ask again before deciding. */
  'action.followUp': 'Ask me follow-up questions',
  /** A press whose answer did not reach the agent; the buttons work again. */
  'error.answer': 'Your answer did not reach the agent. Try again.',

  /** The card in the chat column while the form in the right pane holds the questions. */
  'pointer.one': 'One question is waiting in the right pane',
  'pointer.many': '{count} questions are waiting in the right pane',
  /** Opens (or brings forward) the Questions tab. */
  'pointer.open': 'Open',

  /** The shared ask form's own words (`ASK_FORM_KEYS` of `@tracy/site-build-core`). */
  'ask.other': 'Other',
  'ask.otherPlaceholder': 'Or type your own answer',
  /** The tag on the option the agent would pick itself. */
  'ask.recommended': 'Recommended',
  'ask.rewrite': 'AI rewrite',
  'ask.rewriting': 'Rewriting…',
  'ask.rewriteUndo': 'Undo',
  'ask.rewriteFailed': 'Could not rewrite it. Try again.',
  'ask.languagePlaceholder': 'Choose a language…'
} as const

export type AskFormKey = keyof typeof en

export type Translate = (key: string, params?: Record<string, string | number>) => string
