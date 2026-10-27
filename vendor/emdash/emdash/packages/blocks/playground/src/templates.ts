import type { Block, ChartSeries } from "@emdash-cms/blocks";

export interface Template {
	name: string;
	description: string;
	blocks: Block[];
}

// ── Sample data generators ───────────────────────────────────────────────────

const HOUR = 3_600_000;

function generateTrafficSeries(): ChartSeries[] {
	const now = Date.now();
	return [
		{
			name: "Page Views",
			data: Array.from({ length: 24 }, (_, i) => [
				now - (23 - i) * HOUR,
				Math.floor(400 + Math.sin(i / 4) * 200 + Math.random() * 80),
			]),
			color: "#086FFF",
		},
		{
			name: "Unique Visitors",
			data: Array.from({ length: 24 }, (_, i) => [
				now - (23 - i) * HOUR,
				Math.floor(150 + Math.sin(i / 4) * 80 + Math.random() * 40),
			]),
			color: "#CF7EE9",
		},
	];
}

function generateErrorSeries(): ChartSeries[] {
	const now = Date.now();
	return [
		{
			name: "4xx",
			data: Array.from({ length: 12 }, (_, i) => [
				now - (11 - i) * HOUR * 2,
				Math.floor(Math.random() * 15),
			]),
			color: "#F8A054",
		},
		{
			name: "5xx",
			data: Array.from({ length: 12 }, (_, i) => [
				now - (11 - i) * HOUR * 2,
				Math.floor(Math.random() * 5),
			]),
			color: "#FC574A",
		},
	];
}

export const templates: Template[] = [
	{
		name: "Plugin Settings",
		description: "Form with conditional fields and text inputs",
		blocks: [
			{
				type: "header",
				text: "SEO Plugin Settings",
				block_id: "settings-header",
			},
			{
				type: "section",
				text: "Configure how your site appears in search results. Enable auto-generation to let the plugin create meta tags from your content.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "seo-settings",
				fields: [
					{
						type: "text_input",
						action_id: "site_title",
						label: "Site Title",
						placeholder: "My Awesome Site",
						initial_value: "EmDash CMS",
					},
					{
						type: "text_input",
						action_id: "meta_description",
						label: "Default Meta Description",
						placeholder: "A brief description of your site...",
						multiline: true,
					},
					{
						type: "toggle",
						action_id: "auto_generate",
						label: "Auto-generate meta tags",
						description: "Generate meta descriptions from content when not manually set",
						initial_value: true,
					},
					{
						type: "number_input",
						action_id: "max_length",
						label: "Max description length",
						initial_value: 160,
						min: 50,
						max: 300,
						condition: { field: "auto_generate", eq: true },
					},
					{
						type: "select",
						action_id: "ai_model",
						label: "AI Model",
						options: [
							{ label: "GPT-4o Mini", value: "gpt-4o-mini" },
							{ label: "Claude Haiku", value: "claude-haiku" },
							{ label: "None (extractive)", value: "none" },
						],
						initial_value: "none",
						condition: { field: "auto_generate", eq: true },
					},
					{
						type: "radio",
						action_id: "default_status",
						label: "Default publish status",
						options: [
							{ label: "Draft", value: "draft" },
							{ label: "Published", value: "published" },
							{ label: "Scheduled", value: "scheduled" },
						],
						initial_value: "draft",
					},
					{
						type: "checkbox",
						action_id: "collections",
						label: "Apply to collections",
						options: [
							{ label: "Posts", value: "posts" },
							{ label: "Pages", value: "pages" },
							{ label: "Products", value: "products" },
						],
						initial_value: ["posts", "pages"],
					},
					{
						type: "secret_input",
						action_id: "api_key",
						label: "API Key",
						placeholder: "sk-...",
						condition: { field: "ai_model", neq: "none" },
					},
					{
						type: "date_input",
						action_id: "embargo_date",
						label: "Embargo date",
						placeholder: "Select a date",
					},
					{
						type: "combobox",
						action_id: "timezone",
						label: "Timezone",
						placeholder: "Search timezones...",
						options: [
							{ label: "UTC", value: "UTC" },
							{ label: "US/Eastern", value: "US/Eastern" },
							{ label: "US/Central", value: "US/Central" },
							{ label: "US/Mountain", value: "US/Mountain" },
							{ label: "US/Pacific", value: "US/Pacific" },
							{ label: "Europe/London", value: "Europe/London" },
							{ label: "Europe/Paris", value: "Europe/Paris" },
							{ label: "Europe/Berlin", value: "Europe/Berlin" },
							{ label: "Asia/Tokyo", value: "Asia/Tokyo" },
							{ label: "Asia/Shanghai", value: "Asia/Shanghai" },
							{ label: "Australia/Sydney", value: "Australia/Sydney" },
						],
						initial_value: "UTC",
					},
				],
				submit: { label: "Save Settings", action_id: "save_seo_settings" },
			},
		],
	},
	{
		name: "Analytics Dashboard",
		description: "Charts, stats, and data table",
		blocks: [
			{
				type: "header",
				text: "Content Analytics",
			},
			{
				type: "stats",
				items: [
					{ label: "Total Views", value: "12,847", trend: "up", description: "+14% vs last week" },
					{
						label: "Unique Visitors",
						value: "3,291",
						trend: "up",
						description: "+8% vs last week",
					},
					{
						label: "Bounce Rate",
						value: "34.2%",
						trend: "down",
						description: "-2.1% vs last week",
					},
					{ label: "Avg. Time on Page", value: "2m 48s", trend: "neutral" },
				],
			},
			{
				type: "chart",
				block_id: "traffic-chart",
				config: {
					chart_type: "timeseries",
					series: generateTrafficSeries(),
					x_axis_name: "Time",
					y_axis_name: "Requests",
					gradient: true,
				},
			},
			{
				type: "columns",
				columns: [
					[
						{
							type: "chart",
							block_id: "content-breakdown",
							config: {
								chart_type: "custom",
								options: {
									series: [
										{
											type: "pie",
											radius: ["40%", "70%"],
											data: [
												{ value: 42, name: "Published" },
												{ value: 7, name: "Draft" },
												{ value: 3, name: "Scheduled" },
												{ value: 2, name: "Archived" },
											],
										},
									],
								},
								height: 250,
							},
						},
					],
					[
						{
							type: "chart",
							block_id: "errors-chart",
							config: {
								chart_type: "timeseries",
								series: generateErrorSeries(),
								y_axis_name: "Errors",
								style: "bar",
								height: 250,
							},
						},
					],
				],
			},
			{ type: "divider" },
			{
				type: "table",
				block_id: "content-table",
				columns: [
					{ key: "title", label: "Title", sortable: true },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "views", label: "Views", format: "number", sortable: true },
					{ key: "updated", label: "Last Updated", format: "relative_time", sortable: true },
				],
				rows: [
					{
						title: "Getting Started with EmDash",
						status: "published",
						views: 4521,
						updated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
					},
					{
						title: "Advanced Content Modeling",
						status: "published",
						views: 2103,
						updated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
					},
					{
						title: "Plugin Development Guide",
						status: "draft",
						views: 891,
						updated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
					},
					{
						title: "Deployment to Cloudflare",
						status: "published",
						views: 3187,
						updated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
					},
					{
						title: "Media Management",
						status: "scheduled",
						views: 0,
						updated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
					},
				],
				page_action_id: "load_more_content",
				next_cursor: "eyJpZCI6IjUifQ",
			},
		],
	},
	{
		name: "Dashboard Widget",
		description: "Compact stats with context line",
		blocks: [
			{
				type: "stats",
				items: [
					{ label: "Published", value: 42 },
					{ label: "Drafts", value: 7 },
					{ label: "Scheduled", value: 3 },
				],
			},
			{
				type: "context",
				text: "Last published 2 hours ago \u2022 Next scheduled in 4 hours",
			},
		],
	},
	{
		name: "Admin Page",
		description: "Two-column layout with sidebar and main content",
		blocks: [
			{
				type: "header",
				text: "Site Configuration",
			},
			{
				type: "columns",
				columns: [
					[
						{
							type: "section",
							text: "General settings for your site. These values are used across all pages unless overridden at the content level.",
						},
						{
							type: "form",
							block_id: "general-settings",
							fields: [
								{
									type: "text_input",
									action_id: "site_name",
									label: "Site Name",
									initial_value: "My Site",
								},
								{
									type: "text_input",
									action_id: "tagline",
									label: "Tagline",
									placeholder: "A short description of your site",
								},
								{
									type: "select",
									action_id: "timezone",
									label: "Timezone",
									options: [
										{ label: "UTC", value: "UTC" },
										{ label: "US/Eastern", value: "US/Eastern" },
										{ label: "US/Pacific", value: "US/Pacific" },
										{ label: "Europe/London", value: "Europe/London" },
									],
									initial_value: "UTC",
								},
							],
							submit: { label: "Save", action_id: "save_general" },
						},
					],
					[
						{
							type: "fields",
							fields: [
								{ label: "Plan", value: "Pro" },
								{ label: "Storage", value: "2.4 GB / 10 GB" },
								{ label: "API Calls", value: "12,847 / 100,000" },
								{ label: "Next Billing", value: "Mar 15, 2026" },
							],
						},
						{ type: "divider" },
						{
							type: "actions",
							elements: [
								{
									type: "button",
									action_id: "export_data",
									label: "Export Data",
									style: "secondary",
								},
								{
									type: "button",
									action_id: "danger_zone",
									label: "Delete Site",
									style: "danger",
									confirm: {
										title: "Delete Site?",
										text: "This action cannot be undone. All content and media will be permanently deleted.",
										confirm: "Delete Everything",
										deny: "Cancel",
										style: "danger",
									},
								},
							],
						},
					],
				],
			},
		],
	},
	{
		name: "All Blocks",
		description: "Showcase of every block type",
		blocks: [
			{ type: "header", text: "Block Kit Showcase" },
			{
				type: "section",
				text: "This template demonstrates every block type available in the Block Kit. Each block maps to a Kumo component.",
				accessory: {
					type: "button",
					action_id: "learn_more",
					label: "Learn More",
					style: "primary",
				},
			},
			{
				type: "banner",
				title: "Information",
				description: "This is a default informational banner.",
				variant: "default",
			},
			{
				type: "banner",
				title: "Warning",
				description: "Something requires your attention.",
				variant: "alert",
			},
			{
				type: "banner",
				title: "Error",
				description: "An error occurred while processing your request.",
				variant: "error",
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{ label: "Version", value: "0.1.0" },
					{ label: "Blocks", value: "15 types" },
					{ label: "Elements", value: "10 types" },
					{ label: "License", value: "MIT" },
				],
			},
			{
				type: "stats",
				items: [
					{ label: "Components", value: 26, trend: "up" },
					{ label: "Tests", value: 60, trend: "up" },
					{ label: "Bundle Size", value: "6.7 KB", description: "gzipped" },
				],
			},
			{
				type: "meter",
				label: "Storage",
				value: 65,
				custom_value: "6.5 GB / 10 GB",
			},
			{ type: "divider" },
			{
				type: "chart",
				block_id: "demo-timeseries",
				config: {
					chart_type: "timeseries",
					series: generateTrafficSeries(),
					x_axis_name: "Time",
					y_axis_name: "Views",
					gradient: true,
				},
			},
			{
				type: "chart",
				block_id: "demo-pie",
				config: {
					chart_type: "custom",
					options: {
						series: [
							{
								type: "pie",
								radius: ["40%", "70%"],
								data: [
									{ value: 335, name: "Published" },
									{ value: 234, name: "Draft" },
									{ value: 120, name: "Scheduled" },
									{ value: 48, name: "Archived" },
								],
							},
						],
					},
					height: 280,
				},
			},
			{ type: "divider" },
			{
				type: "image",
				url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=400&fit=crop",
				alt: "Abstract colorful gradient",
				title: "Image blocks support URLs, alt text, and optional titles",
			},
			{
				type: "code",
				code: 'import { blocks } from "@emdash-cms/blocks";\n\nconst page = [\n\tblocks.header("Hello"),\n\tblocks.section("Welcome to EmDash."),\n];',
				language: "ts",
			},
			{ type: "divider" },
			{
				type: "table",
				block_id: "demo-table",
				columns: [
					{ key: "block", label: "Block Type" },
					{ key: "purpose", label: "Purpose" },
					{ key: "status", label: "Status", format: "badge" },
				],
				rows: [
					{ block: "header", purpose: "Page or section title", status: "stable" },
					{ block: "section", purpose: "Text with optional accessory", status: "stable" },
					{ block: "form", purpose: "Input fields with submit", status: "stable" },
					{ block: "table", purpose: "Sortable data grid", status: "stable" },
					{ block: "chart", purpose: "Timeseries, bar, pie charts", status: "stable" },
					{ block: "columns", purpose: "Multi-column layout", status: "stable" },
				],
				page_action_id: "demo_page",
			},
			{ type: "divider" },
			{
				type: "actions",
				elements: [
					{ type: "button", action_id: "primary_action", label: "Primary", style: "primary" },
					{ type: "button", action_id: "secondary_action", label: "Secondary", style: "secondary" },
					{
						type: "button",
						action_id: "danger_action",
						label: "Danger",
						style: "danger",
						confirm: {
							title: "Are you sure?",
							text: "This is a destructive action demo.",
							confirm: "Yes, proceed",
							deny: "Cancel",
							style: "danger",
						},
					},
				],
			},
			{
				type: "context",
				text: "This is a context block \u2014 used for supplementary information, timestamps, or footnotes.",
			},
		],
	},
];
