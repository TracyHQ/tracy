/**
 * dsh's tool call chrome, taken out of the build chat only (#575). The owner of a build chat reads ONE progress block
 * per working step (the build chat mock, screen 2): the row of the step, its per link lines, then one done line. dsh
 * draws its own process chrome around those rows, and nothing in dsh lets a plugin turn that chrome off for one kind
 * of session (the process grouping is one definition per target, the work details mode is one host setting for every
 * chat, the running clock and the reasoning rows have no slot). So this is plain CSS, the last resort, and it reaches
 * build chat sessions only: dsh writes the session id on the chat body, and only the signed seat door mints an id
 * starting with session-build- (`isBuildChatSession` of `@tracy/core/build-chat`). No rule can reach another chat.
 *
 * What it does inside a build chat:
 * - the group header ("Calling tools", "Called tools") is not drawn, and the group body is always open and flat, so
 *   the build rows inside it show without a click, also once a finished turn folded its work away;
 * - the whole turn control ("Completed in", the duration) is not drawn: there is no fold left for it to open;
 * - reasoning rows ("Think") and the running clock ("Thinking for") are not drawn;
 * - a tool row that is neither a build row nor still running or failed is not drawn (a settled "Ask question" summary;
 *   the owner's answer stays as their own reply bubble). An error, a running row (a question still waiting) and a
 *   stop are always drawn, and so are the cards: they live in the turn tail and the composer, outside these rules.
 *
 * Its own style element, mounted only while the switch `chat-build` is on (`index.tsx`).
 */
const IN = '[data-conversation-session^="session-build-"]'

export const BUILD_SESSION_CHROME_CSS = `
${IN} [data-step-process] > :not([data-step-process-body]) { display: none; }
${IN} [data-step-process][hidden],
${IN} [data-step-process-body][hidden],
${IN} [data-turn-process-hidden][hidden] { content-visibility: visible; }
${IN} [data-step-process-body] { max-height: none; overflow: visible; mask-image: none; }
${IN} [data-chat-flow-kind="turn-process"] { display: none; }
${IN} [data-chat-group-part="reasoning"], ${IN} [data-variant="think"] { display: none; }
${IN} [data-chat-running] { display: none; }
${IN} [data-chat-flow-kind="tool-call"]:not(:has(.tv-bc-toolrow, [data-state="error"], [data-state="running"], [data-state="preparing"], [data-state="stopped"])) {
  display: none;
}
`
