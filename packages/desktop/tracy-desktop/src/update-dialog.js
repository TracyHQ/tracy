/**
 * Where an update question goes, and its words (tasks/todo-desktop-update-policy.md A4) — pure, so
 * the rule "never a dialog without a parent" is a test, not a habit (test/update-dialog.test.mjs).
 *
 * WHY: `dialog.showMessageBox` without a parent window runs `[alert runModal]` synchronously on the
 * main thread on macOS (Electron 44 `message_box_mac.mm`): while it is open no timer runs, no update
 * check, no signal handling — SIGTERM cannot even quit the app (measured 11/10,
 * tasks/evidence/desktop-update-policy/dialog-timer/CONCLUSION.md). A sheet on a window blocks
 * nothing. So: a live product window → a sheet on it; none → a system notification and the quiet
 * answer (Later / OK), nothing modal.
 */

/**
 * @param {{
 *   question: { kind: 'downloaded' | 'available' | 'downloading' | 'current' | 'failed', version?: string, reason?: string },
 *   parent: { isDestroyed?: () => boolean } | undefined,
 *   appName: string,
 *   platform: string,
 *   installMode: 'quit' | 'restart' | 'manual'
 * }} input
 */
function updateQuestionPlan({ question, parent, appName, platform, installMode }) {
  const name = appName
  const onQuit = installMode === 'quit'
  const texts = {
    downloaded: {
      message: `${name} ${question.version} is ready to install`,
      detail: onQuit
        ? 'It installs when you quit. Restart now to finish updating. Your sign-in and your work stay as they are.'
        : 'Restart to finish updating. Your sign-in and your work stay as they are.',
      buttons: ['Restart Now', 'Later'],
      answers: ['restart', 'later']
    },
    available: {
      message: `${name} ${question.version} is available`,
      detail:
        platform === 'darwin'
          ? 'This copy cannot update itself. Download the new version and replace this one in Applications.'
          : 'This copy cannot update itself. Download the new version and install it.',
      buttons: ['Download', 'Later'],
      answers: ['download', 'later']
    },
    downloading: {
      message: `${name} ${question.version} is downloading`,
      detail: onQuit
        ? 'It installs the next time you quit.'
        : 'You will be asked to restart once it is ready.',
      buttons: ['OK'],
      answers: ['ok']
    },
    current: {
      message: 'You are up to date',
      detail: `${name} ${question.version} is the newest version.`,
      buttons: ['OK'],
      answers: ['ok']
    },
    failed: {
      message: 'Could not check for updates',
      detail: String(question.reason ?? ''),
      buttons: ['OK'],
      answers: ['ok']
    }
  }[question.kind]
  const live =
    parent !== undefined &&
    parent !== null &&
    !(typeof parent.isDestroyed === 'function' && parent.isDestroyed())
  if (live) return { show: 'sheet', parent, ...texts }
  return {
    show: 'notification',
    title: texts.message,
    body: texts.detail,
    answer: texts.answers.at(-1),
    ...texts
  }
}

module.exports = { updateQuestionPlan }
