- **The hero headline says what sets the business apart, only when the brief proves it** — brief-build agent · #189 · `feat/brief-build-own-site` · 2026-10-29

**Affects:** brief builds (home hero headline and subline, offering page intros, the first-screen report).

- The hero has three text places: the headline says WHY (the USP) and WHERE, the subline WHAT (the offerings) and WHO (the people served), the button the contact. Opening hours go only into a hero line of their own, and only when the brief trusts them.
- A USP counts only when it is specific (a concrete method, result, convenience, credential or promise), differentiating, and provable: a fact the site shows, or a theme at least two reviews state, quoted as evidence (`hero-usp.mjs`). Generic praise such as "friendly", "best", "all levels", or "European" and "premium" with nothing behind them never counts. A model may cluster review themes; its quotes are checked word for word in code.
- No USP: the headline says what and where, and the report asks the owner "What makes you different from other <trade> in <place>?". Nothing is invented.
- A short subline drops the detail of WHO first, then WHO, keeps the place when the headline lacks it, and drops offerings last. Offering page intros name who the offerings serve.
- The served-page report (`heroMissing`) names which of what, why, who, where and contact the first screen misses.
