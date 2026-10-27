import type { Block } from "@emdash-cms/blocks";

interface BlockCatalogEntry {
	type: Block["type"];
	label: string;
	description: string;
	create: () => Block;
}

let counter = 0;
function nextId(prefix: string): string {
	return `${prefix}_${++counter}`;
}

export const blockCatalog: BlockCatalogEntry[] = [
	{
		type: "header",
		label: "Header",
		description: "Page or section title",
		create: () => ({
			type: "header",
			text: "New Header",
		}),
	},
	{
		type: "section",
		label: "Section",
		description: "Text paragraph with optional accessory",
		create: () => ({
			type: "section",
			text: "Section text goes here. You can add an accessory element like a button.",
		}),
	},
	{
		type: "divider",
		label: "Divider",
		description: "Horizontal rule between blocks",
		create: () => ({
			type: "divider",
		}),
	},
	{
		type: "fields",
		label: "Fields",
		description: "Key-value pairs in a grid",
		create: () => ({
			type: "fields",
			fields: [
				{ label: "Label", value: "Value" },
				{ label: "Another", value: "Value" },
			],
		}),
	},
	{
		type: "stats",
		label: "Stats",
		description: "Metric cards with optional trends",
		create: () => ({
			type: "stats",
			items: [
				{ label: "Total", value: 100, trend: "up" as const },
				{ label: "Active", value: 42 },
			],
		}),
	},
	{
		type: "table",
		label: "Table",
		description: "Sortable data grid with pagination",
		create: () => ({
			type: "table",
			columns: [
				{ key: "name", label: "Name", sortable: true },
				{ key: "status", label: "Status", format: "badge" as const },
			],
			rows: [
				{ name: "Item 1", status: "active" },
				{ name: "Item 2", status: "draft" },
			],
			page_action_id: nextId("page"),
		}),
	},
	{
		type: "form",
		label: "Form",
		description: "Input fields with submit button",
		create: () => ({
			type: "form",
			fields: [
				{
					type: "text_input" as const,
					action_id: nextId("field"),
					label: "Text Field",
					placeholder: "Enter text...",
				},
			],
			submit: { label: "Submit", action_id: nextId("submit") },
		}),
	},
	{
		type: "actions",
		label: "Actions",
		description: "Row of buttons",
		create: () => ({
			type: "actions",
			elements: [
				{
					type: "button" as const,
					action_id: nextId("btn"),
					label: "Click Me",
					style: "primary" as const,
				},
			],
		}),
	},
	{
		type: "image",
		label: "Image",
		description: "Image with alt text and optional title",
		create: () => ({
			type: "image",
			url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&h=300&fit=crop",
			alt: "Placeholder image",
			title: "Image title",
		}),
	},
	{
		type: "context",
		label: "Context",
		description: "Muted supplementary text",
		create: () => ({
			type: "context",
			text: "Supplementary information goes here.",
		}),
	},
	{
		type: "banner",
		label: "Banner",
		description: "Info, warning, or error message",
		create: () => ({
			type: "banner" as const,
			title: "Notice",
			description: "This is an informational banner message.",
			variant: "default" as const,
		}),
	},
	{
		type: "columns",
		label: "Columns",
		description: "Multi-column layout",
		create: () => ({
			type: "columns",
			columns: [
				[{ type: "section" as const, text: "Left column content" }],
				[{ type: "section" as const, text: "Right column content" }],
			],
		}),
	},
	{
		type: "meter",
		label: "Meter",
		description: "Progress/quota meter bar",
		create: () => ({
			type: "meter" as const,
			label: "Storage used",
			value: 65,
			custom_value: "6.5 GB / 10 GB",
		}),
	},
	{
		type: "code",
		label: "Code",
		description: "Syntax-highlighted code block",
		create: () => ({
			type: "code" as const,
			code: 'const greeting = "Hello, World!";\nconsole.log(greeting);',
			language: "ts" as const,
		}),
	},
	{
		type: "chart",
		label: "Chart",
		description: "Line, bar, or pie chart (ECharts)",
		create: () => {
			const now = Date.now();
			const hour = 3_600_000;
			return {
				type: "chart" as const,
				config: {
					chart_type: "timeseries" as const,
					series: [
						{
							name: "Requests",
							data: Array.from({ length: 24 }, (_, i) => [
								now - (23 - i) * hour,
								Math.floor(200 + Math.random() * 300),
							]),
						},
						{
							name: "Errors",
							data: Array.from({ length: 24 }, (_, i) => [
								now - (23 - i) * hour,
								Math.floor(Math.random() * 20),
							]),
						},
					],
					x_axis_name: "Time",
					y_axis_name: "Count",
					gradient: true,
				},
			};
		},
	},
];
