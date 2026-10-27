#!/usr/bin/env node

/**
 * Screenshot template pages at desktop + mobile breakpoints, light + dark mode.
 *
 * Usage:
 *   node scripts/screenshot-templates.mjs <template> <url>
 *   node scripts/screenshot-templates.mjs blog http://localhost:4321
 *
 * Reads page definitions from templates/screenshots.json.
 * Outputs JPEG screenshots to assets/templates/<template>/<datetime>/
 * and copies the folder to assets/templates/<template>/latest/.
 */

import { readFileSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BREAKPOINTS = {
	desktop: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
};

const COLOR_SCHEMES = ["light", "dark"];
const JPEG_QUALITY = 80;

// JS to hide the EmDash toolbar (the visual editing toolbar injected in dev mode)
const HIDE_TOOLBAR_JS = `
	document.querySelector("[data-emdash-toolbar]")?.remove();
`;

function loadConfig() {
	const configPath = join(ROOT, "templates", "screenshots.json");
	return JSON.parse(readFileSync(configPath, "utf-8"));
}

const pad = (n) => String(n).padStart(2, "0");

function timestamp() {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function screenshotTemplate(browser, baseUrl, pages, outDir) {
	const files = [];
	let failures = 0;

	for (const [breakpointName, viewport] of Object.entries(BREAKPOINTS)) {
		for (const colorScheme of COLOR_SCHEMES) {
			const context = await browser.newContext({
				viewport,
				colorScheme,
				deviceScaleFactor: 2,
			});
			const page = await context.newPage();

			for (const [pageName, pagePath] of Object.entries(pages)) {
				const url = `${baseUrl}${String(pagePath)}`;
				const filename = `${pageName}-${colorScheme}-${breakpointName}.jpg`;
				const filepath = join(outDir, filename);

				process.stdout.write(`  ${pageName} ${colorScheme} ${breakpointName}...`);

				try {
					await page.goto(url, { waitUntil: "networkidle" });
					await page.evaluate(HIDE_TOOLBAR_JS);
					await page.evaluate(() => window.scrollTo(0, 0));
					// let lazy images and fonts settle after load
					await page.waitForTimeout(500);
					await page.screenshot({
						path: filepath,
						type: "jpeg",
						quality: JPEG_QUALITY,
					});
					files.push(filepath);
					process.stdout.write(" done\n");
				} catch (err) {
					failures++;
					const msg = err instanceof Error ? err.message : String(err);
					process.stdout.write(` FAILED: ${msg}\n`);
				}
			}

			await context.close();
		}
	}

	return { files, failures };
}

async function run() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.error("Usage: node scripts/screenshot-templates.mjs <template> <url>");
		console.error("  e.g. node scripts/screenshot-templates.mjs blog http://localhost:4321");
		process.exit(1);
	}

	const [template, baseUrl] = args;
	const config = loadConfig();

	if (!config[template]) {
		console.error(`Unknown template: ${template}`);
		console.error(`Available: ${Object.keys(config).join(", ")}`);
		process.exit(1);
	}

	const { pages } = config[template];
	const ts = timestamp();
	const outDir = join(ROOT, "assets", "templates", template, ts);
	mkdirSync(outDir, { recursive: true });

	console.log(`\n${template} → ${outDir}`);

	const browser = await chromium.launch();
	let result;

	try {
		result = await screenshotTemplate(browser, baseUrl, pages, outDir);
	} finally {
		await browser.close();
	}

	if (result.failures > 0) {
		console.error(`\n${result.failures} screenshot(s) failed. Skipping latest/ update.`);
		process.exit(1);
	}

	// copy to latest/
	const latestDir = join(ROOT, "assets", "templates", template, "latest");
	if (existsSync(latestDir)) rmSync(latestDir, { recursive: true });
	cpSync(outDir, latestDir, { recursive: true });

	console.log(`  → copied to latest/`);
	console.log(`\n${result.files.length} screenshots captured.`);
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
