/**
 * Cloudflare Access Auth - RUNTIME ENTRY
 *
 * This module is loaded at runtime when authenticating requests.
 * It exports the `authenticate` function required by the auth provider interface.
 *
 * For config-time usage, import { access } from "@emdash-cms/cloudflare" instead.
 */

export { authenticate } from "./cloudflare-access.js";
export type {
	AccessConfig,
	AccessJwtPayload,
	AccessGroup,
	AccessIdentity,
} from "./cloudflare-access.js";
