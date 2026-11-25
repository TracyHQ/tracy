// The demo's own logo files (public/brand/): what the header and the footer draw while the customer has not given a logo (the files
// of the source's `images/joomlart/logo/item-1.png` and `item-2.png`). `logo.png` is the lockup with dark ink for light grounds: `global.css`
// lifts it in dark mode by this file name, never by a selector that would catch a logo the customer uploaded. `logo-light.png` is white,
// for the footer, which is dark in both themes.
export const DEMO_LOGO = '/brand/logo.png'
export const DEMO_LOGO_LIGHT = '/brand/logo-light.png'
