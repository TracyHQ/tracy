import { describe, expect, it } from "vitest";

import { createEditable, createNoop } from "../../../src/visual-editing/editable.js";

describe("createEditable", () => {
	it("returns entry-level annotation when spread", () => {
		const edit = createEditable("posts", "my-post");
		expect({ ...edit }).toEqual({
			"data-emdash-ref": '{"collection":"posts","id":"my-post"}',
		});
	});

	it("includes status and hasDraft in entry-level annotation", () => {
		const edit = createEditable("posts", "my-post", {
			status: "published",
			hasDraft: true,
		});
		expect({ ...edit }).toEqual({
			"data-emdash-ref":
				'{"collection":"posts","id":"my-post","status":"published","hasDraft":true}',
		});
	});

	it("includes status/hasDraft in field-level annotations", () => {
		const edit = createEditable("posts", "my-post", {
			status: "published",
			hasDraft: true,
		});
		expect(edit.title).toEqual({
			"data-emdash-ref":
				'{"collection":"posts","id":"my-post","status":"published","hasDraft":true,"field":"title"}',
		});
	});

	it("returns field-level annotation for property access", () => {
		const edit = createEditable("posts", "my-post");
		expect(edit.title).toEqual({
			"data-emdash-ref": '{"collection":"posts","id":"my-post","field":"title"}',
		});
	});

	it("handles nested fields via bracket notation", () => {
		const edit = createEditable("posts", "my-post");
		expect(edit["hero.src"]).toEqual({
			"data-emdash-ref": '{"collection":"posts","id":"my-post","field":"hero.src"}',
		});
	});

	it("serializes to JSON correctly", () => {
		const edit = createEditable("posts", "my-post");
		expect(JSON.stringify({ edit })).toBe(
			'{"edit":{"data-emdash-ref":"{\\"collection\\":\\"posts\\",\\"id\\":\\"my-post\\"}"}}',
		);
	});
});

describe("createNoop", () => {
	it("returns empty object", () => {
		const edit = createNoop();
		expect({ ...edit }).toEqual({});
	});

	it("property access returns undefined", () => {
		const edit = createNoop();
		expect((edit as Record<string, unknown>).title).toBeUndefined();
	});
});
