// The site check's `kit-version` group (ADR 0044, 2026-11-04): a kit settled by an older template-kit tool lacks data the later
// groups read (sentence groups, the demo's lengths), and those groups would measure nothing and read green. So a kit older than
// KIT_TOOL_MIN blocks the run before them, on step 0: the template's kit must be settled again. A kit with no `tool` is older.
import { TEMPLATE_STEP } from '../lib/site-build-steps.js'
import { versionAtLeast } from '../lib/plugin-version.js'

/** The oldest template-kit tool whose kits carry every field the site check reads. */
export const KIT_TOOL_MIN = '3.1.0'

/** The tool version a kit names (`tool: "template-kit 3.1.0"`), or null when it names none. */
export function kitToolVersion(kit) {
  const m = /^template-kit\s+v?(\d+\.\d+\.\d+)\b/.exec(String(kit?.tool ?? '').trim())
  return m ? m[1] : null
}

export const kitVersionGroup = {
  name: 'kit-version',
  causingStep: TEMPLATE_STEP,
  stopsLaterWhenRed: true,
  /** @param {{ kit?: object | null }} context */
  async run({ kit }) {
    const version = kitToolVersion(kit)
    if (version && versionAtLeast(version, KIT_TOOL_MIN)) return { checked: 1, failures: [] }
    const settled = version ? `template-kit ${version}` : 'a template-kit tool that names no version'
    return {
      checked: 1,
      failures: [
        {
          level: 'block',
          measured: kit?.tool ?? null,
          reason: `the kit was settled by ${settled}, this check needs at least ${KIT_TOOL_MIN}: settle it again`
        }
      ]
    }
  }
}
