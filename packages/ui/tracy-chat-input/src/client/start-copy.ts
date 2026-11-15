import { isBuildChatPage } from '@tracy/core/build-chat'
import type { StringKey } from './strings'

/**
 * A kind of empty chat that declares its own title and input hint (TracyHQ/tracy#613).
 *
 * The one place a workspace kind or preset says what its empty chat reads. The site's workspace and
 * the creation workspace keep their own keys (`start.site.*`, `start.*`) and are not listed: a page
 * with no kind draws exactly what it drew before. Add a kind here, with its two strings, to give
 * another chat its own words.
 */
export type StartKind = 'build'

export interface StartCopy {
  /** The heading above the chat box. */
  title: StringKey
  /** The chat box's hint while it is empty. */
  placeholder: StringKey
}

export const START_COPY: Record<StartKind, StartCopy> = {
  build: { title: 'start.build.title', placeholder: 'start.build.placeholder' }
}

/**
 * The kind of the page's empty chat, from its address, or null for a page that declares none.
 * The build chat is told by its session (`isBuildChatPage`, the same probe the preset's own door uses).
 */
export function startKindOf(pathname: string | undefined): StartKind | null {
  return isBuildChatPage(pathname ?? '') ? 'build' : null
}

/** The strings a kind declares; null for no kind. */
export function startCopyOf(kind: StartKind | null): StartCopy | null {
  return kind === null ? null : START_COPY[kind]
}
