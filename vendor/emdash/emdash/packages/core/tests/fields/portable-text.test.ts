import { describe, it, expect } from "vitest";

import { portableText } from "../../src/fields/portable-text.js";

describe("portableText field", () => {
	it("should create field definition", () => {
		const field = portableText();

		expect(field.type).toBe("portableText");
		expect(field.schema).toBeDefined();
		expect(field.ui?.widget).toBe("portableText");
	});

	it("should accept valid Portable Text", () => {
		const field = portableText();
		const valid = [
			{
				_type: "block",
				_key: "abc123",
				style: "normal",
				children: [{ _type: "span", text: "Hello World" }],
			},
		];

		expect(() => field.schema.parse(valid)).not.toThrow();
	});

	it("should reject invalid Portable Text", () => {
		const field = portableText();

		expect(() => field.schema.parse("not an array")).toThrow();
		expect(() => field.schema.parse([{ missing: "_type" }])).toThrow();
	});

	it("should support required option", () => {
		const required = portableText({ required: true });
		const optional = portableText({ required: false });

		// Required should reject undefined
		expect(() => required.schema.parse(undefined)).toThrow();

		// Optional should accept undefined
		expect(() => optional.schema.parse(undefined)).not.toThrow();
	});
});
