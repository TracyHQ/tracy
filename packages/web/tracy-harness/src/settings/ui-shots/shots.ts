/**
 * GENERATED — element boxes of the customer's page, as % of a 1440×900 viewport, keyed by switch id
 * (`_name` = a context outline, not a switch). Captured on the local stand with every switchable
 * piece shown (`/api/ui` answered `hidden: []`), beside the five PNGs in this folder. Pictures for
 * operators, approximate by design (Lee, 28/09): recapture when a page changes shape, not per pixel.
 */
export interface ShotBox {
  x: number
  y: number
  w: number
  h: number
}

export const UI_SHOTS: {
  viewport: { w: number; h: number }
  capturedAt: string
  site: string
  shots: Record<string, Record<string, ShotBox | null>>
} = {
  viewport: {
    w: 1440,
    h: 900
  },
  capturedAt: '2026-09-28T12:33:55.803Z',
  site: 'capiwl1643.tracy.test',
  shots: {
    dsh: {
      'dsh-trajectory-tab': {
        x: 10.36,
        y: 5.56,
        w: 4.37,
        h: 2.78
      },
      'dsh-open-in-app': {
        x: 17.92,
        y: 1.44,
        w: 2.99,
        h: 2.67
      },
      'dsh-session-menu': {
        x: 21.46,
        y: 1.22,
        w: 1.94,
        h: 3.11
      },
      'dsh-session-menu-feedback': {
        x: 11.49,
        y: 8.56,
        w: 11.63,
        h: 3.33
      },
      'dsh-session-menu-download': {
        x: 11.49,
        y: 5.22,
        w: 11.63,
        h: 3.33
      },
      _tabs: {
        x: 5.28,
        y: 5.56,
        w: 17.57,
        h: 2.78
      }
    },
    'left-column': {
      'workspace-tree': {
        x: 0.56,
        y: 11.78,
        w: 18.33,
        h: 38.44
      },
      'other-sites': {
        x: 0.56,
        y: 50.67,
        w: 18.33,
        h: 15.11
      },
      'settings-button': {
        x: 0.56,
        y: 94.22,
        w: 18.33,
        h: 4.89
      },
      'session-status-dot': {
        x: 1.39,
        y: 26.11,
        w: 0.42,
        h: 0.67
      },
      'session-timestamp': {
        x: 16.28,
        y: 25.56,
        w: 1.29,
        h: 1.78
      }
    },
    'settings-dialog': {
      general: {
        x: 22.78,
        y: 16.11,
        w: 15.56,
        h: 3.56
      },
      plugins: {
        x: 22.78,
        y: 19.67,
        w: 15.56,
        h: 3.56
      },
      'tracy-account': {
        x: 22.78,
        y: 23.22,
        w: 15.56,
        h: 3.56
      },
      'tracy-site': {
        x: 22.78,
        y: 26.78,
        w: 15.56,
        h: 3.56
      },
      'better-sidebar': {
        x: 22.78,
        y: 30.33,
        w: 15.56,
        h: 3.56
      },
      language: {
        x: 40.63,
        y: 10.44,
        w: 35.14,
        h: 6.33
      },
      appearance: {
        x: 40.63,
        y: 18.56,
        w: 35.14,
        h: 23.89
      },
      'font-size': {
        x: 40.63,
        y: 44.22,
        w: 35.14,
        h: 7.44
      },
      'transcript-view': {
        x: 40.63,
        y: 53.44,
        w: 35.14,
        h: 7.67
      },
      'performance-usage': {
        x: 40.63,
        y: 62.89,
        w: 35.14,
        h: 9.67
      },
      'composer-enter': {
        x: 40.63,
        y: 83.78,
        w: 35.14,
        h: 9.67
      },
      shortcuts: {
        x: 40.63,
        y: 74.33,
        w: 35.14,
        h: 7.67
      }
    },
    composer: {
      _composer: {
        x: 18.72,
        y: 36.11,
        w: 65.95,
        h: 32.22
      },
      'access-mode': null,
      'model-picker': {
        x: 65.78,
        y: 56.11,
        w: 13.14,
        h: 3.11
      }
    },
    'right-column': {
      'split-button': {
        x: 92.64,
        y: 1.11,
        w: 1.94,
        h: 3.11
      },
      'guide-picture': null,
      _launcher: {
        x: 25.83,
        y: 1.11,
        w: 1.94,
        h: 3.11
      },
      'launch-add-site': {
        x: 26.11,
        y: 5.11,
        w: 10.28,
        h: 2.67
      },
      'launch-my-sites': {
        x: 26.11,
        y: 7.78,
        w: 10.28,
        h: 2.67
      },
      'launch-inspirations': {
        x: 26.11,
        y: 10.44,
        w: 10.28,
        h: 2.67
      },
      'launch-team': {
        x: 26.11,
        y: 13.11,
        w: 10.28,
        h: 2.67
      },
      'launch-git': {
        x: 26.11,
        y: 21.11,
        w: 10.28,
        h: 2.67
      },
      'launch-subagent': {
        x: 26.11,
        y: 23.78,
        w: 10.28,
        h: 2.67
      },
      'launch-side-chat': {
        x: 26.11,
        y: 26.44,
        w: 10.28,
        h: 2.67
      },
      'launch-files': null,
      'launch-brand': {
        x: 26.11,
        y: 15.78,
        w: 10.28,
        h: 2.67
      },
      'launch-brand-builder': {
        x: 26.11,
        y: 18.44,
        w: 10.28,
        h: 2.67
      },
      'launch-build': {
        x: 26.11,
        y: 29.11,
        w: 10.28,
        h: 2.67
      },
      'launch-live-site': {
        x: 26.11,
        y: 31.78,
        w: 10.28,
        h: 2.67
      },
      'launch-changes': null,
      'launch-browser': null
    },
    'new-session': {
      'hero-headline': null,
      'start-cards': {
        x: 18.72,
        y: 34.57,
        w: 65.95,
        h: 18.86
      },
      'mode-platform-row': {
        x: 18.72,
        y: 57.88,
        w: 65.95,
        h: 3.11
      }
    }
  }
}
