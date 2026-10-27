/**
 * Color Picker Plugin for EmDash CMS
 *
 * Provides a color picker field widget that replaces the default
 * string input with a visual color selector. Demonstrates the
 * field widget plugin capability.
 *
 * Usage:
 *   1. Add the plugin to your emdash config
 *   2. Create a field with type "string" and widget "color:picker"
 *   3. The admin editor will show a color picker instead of a text input
 *
 * The color value is stored as a hex string (e.g., "#ff6600").
 */

import type { PluginDescriptor } from "emdash";
import { definePlugin } from "emdash";

/**
 * Create the color picker plugin instance.
 * Called by the virtual module system at runtime.
 */
export function createPlugin() {
	return definePlugin({
		id: "color",
		version: "0.0.1",

		admin: {
			entry: "@emdash-cms/plugin-color/admin",
			fieldWidgets: [
				{
					name: "picker",
					label: "Color Picker",
					fieldTypes: ["string"],
				},
			],
		},
	});
}

export default createPlugin;

/**
 * Create a plugin descriptor for use in emdash config.
 */
export function colorPlugin(): PluginDescriptor {
	return {
		id: "color",
		version: "0.0.1",
		entrypoint: "@emdash-cms/plugin-color",
		options: {},
		adminEntry: "@emdash-cms/plugin-color/admin",
	};
}
