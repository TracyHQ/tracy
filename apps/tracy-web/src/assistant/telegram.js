/**
 * The few Telegram Bot API calls the Customer Service handoff needs, and nothing else.
 *
 * 🔒 THE TOKEN IS IN EVERY URL (`/bot<token>/<method>`), so no URL and no raw error from fetch is
 * ever logged or returned: a caller gets `{ code, status, retryAfter }` and nothing more.
 *
 * Messages are sent as plain text (no `parse_mode`): a customer's words and a site name are data,
 * and Markdown or HTML in them must not turn into formatting, links or a refused message.
 */

/** What one sendMessage may hold (Telegram's limit is 4096; the margin keeps a label and a cut). */
export const TEXT_LIMIT = 3500
/** Long enough for Telegram's slow days, short enough that a stuck call frees the outbox. */
const CALL_TIMEOUT_MS = 20_000
/** A photo larger than this is not fetched; a panel needs a picture, not a print master. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024

/** @param {string} code @param {object} [extra] */
function coded(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra })
}

/**
 * Cut text into pieces of at most `limit` UTF-16 units, never splitting a surrogate pair, and
 * preferring a line break.
 * @param {string} text @param {number} [limit]
 */
export function splitText(text, limit = TEXT_LIMIT) {
  const pieces = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut < limit / 2) cut = limit
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
    pieces.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n/, '')
  }
  if (rest !== '') pieces.push(rest)
  return pieces
}

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, base?: string }} deps - `base` exists for
 *   the tests' fake server; every caller in the app leaves it at Telegram's own address.
 */
export function telegramApi({ token, fetchImpl = fetch, base = 'https://api.telegram.org' }) {
  /**
   * @param {string} method
   * @param {object} params
   * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
   */
  async function call(method, params, { signal, timeoutMs = CALL_TIMEOUT_MS } = {}) {
    const timeout = AbortSignal.timeout(timeoutMs)
    let res
    try {
      res = await fetchImpl(`${base}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout
      })
    } catch {
      throw coded(signal?.aborted ? 'CANCELLED' : 'UNREACHABLE')
    }
    let body = null
    try {
      body = await res.json()
    } catch {
      // A proxy's HTML error page; the status says enough.
    }
    if (res.ok && body?.ok === true) return body.result
    const retryAfter = Number(body?.parameters?.retry_after) || null
    const code =
      res.status === 429 ? 'RATE_LIMITED' : res.status === 401 || res.status === 403 ? 'FORBIDDEN' : 'FAILED'
    throw coded(code, {
      status: res.status,
      retryAfter,
      description: typeof body?.description === 'string' ? body.description.slice(0, 200) : null
    })
  }

  return {
    call,
    /** @param {string} chatId @param {string} name */
    createTopic: (chatId, name) => call('createForumTopic', { chat_id: chatId, name: name.slice(0, 128) }),
    /** @param {string} chatId @param {number} topicId @param {string} text */
    sendText: (chatId, topicId, text) =>
      call('sendMessage', {
        chat_id: chatId,
        message_thread_id: topicId,
        text,
        link_preview_options: { is_disabled: true }
      }),
    /** @param {string} chatId @param {number} topicId */
    closeTopic: (chatId, topicId) => call('closeForumTopic', { chat_id: chatId, message_thread_id: topicId }),
    /** @param {string} chatId @param {number} topicId */
    reopenTopic: (chatId, topicId) =>
      call('reopenForumTopic', { chat_id: chatId, message_thread_id: topicId }),
    /** @param {{ offset: number, timeout: number, signal?: AbortSignal }} q */
    getUpdates: ({ offset, timeout, signal }) =>
      call(
        'getUpdates',
        { offset, timeout, allowed_updates: ['message'] },
        { signal, timeoutMs: (timeout + 10) * 1000 }
      ),
    /**
     * The bytes of a file a staff member sent.
     * @param {string} fileId
     * @returns {Promise<{ bytes: Uint8Array, size: number }>}
     */
    async download(fileId) {
      const file = await call('getFile', { file_id: fileId })
      if (typeof file?.file_path !== 'string') throw coded('FAILED')
      if (Number(file.file_size) > PHOTO_MAX_BYTES) throw coded('TOO_LARGE')
      let res
      try {
        res = await fetchImpl(`${base}/file/bot${token}/${file.file_path}`, {
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        })
      } catch {
        throw coded('UNREACHABLE')
      }
      if (!res.ok) throw coded('FAILED', { status: res.status })
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > PHOTO_MAX_BYTES) throw coded('TOO_LARGE')
      return { bytes, size: bytes.byteLength }
    }
  }
}
