/**
 * x402 Enforcer Tests
 *
 * Tests the x402 payment enforcement logic:
 * - createEnforcer() creates a valid enforcer
 * - enforce() returns 402 when no payment header is present
 * - enforce() verifies and settles valid payments
 * - enforce() returns 402 for invalid payments
 * - hasPayment() checks for payment headers
 * - applyHeaders() sets response headers
 * - botOnly mode skips enforcement for humans
 * - Price normalization ($ prefix stripping)
 * - Error when no price is configured
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { X402Config, X402Enforcer } from "../src/types.js";

// Mock instances
const mockBuildPaymentRequirements = vi.fn();
const mockCreatePaymentRequiredResponse = vi.fn();
const mockFindMatchingRequirements = vi.fn();
const mockVerifyPayment = vi.fn();
const mockSettlePayment = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);

const mockResourceServer = {
	buildPaymentRequirements: mockBuildPaymentRequirements,
	createPaymentRequiredResponse: mockCreatePaymentRequiredResponse,
	findMatchingRequirements: mockFindMatchingRequirements,
	verifyPayment: mockVerifyPayment,
	settlePayment: mockSettlePayment,
	initialize: mockInitialize,
	register: vi.fn().mockReturnThis(),
};

const mockEncodePaymentRequiredHeader = vi.fn().mockReturnValue("encoded-payment-required");
const mockDecodePaymentSignatureHeader = vi.fn();
const mockEncodePaymentResponseHeader = vi.fn().mockReturnValue("encoded-payment-response");

vi.mock("@x402/core/server", () => ({
	HTTPFacilitatorClient: vi.fn(),
	x402ResourceServer: vi.fn().mockImplementation(function () {
		return mockResourceServer;
	}),
}));

vi.mock("@x402/core/http", () => ({
	encodePaymentRequiredHeader: (...args: unknown[]) => mockEncodePaymentRequiredHeader(...args),
	decodePaymentSignatureHeader: (...args: unknown[]) => mockDecodePaymentSignatureHeader(...args),
	encodePaymentResponseHeader: (...args: unknown[]) => mockEncodePaymentResponseHeader(...args),
}));

vi.mock("@x402/evm/exact/server", () => ({
	ExactEvmScheme: vi.fn(),
}));

const defaultConfig: X402Config = {
	payTo: "0xTestWallet",
	network: "eip155:8453",
	defaultPrice: "$0.01",
	facilitatorUrl: "https://test-facilitator.example.com",
};

function makeRequest(
	url: string,
	headers?: Record<string, string>,
	cf?: { botManagement?: { score?: number } },
): Request {
	const req = new Request(url, { headers });
	if (cf) {
		(req as unknown as { cf: typeof cf }).cf = cf;
	}
	return req;
}

/** Re-import the enforcer module to reset the cached singleton */
async function freshEnforcer(config: X402Config): Promise<X402Enforcer> {
	const mod = await import("../src/enforcer.js");
	return mod.createEnforcer(config);
}

describe("createEnforcer()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockBuildPaymentRequirements.mockReset();
		mockCreatePaymentRequiredResponse.mockReset();
		mockFindMatchingRequirements.mockReset();
		mockVerifyPayment.mockReset();
		mockSettlePayment.mockReset();
		mockInitialize.mockResolvedValue(undefined);
	});

	describe("enforce()", () => {
		it("returns 402 when no payment header is present", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article");

			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			const mockPaymentRequired = {
				x402Version: 2,
				accepts: mockRequirements,
				resource: { url: "/premium-article" },
			};

			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockCreatePaymentRequiredResponse.mockResolvedValue(mockPaymentRequired);

			const result = await enforcer.enforce(request);

			expect(result).toBeInstanceOf(Response);
			const response = result as Response;
			expect(response.status).toBe(402);
			expect(response.headers.get("PAYMENT-REQUIRED")).toBe("encoded-payment-required");
			expect(response.headers.get("Content-Type")).toBe("application/json");

			const body = await response.json();
			expect(body.x402Version).toBe(2);
		});

		it("returns EnforceResult when payment is valid", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article", {
				"payment-signature": "valid-payment-sig",
			});

			const mockPayload = { x402Version: 2, payload: {} };
			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			const mockMatchingReqs = { scheme: "exact", network: "eip155:8453" };

			mockDecodePaymentSignatureHeader.mockReturnValue(mockPayload);
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockFindMatchingRequirements.mockReturnValue(mockMatchingReqs);
			mockVerifyPayment.mockResolvedValue({
				isValid: true,
				payer: "0xPayerWallet",
			});
			mockSettlePayment.mockResolvedValue({
				success: true,
				transaction: "0xTxHash",
				network: "eip155:8453",
				payer: "0xPayerWallet",
			});

			const result = await enforcer.enforce(request);

			expect(result).not.toBeInstanceOf(Response);
			const enforceResult = result as {
				paid: boolean;
				skipped: boolean;
				payer?: string;
				responseHeaders: Record<string, string>;
			};
			expect(enforceResult.paid).toBe(true);
			expect(enforceResult.skipped).toBe(false);
			expect(enforceResult.payer).toBe("0xPayerWallet");
			expect(enforceResult.responseHeaders["PAYMENT-RESPONSE"]).toBe("encoded-payment-response");
		});

		it("returns 402 when payment verification fails", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article", {
				"payment-signature": "invalid-payment-sig",
			});

			const mockPayload = { x402Version: 2, payload: {} };
			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			const mockMatchingReqs = { scheme: "exact", network: "eip155:8453" };
			const mockPaymentRequired = {
				x402Version: 2,
				error: "insufficient_balance",
				accepts: mockRequirements,
			};

			mockDecodePaymentSignatureHeader.mockReturnValue(mockPayload);
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockFindMatchingRequirements.mockReturnValue(mockMatchingReqs);
			mockVerifyPayment.mockResolvedValue({
				isValid: false,
				invalidReason: "insufficient_balance",
			});
			mockCreatePaymentRequiredResponse.mockResolvedValue(mockPaymentRequired);

			const result = await enforcer.enforce(request);

			expect(result).toBeInstanceOf(Response);
			expect((result as Response).status).toBe(402);
		});

		it("returns 402 when payment doesn't match requirements", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article", {
				"payment-signature": "mismatched-payment-sig",
			});

			const mockPayload = { x402Version: 2, payload: {} };
			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			const mockPaymentRequired = {
				x402Version: 2,
				error: "Payment does not match accepted requirements",
				accepts: mockRequirements,
			};

			mockDecodePaymentSignatureHeader.mockReturnValue(mockPayload);
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockFindMatchingRequirements.mockReturnValue(undefined);
			mockCreatePaymentRequiredResponse.mockResolvedValue(mockPaymentRequired);

			const result = await enforcer.enforce(request);

			expect(result).toBeInstanceOf(Response);
			expect((result as Response).status).toBe(402);
		});

		it("throws when no price is configured", async () => {
			const enforcer = await freshEnforcer({
				payTo: "0xTestWallet",
				network: "eip155:8453",
			});
			const request = makeRequest("https://example.com/premium-article");

			await expect(enforcer.enforce(request)).rejects.toThrow("No price specified");
		});

		it("allows overriding price per-request", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article");

			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockCreatePaymentRequiredResponse.mockResolvedValue({
				x402Version: 2,
				accepts: mockRequirements,
			});

			await enforcer.enforce(request, { price: "$0.50" });

			expect(mockBuildPaymentRequirements).toHaveBeenCalledWith(
				expect.objectContaining({ price: "0.50" }),
			);
		});

		it("allows overriding payTo per-request", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article");

			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockCreatePaymentRequiredResponse.mockResolvedValue({
				x402Version: 2,
				accepts: mockRequirements,
			});

			await enforcer.enforce(request, { payTo: "0xOverrideWallet" });

			expect(mockBuildPaymentRequirements).toHaveBeenCalledWith(
				expect.objectContaining({ payTo: "0xOverrideWallet" }),
			);
		});

		it("reads PAYMENT-SIGNATURE header (case-insensitive)", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/premium-article", {
				"PAYMENT-SIGNATURE": "valid-payment-sig",
			});

			const mockPayload = { x402Version: 2, payload: {} };
			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			const mockMatchingReqs = { scheme: "exact", network: "eip155:8453" };

			mockDecodePaymentSignatureHeader.mockReturnValue(mockPayload);
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockFindMatchingRequirements.mockReturnValue(mockMatchingReqs);
			mockVerifyPayment.mockResolvedValue({ isValid: true, payer: "0xPayer" });
			mockSettlePayment.mockResolvedValue({
				success: true,
				transaction: "0xTx",
				network: "eip155:8453",
			});

			const result = await enforcer.enforce(request);
			expect(result).not.toBeInstanceOf(Response);
		});
	});

	describe("botOnly mode", () => {
		it("skips enforcement for humans (high bot score)", async () => {
			const enforcer = await freshEnforcer({ ...defaultConfig, botOnly: true });
			const request = makeRequest(
				"https://example.com/article",
				{},
				{ botManagement: { score: 90 } },
			);

			const result = await enforcer.enforce(request);

			expect(result).not.toBeInstanceOf(Response);
			const enforceResult = result as { paid: boolean; skipped: boolean };
			expect(enforceResult.paid).toBe(false);
			expect(enforceResult.skipped).toBe(true);
		});

		it("enforces for bots (low bot score)", async () => {
			const enforcer = await freshEnforcer({ ...defaultConfig, botOnly: true });
			const request = makeRequest(
				"https://example.com/article",
				{},
				{ botManagement: { score: 5 } },
			);

			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockCreatePaymentRequiredResponse.mockResolvedValue({
				x402Version: 2,
				accepts: mockRequirements,
			});

			const result = await enforcer.enforce(request);

			expect(result).toBeInstanceOf(Response);
			expect((result as Response).status).toBe(402);
		});

		it("treats missing cf data as human (skips enforcement)", async () => {
			const enforcer = await freshEnforcer({ ...defaultConfig, botOnly: true });
			const request = makeRequest("https://example.com/article");

			const result = await enforcer.enforce(request);

			expect(result).not.toBeInstanceOf(Response);
			const enforceResult = result as { skipped: boolean };
			expect(enforceResult.skipped).toBe(true);
		});

		it("respects custom botScoreThreshold", async () => {
			const enforcer = await freshEnforcer({
				...defaultConfig,
				botOnly: true,
				botScoreThreshold: 50,
			});
			// Score 40 < threshold 50 -> bot -> enforce
			const request = makeRequest(
				"https://example.com/article",
				{},
				{ botManagement: { score: 40 } },
			);

			const mockRequirements = [{ scheme: "exact", network: "eip155:8453" }];
			mockBuildPaymentRequirements.mockResolvedValue(mockRequirements);
			mockCreatePaymentRequiredResponse.mockResolvedValue({
				x402Version: 2,
				accepts: mockRequirements,
			});

			const result = await enforcer.enforce(request);
			expect(result).toBeInstanceOf(Response);
		});
	});

	describe("applyHeaders()", () => {
		it("sets response headers from EnforceResult", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const mockResponse = { headers: new Headers() };

			enforcer.applyHeaders(
				{
					paid: true,
					skipped: false,
					responseHeaders: {
						"PAYMENT-RESPONSE": "encoded-response",
						"X-Custom": "value",
					},
				},
				mockResponse,
			);

			expect(mockResponse.headers.get("PAYMENT-RESPONSE")).toBe("encoded-response");
			expect(mockResponse.headers.get("X-Custom")).toBe("value");
		});

		it("is a no-op when there are no response headers", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const mockResponse = { headers: new Headers() };

			enforcer.applyHeaders({ paid: false, skipped: true, responseHeaders: {} }, mockResponse);

			expect([...mockResponse.headers.entries()]).toHaveLength(0);
		});
	});

	describe("hasPayment()", () => {
		it("returns true when payment-signature header is present", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/article", {
				"payment-signature": "some-sig",
			});
			expect(enforcer.hasPayment(request)).toBe(true);
		});

		it("returns true when PAYMENT-SIGNATURE header is present (uppercase)", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/article", {
				"PAYMENT-SIGNATURE": "some-sig",
			});
			expect(enforcer.hasPayment(request)).toBe(true);
		});

		it("returns false when no payment header is present", async () => {
			const enforcer = await freshEnforcer(defaultConfig);
			const request = makeRequest("https://example.com/article");
			expect(enforcer.hasPayment(request)).toBe(false);
		});
	});
});
