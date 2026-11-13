// Brand step results of four invented businesses (ticket #616), in the shape the locked brand step writes (brand file
// version 10, only the parts the look reads), each with the brief brand part it was made from. Nothing here is a real
// business, logo or colour of anyone. The template they are read against is the invented one (accent #225588).
const file = ({ colours, material, mark }) => ({
  kind: 'brand-file',
  version: 10,
  kit: 'example-court@1.0.0',
  name: { value: 'Invented', from: 'brief.brand.name' },
  colours: { replaces: '#225588', keeps: 'template', ...colours },
  logo: { material, mark: { decision: mark } }
})
const kept = (why) => ({
  decision: 'kept-template',
  why,
  brandColour: null,
  lift: null,
  accent: '#225588',
  builds: 0,
  shifts: [],
  module: null
})

/** A bakery whose website logo is a dark plum: the brand step lifted it so it reads. */
export const harrowLaneBakery = () => ({
  brief: {
    brand: {
      name: 'Harrow Lane Bakery',
      colorsFrom: 'logo',
      colors: [{ hex: '#3b0f2e', role: 'primary' }],
      logo: 'logo-hlb',
      logoResearch: { status: 'found', chosen: { mediaId: 'logo-hlb', source: 'website' } }
    }
  },
  brandFile: file({
    colours: {
      decision: 'new-accent',
      why: 'The plum of the logo has a visible hue.',
      brandColour: '#3b0f2e',
      lift: {
        from: '#3b0f2e',
        to: '#8a2c6c',
        say: 'Your plum was made lighter, same hue, so buttons stand out.'
      },
      accent: '#8A2C6C',
      builds: 1
    },
    material: { mediaId: 'logo-hlb' },
    mark: 'cut'
  })
})

/** A florist whose logo is words only, found on Instagram: an icon in the logo's colour, no lift. */
export const fernAndFoxglove = () => ({
  brief: {
    brand: {
      name: 'Fern and Foxglove',
      colorsFrom: 'logo',
      colors: [{ hex: '#2f7d5b', role: 'primary' }],
      logo: 'logo-ff',
      logoResearch: { status: 'found', chosen: { mediaId: 'logo-ff', source: 'instagram' } }
    }
  },
  brandFile: file({
    colours: {
      decision: 'new-accent',
      why: 'The green of the words has a visible hue.',
      brandColour: '#2f7d5b',
      lift: null,
      accent: '#2f7d5b',
      builds: 1
    },
    material: { mediaId: 'logo-ff' },
    mark: 'icon'
  })
})

/** A piano tuner with no logo found anywhere: the step draws an icon of the trade in the template's accent. */
export const quaysidePianoCare = () => ({
  brief: { brand: { name: 'Quayside Piano Care', colorsFrom: null, colors: [], logo: null } },
  brandFile: file({
    colours: kept('The brief has no logo and no brand colour, so the template accent stays.'),
    material: null,
    mark: 'icon'
  })
})

/** A bookbinder whose logo is black and grey only: no colour with a visible hue, so the step kept the accent. */
export const inkwellBindery = () => ({
  brief: {
    brand: {
      name: 'Inkwell Bindery',
      colorsFrom: 'logo',
      colors: [
        { hex: '#1a1a1a', role: 'primary' },
        { hex: '#8a8a8a', role: 'accent' }
      ],
      logo: 'logo-ib',
      logoResearch: { status: 'found', chosen: { mediaId: 'logo-ib', source: 'facebook' } }
    }
  },
  brandFile: file({
    colours: kept('Both logo colours have no visible hue, so the template accent stays.'),
    material: { mediaId: 'logo-ib' },
    mark: 'cut'
  })
})

/** A kayak hire whose blue logo the step could not wear (it kept the accent): a case no rule covers. */
export const saltmarshKayaks = () => ({
  brief: {
    brand: {
      name: 'Saltmarsh Kayaks',
      colorsFrom: 'logo',
      colors: [{ hex: '#2a6f97', role: 'primary' }],
      logo: 'logo-sk',
      logoResearch: { status: 'found', chosen: { mediaId: 'logo-sk', source: 'website' } }
    }
  },
  brandFile: file({
    colours: kept('Every build of the blue changed more than the accent, so the template accent stays.'),
    material: { mediaId: 'logo-sk' },
    mark: 'cut'
  })
})

/** An invented template kit with a light and a dark theme, and the colours its accent buttons take for words. */
/** `themes` keeps only some of its sides: `['dark']` for a dark only template. */
export const lightAndDarkKit = ({
  wordsOn = ['#ffffff', '#000000'],
  lightGround = '#fafafa',
  themes = ['light', 'dark']
} = {}) => ({
  ref: 'example-court@1.0.0',
  doc: {
    site: {
      brandColours: {
        primary: { value: '#225588', wordsOn },
        sides: [
          { marker: 'base', ground: lightGround, groundSide: 'light' },
          { marker: '[data-theme="dark"]', ground: '#141414', groundSide: 'dark' }
        ].filter((side) => themes.includes(side.groundSide))
      }
    }
  }
})
