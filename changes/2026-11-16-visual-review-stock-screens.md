- **The planner's visual review (V01) asks for no image of a stock screen page group** — David (with Claude) · #662 · `fix/visual-review-stock-screens` · 2026-11-16
  **Affects:** Rebuild and deploy tracy-web. Plan steps on kits that declare stock screens (JA Diner 1.0.8 since #656) no longer end "failed, best version used" on an image the tool will not open.
  **Why / Measured:** Dev, 16/11/2026, Arabian Tea House on JA Diner: V01 asked for page-home_home-red-1440, which `open_kit_image` answers STOCK_SCREEN. Case REG-PR-662-visual-review-stock-screens.
