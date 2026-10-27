/**
 * The stand's database server options (stand.mjs). Every connection the site's own user opens starts its RAND()
 * from one seed (`init_connect`, which MariaDB runs for every user without SUPER: the site's user, not root).
 *
 * Why: a page can list its items in a random order (`ORDER BY RAND()`: JA Vogue 1.0.7's editorial carousel, a new
 * draw of articles on every request, 18/10/2026). Two takes of one page then hold different items, so the
 * measurement compared a box against another article: PREVIEW-PARITY saw the popup's carousel laid out apart
 * from Try on's (a tall card where the other had a short one), shrunk-block saw a card shrink. Seeded, each
 * request draws the same items, and two takes of a page differ only by what the system changed.
 */
export const STAND_RAND_SEED = Object.freeze([20261018, 1])

/** The arguments after the image name: the server's command line. */
export const STAND_DB_ARGS = Object.freeze([
  `--init-connect=SET SESSION rand_seed1=${STAND_RAND_SEED[0]}, rand_seed2=${STAND_RAND_SEED[1]}`
])
