/**
 * x402 Payment Integration Types
 */

import type { SettleResponse } from "@x402/core/types";

/** CAIP-2 network identifier (e.g., "eip155:8453" for Base mainnet) */
export type Network = `${string}:${string}`;

/** Human-readable price: "$0.10", "0.50", or atomic units { amount, asset } */
export type Price =
	| string
	| number
	| { amount: string; asset: string; extra?: Record<string, unknown> };

/**
 * Configuration for the x402 Astro integration.
 *
 * @example
 * ```ts
 * import { x402 } from "@emdash-cms/x402";
 *
 * export default defineConfig({
 *   integrations: [
 *     x402({
 *       payTo: "0xYourWallet",
 *       network: "eip155:8453",
 *       defaultPrice: "$0.01",
 *       botOnly: true,
 *     }),
 *   ],
 * });
 * ```
 */
export interface X402Config {
	/** Destination wallet address for payments */
	payTo: string;
	/** CAIP-2 network identifier */
	network: Network;
	/** Default price for content (can be overridden per-page) */
	defaultPrice?: Price;
	/** Facilitator URL (defaults to x402.org testnet facilitator) */
	facilitatorUrl?: string;
	/** Payment scheme (defaults to "exact") */
	scheme?: string;
	/** Maximum timeout for payment signatures in seconds (defaults to 60) */
	maxTimeoutSeconds?: number;
	/** Enable EVM chain support (defaults to true) */
	evm?: boolean;
	/** Enable Solana chain support (defaults to false) */
	svm?: boolean;
	/**
	 * Only enforce payment for bots/agents, not humans.
	 * Uses Cloudflare Bot Management score from request.cf.botManagement.score.
	 * Requires Cloudflare deployment with Bot Management enabled.
	 * When true, requests with a bot score >= botScoreThreshold are treated as
	 * human and enforcement is skipped.
	 */
	botOnly?: boolean;
	/**
	 * Bot score threshold. Requests with a score below this are treated as bots.
	 * Only used when botOnly is true. Defaults to 30.
	 * Score range: 1 (almost certainly bot) to 99 (almost certainly human).
	 */
	botScoreThreshold?: number;
}

/**
 * Options passed to enforce() to override defaults for a specific page.
 */
export interface EnforceOptions {
	/** Override the price for this specific request */
	price?: Price;
	/** Override the destination wallet */
	payTo?: string;
	/** Override the network */
	network?: Network;
	/** Override the payment scheme */
	scheme?: string;
	/** Resource description for the payment prompt */
	description?: string;
	/** MIME type hint for the resource */
	mimeType?: string;
}

/**
 * Result of a successful payment enforcement check.
 * Returned when the request should proceed (either paid or skipped).
 */
export interface EnforceResult {
	/** Whether payment was required and verified */
	paid: boolean;
	/** Whether enforcement was skipped (e.g., human in botOnly mode) */
	skipped: boolean;
	/** The payer's wallet address (if paid) */
	payer?: string;
	/** Settlement response (if payment was settled) */
	settlement?: SettleResponse;
	/** Headers to add to the response (e.g., PAYMENT-RESPONSE) */
	responseHeaders: Record<string, string>;
}

/**
 * The x402 enforcement interface available on Astro.locals.x402.
 */
export interface X402Enforcer {
	/**
	 * Check if the current request includes valid payment.
	 * If not paid, returns a 402 Response that should be returned directly.
	 * If paid (or skipped in botOnly mode), returns an EnforceResult.
	 *
	 * @param request - The incoming Request object
	 * @param options - Optional overrides for this specific enforcement
	 * @returns A 402 Response (return it) or an EnforceResult (proceed with page render)
	 *
	 * @example
	 * ```astro
	 * ---
	 * const { x402 } = Astro.locals;
	 *
	 * const result = await x402.enforce(Astro.request, { price: "$0.01" });
	 * if (result instanceof Response) return result;
	 *
	 * x402.applyHeaders(result, Astro.response);
	 * ---
	 * ```
	 */
	enforce(request: Request, options?: EnforceOptions): Promise<Response | EnforceResult>;

	/**
	 * Apply x402 response headers (e.g., PAYMENT-RESPONSE) to the Astro response.
	 * Call this after a successful enforce() to include settlement proof in the response.
	 */
	applyHeaders(result: EnforceResult, response: { headers: Headers }): void;

	/**
	 * Check if a request has a payment signature without verifying it.
	 * Useful for conditional rendering without enforcement.
	 */
	hasPayment(request: Request): boolean;
}
