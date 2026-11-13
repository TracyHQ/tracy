/**
 * `@tracy/dsh-build-chat` — the build chat's own cards (TracyHQ/tracy#575, Part 2): the template choice (#605), the
 * build task list with its timer and the notice of a build that could not finish (#608).
 *
 * Every card is a pure function of the build session's data (template options, Contract B progress and outcome), so
 * the sample scenarios draw them in tests now and the session's real tool results draw them once #609 wires them into
 * the chat. Until then no bundle names this package: activating it only brings its styles and words, and it draws
 * nothing in any slot, so no customer sees a card fed by nothing.
 */
import { CSS } from './styles'
import { en, NS } from './strings'

export { BuildProgress } from './BuildProgress'
export { BuildStopped } from './BuildStopped'
export { saveTemplateChoice } from './save-template'
export { english, NS as BUILD_CHAT_NS } from './strings'
export { ADD_SITE_HREF, TemplateCard } from './TemplateCard'

interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  locale: { register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown }
}

export const inject = ['locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const id = 'tracy-build-chat-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'tracy-build-chat: styles')
  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-build-chat: dictionaries')
}
