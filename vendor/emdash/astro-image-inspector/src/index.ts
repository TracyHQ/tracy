import type { AstroIntegration } from "astro";
import type { ImageInspectorOptions } from "./types.js";

export type { ImageInspectorOptions };

export default function imageInspector(
  options: ImageInspectorOptions = {}
): AstroIntegration {
  const enabled = options.enabled ?? true;
  const appName = options.appName ?? "Image Inspector";

  return {
    name: "@lexingtonthemes/astro-image-inspector",
    hooks: {
      "astro:config:setup"({ addDevToolbarApp, command, updateConfig, config }) {
        if (!enabled || command !== "dev") return;
        addDevToolbarApp({
          id: "astro-image-inspector",
          name: appName,
          icon: "image",
          entrypoint: new URL("./toolbar-app.js", import.meta.url),
        });
        // Pre-bundle astro/toolbar so the dev toolbar doesn’t disappear when this app loads.
        // See: https://github.com/withastro/astro/issues/15857
        const viteOptimizeDeps = config.vite?.optimizeDeps as { include?: string[] } | undefined;
        const currentInclude = viteOptimizeDeps?.include ?? [];
        const include = Array.isArray(currentInclude)
          ? currentInclude.includes("astro/toolbar")
            ? currentInclude
            : [...currentInclude, "astro/toolbar"]
          : ["astro/toolbar"];
        updateConfig({
          vite: {
            optimizeDeps: {
              ...viteOptimizeDeps,
              include,
            },
          },
        });
      },
    },
  };
}
