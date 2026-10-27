import type { CreateContentInput } from "../../src/database/repositories/types.js";

/**
 * Fixture for creating a post
 */
export function createPostFixture(overrides: Partial<CreateContentInput> = {}): CreateContentInput {
	return {
		type: "post",
		slug: "hello-world",
		data: {
			title: "Hello World",
			content: [
				{
					_type: "block",
					style: "normal",
					children: [
						{
							_type: "span",
							text: "This is a test post",
						},
					],
				},
			],
		},
		status: "draft",
		...overrides,
	};
}

/**
 * Fixture for creating a page
 */
export function createPageFixture(overrides: Partial<CreateContentInput> = {}): CreateContentInput {
	return {
		type: "page",
		slug: "about",
		data: {
			title: "About",
			content: [
				{
					_type: "block",
					style: "normal",
					children: [
						{
							_type: "span",
							text: "About page content",
						},
					],
				},
			],
		},
		status: "draft",
		...overrides,
	};
}
