/**
 * The smallest kit parts the Website opportunity flow reads (`src/lib/template-kit/flow-reads.js`), all clean: one logo
 * spot written through a setting, one name slot, a favicon, an accent read from a button fill, no menus. Test kits
 * spread these in so Template kit judges their pictures and approval alone unless a test says otherwise. Every name
 * and value here is made up.
 */
export const FLOW_SITE = Object.freeze({
  logoSpots: [
    {
      id: 'logo-header-1',
      frameId: 'siteSetting-1.0',
      setting: 'site_logo',
      where: 'header',
      shownIn: ['base'],
      ground: { colour: '#ffffff', side: 'light' }
    }
  ],
  nameSlots: [{ kind: 'setting', scope: 'cms', setting: 'global configuration sitename', value: 'Sample' }],
  favicon: { currentFile: '/favicon.ico', mechanism: { setting: 'template setting favicon', value: null } },
  brandColours: {
    primary: { value: '#a04020', roles: ['button-fill', 'link'], wordsOn: ['#ffffff'] },
    opensOn: { markers: [], ground: '#ffffff' },
    sides: [{ marker: 'base', ground: '#ffffff', groundSide: 'light', groundFrom: 'own', panels: [] }],
    tokens: [{ name: '--color-primary', value: '#a04020', side: 'base' }]
  },
  navigationGroups: [],
  settingSlots: []
})

/** The page group of a front page `id`: its own root and representative. */
export const frontGroup = (id) => ({ id: `group-${id}`, root: id, children: [], representative: id })
