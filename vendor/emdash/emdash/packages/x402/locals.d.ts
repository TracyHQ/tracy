import type { X402Enforcer } from "./src/types.js";

declare global {
	namespace App {
		interface Locals {
			x402: X402Enforcer;
		}
	}
}

export {};
