/**
 * Turnstile verification helper.
 *
 * Verifies a Turnstile token server-side via the Cloudflare API.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
	success: boolean;
	errorCodes: string[];
}

/**
 * Verify a Turnstile response token.
 *
 * @param token - The `cf-turnstile-response` token from the client
 * @param secretKey - The Turnstile secret key
 * @param httpFetch - The capability-gated fetch function from ctx.http
 * @param remoteIp - Optional client IP for additional verification
 */
export async function verifyTurnstile(
	token: string,
	secretKey: string,
	httpFetch: (url: string, init?: RequestInit) => Promise<Response>,
	remoteIp?: string | null,
): Promise<TurnstileResult> {
	const body: Record<string, string> = {
		secret: secretKey,
		response: token,
	};
	if (remoteIp) {
		body.remoteip = remoteIp;
	}

	const res = await httpFetch(VERIFY_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const data = (await res.json()) as {
		success: boolean;
		"error-codes"?: string[];
	};

	return {
		success: data.success,
		errorCodes: data["error-codes"] ?? [],
	};
}
