import { PACKAGE_NAME, PAGE_LIST_PLUGIN_ID, PLUGIN_VERSION } from "./lib/defaults.js";
import type { EmdashPluginDescriptor } from "./lib/emdash.js";

export function pageListPlugin(): EmdashPluginDescriptor {
	return {
		id: PAGE_LIST_PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: `${PACKAGE_NAME}/plugin`,
		componentsEntry: `${PACKAGE_NAME}/astro`,
		capabilities: [],
		allowedHosts: [],
	};
}

export default pageListPlugin;

export type * from "./lib/types.js";
