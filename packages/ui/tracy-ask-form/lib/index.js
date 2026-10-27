/**
 * Host half: intentionally empty.
 *
 * The questions come from dsh's own `ask_user_question` tool and are answered through the pending
 * interaction the browser already holds (`pending.answer()`); nothing here needs a host route.
 */
export const name = '@tracy/dsh-ask-form'
export function apply() {}
