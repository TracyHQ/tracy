# visual-prepass fixtures

- `design-contract.json` — a small measured contract in the shape `design-contract.mjs` validates:
  four variants (1440/390 × light/dark), body type 16/24 px in "Inter Tight", a heading scale,
  section rhythm 128/32 px, a 1320 px container with a 16 px gutter, white hero text that is not a
  preset in dark, and a translucent footer colour that is no preset at all.
- `prepass.map.json` — which WordPress selector carries each rule, and the phone media query.
- `overlay/` — a generator overlay that still wears `rootVariation`, with hand-written dark CSS in
  `theme.overlay.json → styles.css` that the pre-pass must keep. Tests copy it; never write here.
