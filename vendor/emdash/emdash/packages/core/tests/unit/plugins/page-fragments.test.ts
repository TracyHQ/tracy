/**
 * Page Fragments Tests
 *
 * Tests the fragment collector for:
 * - Filtering contributions by placement
 * - Deduplication by key and src
 * - HTML rendering of script and raw HTML fragments
 */

import { describe, it, expect } from "vitest";

import { resolveFragments, renderFragments } from "../../../src/page/fragments.js";
import type { PageFragmentContribution } from "../../../src/plugins/types.js";

describe("resolveFragments", () => {
	it("filters by placement", () => {
		const contributions: PageFragmentContribution[] = [
			{ kind: "html", placement: "head", html: "<link>" },
			{ kind: "html", placement: "body:end", html: "<div>footer</div>" },
			{ kind: "html", placement: "head", html: "<style></style>" },
		];

		const result = resolveFragments(contributions, "head");

		expect(result).toHaveLength(2);
		expect(result[0]!.kind).toBe("html");
		expect((result[0] as { html: string }).html).toBe("<link>");
		expect((result[1] as { html: string }).html).toBe("<style></style>");
	});

	it("dedupes by key + placement", () => {
		const contributions: PageFragmentContribution[] = [
			{ kind: "html", placement: "head", html: "<link first>", key: "my-styles" },
			{ kind: "html", placement: "head", html: "<link second>", key: "my-styles" },
		];

		const result = resolveFragments(contributions, "head");

		expect(result).toHaveLength(1);
		expect((result[0] as { html: string }).html).toBe("<link first>");
	});

	it("dedupes external scripts by src", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "external-script",
				placement: "body:end",
				src: "https://cdn.example.com/lib.js",
				async: true,
			},
			{
				kind: "external-script",
				placement: "body:end",
				src: "https://cdn.example.com/lib.js",
				defer: true,
			},
		];

		const result = resolveFragments(contributions, "body:end");

		expect(result).toHaveLength(1);
		expect((result[0] as { async?: boolean }).async).toBe(true);
	});

	it("allows different placements of same key", () => {
		const contributions: PageFragmentContribution[] = [
			{ kind: "html", placement: "head", html: "<meta>", key: "seo" },
			{ kind: "html", placement: "body:end", html: "<noscript>", key: "seo" },
		];

		const headResult = resolveFragments(contributions, "head");
		const bodyResult = resolveFragments(contributions, "body:end");

		expect(headResult).toHaveLength(1);
		expect(bodyResult).toHaveLength(1);
	});

	it("preserves order", () => {
		const contributions: PageFragmentContribution[] = [
			{ kind: "html", placement: "head", html: "<first>" },
			{ kind: "html", placement: "head", html: "<second>" },
			{ kind: "html", placement: "head", html: "<third>" },
		];

		const result = resolveFragments(contributions, "head");

		expect(result).toHaveLength(3);
		expect((result[0] as { html: string }).html).toBe("<first>");
		expect((result[1] as { html: string }).html).toBe("<second>");
		expect((result[2] as { html: string }).html).toBe("<third>");
	});
});

describe("renderFragments", () => {
	it("renders external script with async/defer", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "external-script",
				placement: "head",
				src: "https://cdn.example.com/analytics.js",
				async: true,
				defer: true,
			},
		];

		const html = renderFragments(contributions, "head");

		expect(html).toBe('<script src="https://cdn.example.com/analytics.js" async defer></script>');
	});

	it("renders external script with attributes", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "external-script",
				placement: "head",
				src: "https://cdn.example.com/widget.js",
				attributes: { "data-site-id": "abc123", crossorigin: "anonymous" },
			},
		];

		const html = renderFragments(contributions, "head");

		expect(html).toContain('src="https://cdn.example.com/widget.js"');
		expect(html).toContain('data-site-id="abc123"');
		expect(html).toContain('crossorigin="anonymous"');
		expect(html).toContain("</script>");
	});

	it("renders inline script", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "inline-script",
				placement: "body:end",
				code: "console.log('hello');",
			},
		];

		const html = renderFragments(contributions, "body:end");

		expect(html).toBe("<script>console.log('hello');</script>");
	});

	it("escapes </script> in inline script code", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "inline-script",
				placement: "head",
				code: 'var x = "</script><script>alert(1)</script>";',
			},
		];

		const html = renderFragments(contributions, "head");

		// The </ sequence should be escaped to <\/ to prevent tag breakout
		expect(html).not.toContain("</script><script>");
		expect(html).toContain("<\\/script>");
	});

	it("renders raw HTML", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "html",
				placement: "body:start",
				html: '<div id="overlay"></div>',
			},
		];

		const html = renderFragments(contributions, "body:start");

		expect(html).toBe('<div id="overlay"></div>');
	});

	it("escapes attribute names and values", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "external-script",
				placement: "head",
				src: "https://example.com/x.js",
				attributes: { 'data-"key': 'val<ue&"more' },
			},
		];

		const html = renderFragments(contributions, "head");

		expect(html).toContain("data-&quot;key");
		expect(html).toContain("val&lt;ue&amp;&quot;more");
		expect(html).not.toContain('data-"key');
	});

	it("strips event handler attributes", () => {
		const contributions: PageFragmentContribution[] = [
			{
				kind: "external-script",
				placement: "head",
				src: "https://example.com/x.js",
				attributes: {
					onload: "alert(1)",
					onerror: "alert(2)",
					"data-id": "safe",
					crossorigin: "anonymous",
				},
			},
		];

		const html = renderFragments(contributions, "head");

		expect(html).not.toContain("onload");
		expect(html).not.toContain("onerror");
		expect(html).toContain('data-id="safe"');
		expect(html).toContain('crossorigin="anonymous"');
	});

	it("returns empty string for no matching placement", () => {
		const contributions: PageFragmentContribution[] = [
			{ kind: "html", placement: "head", html: "<link>" },
		];

		const html = renderFragments(contributions, "body:end");

		expect(html).toBe("");
	});
});
