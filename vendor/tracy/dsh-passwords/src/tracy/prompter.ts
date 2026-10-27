/**
 * Q11 — the `prompter` stamp: the gate writes who typed a prompt into `session/prompt`, so the seat
 * book names the person who typed, not whoever logged in last. Every account is stamped, the master
 * included (with no email), and whatever the client claimed is replaced. Pure: H2 parses the body,
 * calls {@link stampPrompter}, and forwards the re-serialised result.
 */

type Plain = Record<string, unknown>;

const plain = (value: unknown): Plain | null =>
  value === null || typeof value !== 'object' || Array.isArray(value) ? null : (value as Plain);

const PROMPT_PATH = /^\/api\/session[./]prompt$/;

/** Whether a request is a prompt the gate stamps (any authenticated account). */
export function isPromptRequest(method: string, gatePath: string): boolean {
  return method === 'POST' && PROMPT_PATH.test(gatePath);
}

/**
 * The object an endpoint reads its arguments from. On the wire dsh wraps a call as
 * `{ type: 'client-request', payload: { args } }`, and session commands take one named parameter
 * `request`; a stamp anywhere else is invisible to the command, and an extra key in `payload` or
 * `args` makes the Host refuse the call. A body that is not an envelope is its own argument object.
 * @returns that object, or null when there is none.
 */
export function requestArguments(body: unknown): Plain | null {
  const outer = plain(body);
  if (outer === null) return null;
  if (outer.type !== 'client-request') return outer;
  const payload = plain(outer.payload);
  const args = payload === null ? null : plain(payload.args);
  if (args === null) return null;
  return plain(args.request) ?? args;
}

/** The account the gate authenticated for this request. */
export interface PromptAuthor {
  username: string;
  /** The seat's proven address; null for the master and for visitors. */
  email: string | null;
}

/**
 * A copy of `body` with `prompter: { user, email }` written into its argument object, replacing
 * any value the client sent; null when the body has no argument object. `body` is not mutated.
 */
export function stampPrompter(body: unknown, author: PromptAuthor): unknown {
  const copy: unknown = structuredClone(body);
  const args = requestArguments(copy);
  if (args === null) return null;
  const email = typeof author.email === 'string' && author.email.trim() !== '' ? author.email.trim().toLowerCase() : null;
  args.prompter = { user: author.username, email };
  return copy;
}
