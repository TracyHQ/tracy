/**
 * The commands that measure one release version, ready to paste into Claude Code from a tch checkout
 * (16/10/2026: /ops must say "not measured at the current probe" with a command that runs, not
 * a description of a procedure). The same release measurement the role-variable batches ran:
 *
 *   1. a stand restored from the release itself (`stand.mjs up`; EmDash: its own source zip + state);
 *   2. the built-site run under the 15 featured systems, which writes design-system-measurement.json
 *      into the contract folder of the version (`flow.mjs --measure-*`);
 *   3. the Add site preview under Moxie and Figma, light then dark, every declared page, added to that
 *      file (`preview-check.mjs --write`, the current preview probe);
 *   4. the stand taken down.
 *
 * `previewOnly` leaves out step 2: the file of the version is there and only its preview rows are
 * older than the current probe. PURE.
 */
import { dsSlotModule, FEATURED_REFERO_SYSTEMS } from '../../ds-slot.js'

// Through `dsSlotModule`, not a relative path into `packages/`: the image has no `packages/` (see
// `built-site.js`).
const { previewLineOf } = await dsSlotModule('measurement')

/** The two systems every preview measurement runs: Moxie (a dark page) and Figma (a light page). */
export const PREVIEW_SYSTEMS = Object.freeze([
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671'
])

const PORT = 52990
const NAME = 'ds-measure'
const WORK = '/tmp/ds-measure'
const SITE = `http://127.0.0.1:${PORT}`

/** A value as one shell word. @param {string} s */
const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`)

/**
 * @param {{ platform: string, tag: string, version: string, contract: string | null,
 *   setting?: any, previewOnly?: boolean }} release
 * @returns {string | null} the commands, one per line; null when the tag names no template line
 */
export function measureCommandOf({ platform, tag, version, contract, setting = null, previewOnly = false }) {
  const line = previewLineOf({ platform, tag })
  if (!line || typeof version !== 'string' || version === '') return null
  const lines = [
    `# run from the root of a tch checkout (pnpm install done); Docker for the stand, Chrome for the probes`
  ]
  const slotDir = 'packages/design/tracy-ds-slot'
  const ds = `--template ${q(contract ?? `<the slot contract of ${tag}>`)}`
  let flowCms = ''
  if (platform === 'emdash') {
    const source = setting?.install?.source?.file ?? `<source zip of ${version}>`
    const state = setting?.install?.state?.file ?? `<state tar of ${version}>`
    lines.push(
      `rm -rf ${WORK} && mkdir -p ${WORK}/src ${WORK}/state && cd ${WORK}`,
      `gh release download ${q(tag)} -R JoomlArt-Products/ja-products -p ${q(source)} -p ${q(state)}`,
      `unzip -q ${q(source)} -d src && tar -xzf ${q(state)} -C state`,
      `docker build -q -t ${NAME}:${q(version)} "$(dirname "$(find src -maxdepth 3 -name Dockerfile | head -1)")"`,
      `docker run -d --name ${NAME}-web -p 127.0.0.1:${PORT}:4321 -v ${WORK}/state/data:/app/data -v ${WORK}/state/uploads:/app/uploads ${NAME}:${q(version)}`,
      'cd -'
    )
    flowCms = `--cms emdash ${ds} --data ${WORK}/state/data`
  } else {
    lines.push(
      `node ${slotDir}/scripts/stand.mjs up ${q(tag)} --version ${q(version)} --port ${PORT} --name ${NAME} --dir ${WORK}`
    )
    flowCms =
      platform === 'joomla'
        ? `--cms joomla ${ds} --joomla-db ${NAME}-db --joomla-prefix "$(node -p 'require("${WORK}/${NAME}/dl/manifest.json").prefix || "tr_"')" --joomla-login site`
        : `--cms wordpress ${ds} --wp-container ${NAME}-web`
  }
  if (!previewOnly) {
    const snapCms = flowCms.split(' --data ')[0].split(' --joomla-db ')[0].split(' --wp-container ')[0]
    lines.push(
      `node ${slotDir}/scripts/flow.mjs ${snapCms} --site ${SITE} --out ${WORK}/flow/baseline --snap`,
      `node ${slotDir}/scripts/flow.mjs ${flowCms} --site ${SITE} --out ${WORK}/flow/final --baseline ${WORK}/flow/baseline/default.json --measure-version ${q(version)} --measure-tag ${q(tag)} --measure-template ${q(line.template)} ${FEATURED_REFERO_SYSTEMS.map((id) => `refero:${id}`).join(' ')}`
    )
  }
  lines.push(
    `echo '${JSON.stringify([{ tag, platform, version, address: `${SITE}/` }])}' > ${WORK}/demos.json`,
    `for sc in light dark; do node apps/tracy-web/scripts/preview-check.mjs --demos ${WORK}/demos.json --out ${WORK}/preview-$sc --only ${q(tag)} --systems ${PREVIEW_SYSTEMS.join(',')} --scheme $sc --pages all --write; done`,
    platform === 'emdash'
      ? `docker rm -f ${NAME}-web && docker rmi ${NAME}:${q(version)}`
      : `node ${slotDir}/scripts/stand.mjs down --name ${NAME} --dir ${WORK}`,
    `# then commit ${previewOnly ? 'the updated' : 'the new'} design-system-measurement.json of ${version} (and its hash wherever design-templates.json lists it)`
  )
  return lines.join('\n')
}
