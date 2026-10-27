/**
 * Node half. Hand-written, not a build output (only `lib/client.js` is built).
 *
 * Since 28/09/2026 it holds the conversation model to the deployment default: the door that picks
 * a model, and every agent request (`../src/host/model-policy.mjs`). Since 07/10/2026 the desktop
 * app's own dsh may put a conversation on the customer's connected plan instead
 * (`../src/host/session-models.mjs`).
 */
import { installModelPolicy } from '../src/host/model-policy.mjs'

/**
 * @param {import('../src/host/model-policy.mjs').HostContext} ctx
 * @param {unknown} [config] - the row's config; `customerRoutes` only on the desktop app's own dsh.
 */
export function apply(ctx, config) {
  installModelPolicy(ctx, config)
}
