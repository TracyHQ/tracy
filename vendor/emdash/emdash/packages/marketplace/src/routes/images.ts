import type { Context } from "hono";
import { Hono } from "hono";

import {
	getLatestVersion,
	getPluginVersion,
	getPluginWithAuthor,
	getThemeWithAuthor,
} from "../db/queries.js";

export const imageRoutes = new Hono<{ Bindings: Env }>();

// ── GET /plugins/:id/icon — Latest version icon ─────────────────

imageRoutes.get("/plugins/:id/icon", async (c) => {
	const pluginId = c.req.param("id");
	const width = parseWidth(c.req.query("w"));

	try {
		const plugin = await getPluginWithAuthor(c.env.DB, pluginId);
		if (!plugin) return c.json({ error: "Plugin not found" }, 404);

		const latest = await getLatestVersion(c.env.DB, pluginId);
		if (!latest || !latest.has_icon) {
			return generateLetterAvatar(plugin.name);
		}

		const r2Key = `plugin-bundles/${pluginId}/${latest.version}/icon.png`;
		return serveImage(c, r2Key, {
			width,
			immutable: false,
			pluginName: plugin.name,
		});
	} catch (err) {
		console.error("Failed to serve icon:", err);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// ── GET /plugins/:id/versions/:version/icon — Versioned icon ────

imageRoutes.get("/plugins/:id/versions/:version/icon", async (c) => {
	const pluginId = c.req.param("id");
	const version = c.req.param("version");
	const width = parseWidth(c.req.query("w"));

	try {
		const plugin = await getPluginWithAuthor(c.env.DB, pluginId);
		if (!plugin) return c.json({ error: "Plugin not found" }, 404);

		const versionRow = await getPluginVersion(c.env.DB, pluginId, version);
		if (!versionRow) return c.json({ error: "Version not found" }, 404);

		if (!versionRow.has_icon) {
			return generateLetterAvatar(plugin.name);
		}

		const r2Key = `plugin-bundles/${pluginId}/${version}/icon.png`;
		return serveImage(c, r2Key, {
			width,
			immutable: true,
			pluginName: plugin.name,
		});
	} catch (err) {
		console.error("Failed to serve versioned icon:", err);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// ── GET /plugins/:id/versions/:version/screenshots/:filename ────

imageRoutes.get("/plugins/:id/versions/:version/screenshots/:filename", async (c) => {
	const pluginId = c.req.param("id");
	const version = c.req.param("version");
	const filename = c.req.param("filename");

	// Sanitize filename to prevent path traversal
	if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
		return c.json({ error: "Invalid filename" }, 400);
	}

	try {
		const r2Key = `plugin-bundles/${pluginId}/${version}/screenshots/${filename}`;
		return serveImage(c, r2Key, { immutable: true });
	} catch (err) {
		console.error("Failed to serve screenshot:", err);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// ── GET /themes/:id/thumbnail — Theme thumbnail ─────────────────

imageRoutes.get("/themes/:id/thumbnail", async (c) => {
	const themeId = c.req.param("id");
	const width = parseWidth(c.req.query("w"));

	try {
		const theme = await getThemeWithAuthor(c.env.DB, themeId);
		if (!theme) return c.json({ error: "Theme not found" }, 404);

		if (!theme.has_thumbnail) {
			return generateLetterAvatar(theme.name);
		}

		const r2Key = `themes/${themeId}/thumbnail.png`;
		return serveImage(c, r2Key, {
			width,
			immutable: false,
			pluginName: theme.name,
		});
	} catch (err) {
		console.error("Failed to serve theme thumbnail:", err);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// ── GET /themes/:id/screenshots/:filename — Theme screenshot ────

imageRoutes.get("/themes/:id/screenshots/:filename", async (c) => {
	const themeId = c.req.param("id");
	const filename = c.req.param("filename");

	if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
		return c.json({ error: "Invalid filename" }, 400);
	}

	try {
		const r2Key = `themes/${themeId}/screenshots/${filename}`;
		return serveImage(c, r2Key, { immutable: false });
	} catch (err) {
		console.error("Failed to serve theme screenshot:", err);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// ── Image serving helpers ───────────────────────────────────────

const MAX_WIDTHS = [64, 128, 256] as const;

function parseWidth(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const num = parseInt(value, 10);
	if (Number.isNaN(num) || num < 1) return undefined;
	// Clamp to nearest allowed size
	for (const max of MAX_WIDTHS) {
		if (num <= max) return max;
	}
	return MAX_WIDTHS.at(-1);
}

async function serveImage(
	c: Context<{ Bindings: Env }>,
	r2Key: string,
	opts?: { width?: number; immutable?: boolean; pluginName?: string },
): Promise<Response> {
	const object = await c.env.R2.get(r2Key);
	if (!object) {
		if (opts?.pluginName) return generateLetterAvatar(opts.pluginName);
		return c.json({ error: "Not found" }, 404);
	}

	const cacheControl = opts?.immutable
		? "public, max-age=31536000, immutable"
		: "public, max-age=3600";

	// Try Images binding for WebP conversion
	try {
		const images = c.env.IMAGES;
		if (images.input) {
			let transform = images.input(object.body);
			if (opts?.width) {
				transform = transform.transform({ width: opts.width, height: opts.width, fit: "contain" });
			}
			const output = await transform.output({ format: "image/webp" });
			const response = output.response();
			return new Response(response.body, {
				headers: { "Content-Type": "image/webp", "Cache-Control": cacheControl },
			});
		}
	} catch {
		// Images binding not available or failed — fall through to raw
	}

	// Fallback: serve raw from R2
	return new Response(object.body, {
		headers: {
			"Content-Type": object.httpMetadata?.contentType ?? "image/png",
			"Cache-Control": cacheControl,
		},
	});
}

function generateLetterAvatar(name: string): Response {
	const letter = (name[0] ?? "?").toUpperCase();
	let hue = 0;
	for (let i = 0; i < name.length; i++) {
		hue += name.charCodeAt(i);
	}
	hue = hue % 360;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
	<rect width="256" height="256" fill="hsl(${hue}, 60%, 45%)"/>
	<text x="128" y="160" font-family="system-ui, sans-serif" font-size="128" font-weight="bold" fill="white" text-anchor="middle">${letter}</text>
</svg>`;
	return new Response(svg, {
		headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
	});
}
