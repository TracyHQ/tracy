// The dsh fork pin must carry every Tracy line TCH relies on at once. On 12/10/2026 develop was
// pointed at a hotfix cut on tracy.40, and the Help / command action row (tracy.42) and the
// narrow frame fix (tracy.41) left develop with every gate green: the TCH code calling them
// guards on their absence. Each check reads the pinned fork's own source, so a pin that drops a
// line fails here by name.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../../', import.meta.url)
const fork = 'vendor/tracy/deepseek-harness'
const read = (path) => readFileSync(new URL(path, root), 'utf8')
let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'ok' : 'not ok'} - ${label}`)
  if (!ok) failed += 1
}

// tracy.42: ctx.chatLocal.AnswerActions, the row under a settled command, the one-row-out rule.
check(
  existsSync(new URL(`${fork}/packages/client/ui-chat/src/client/chat/AnswerActions.tsx`, root)),
  'tracy.42: ui-chat has chat/AnswerActions.tsx'
)
check(
  /AnswerActions: ComponentType<LocalAnswerActionsProps>/.test(
    read(`${fork}/packages/client/ui-chat/src/client/chat-local.ts`)
  ),
  'tracy.42: ctx.chatLocal carries AnswerActions'
)
check(
  read(`${fork}/packages/client/ui-chat/src/client/chat/CommandNodeView.tsx`).includes('AnswerActions'),
  'tracy.42: a settled command draws the action row'
)
check(
  read(`${fork}/packages/client/ui-chat/src/client/chat/MessageIconActions.module.css`).includes(
    '[data-chat-exchange]'
  ),
  'tracy.42: a later local exchange takes the always-visible row'
)
check(
  read('packages/ui/tracy-assistant/src/client/HelpNode.tsx').includes('ctx.chatLocal.AnswerActions'),
  'TCH: the Help answer asks dsh for the same row'
)

// tracy.41: a plugin's own open on a narrow frame keeps the chat.
check(
  /readonly userGesture\?: \(\) => boolean/.test(
    read(`${fork}/packages/client/ui-sidebar-right/src/client/service.ts`)
  ),
  'tracy.41: SidebarRightHost.userGesture exists'
)

// tracy.43 / fork PR #53: the running label says Thinking.
check(
  read(`${fork}/packages/client/ui-chat/src/client/locale.ts`).includes("'chat.deepDiving': 'Thinking',"),
  "tracy.43: chat.deepDiving is 'Thinking'"
)

// tracy.45: feedback takes several Tracy categories, and the command invites it in Tracy's words.
check(
  read(`${fork}/packages/feedback/command-feedback/src/index.ts`).includes(
    'categories: [...entry.categories]'
  ),
  'tracy.45: feedback stores categories[]'
)
check(
  read(`${fork}/packages/client/ui-commands/src/client/locales.ts`).includes(
    "'description.feedback': 'Help us to improve Tracy',"
  ),
  "tracy.45: /feedback reads 'Help us to improve Tracy'"
)

// The image starts only when dsh-passwords accepts the fork's version.
const version = JSON.parse(read(`${fork}/package.json`)).version
const gate = read('vendor/tracy/dsh-passwords/src/tracy/dsh-runtime.ts').match(
  /const TRACY_DSH_RE = \/(.*)\/;/
)
check(
  gate !== null && new RegExp(gate[1]).test(version),
  `fork version ${version} passes the dsh-passwords runtime gate`
)
const tracyN = Number(/-tracy\.(\d+)$/.exec(version)?.[1])
check(tracyN >= 46, `fork version ${version} is tracy.46 or later (the reunited line)`)

process.exit(failed ? 1 : 0)
