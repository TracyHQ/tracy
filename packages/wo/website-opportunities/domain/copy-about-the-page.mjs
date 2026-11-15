// The sentences of the page writer's copy that describe the page itself instead of the business (`about_the_page`,
// ticket #594), in the six site languages (en, de, fr, es, it, pt). Wider than the step chain's W10
// (`SELF_DESCRIBING` of `copy-repeats.mjs`, kept as it was), but it never names a thing a business also sells: "Gift
// this card to a friend" is a sentence about a gift card. Case-insensitive, whole words. Pure.
import { rawAccented } from './copy-accents.mjs'
import { selfDescribingOf } from './copy-repeats.mjs'

const w = (source) => new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${source})(?![\p{L}\p{N}])`, 'iu')

export const ABOUT_THE_PAGE = [
  w(String.raw`this (?:section|page|block|layout|template)`),
  w(String.raw`here you (?:will|can) find|on this (?:page|site|website)`),
  w(String.raw`(?:show|shows|showing) the shape of|made to show`),
  w(String.raw`(?:section|block|page) (?:above|below)|see (?:below|above)|(?:scroll|read) (?:down|below)`),
  w(String.raw`demo (?:text|content|site|page)|(?:template|theme) demo|lorem ipsum|placeholder text`),
  w(
    String.raw`(?:diese[rsmn]?) (?:Seite|Abschnitt|Block)|auf dieser Seite|hier finden Sie|siehe (?:unten|oben)`
  ),
  w(
    String.raw`(?:cette|ce) (?:page|section|bloc|rubrique)|sur cette page|ici vous (?:trouverez|pouvez)|voir ci-(?:dessous|dessus)`
  ),
  w(
    rawAccented`(?:esta|este) (?:p\\u00e1gina|secci\\u00f3n|bloque)|en esta p\\u00e1gina|aqu\\u00ed (?:encontrar\\u00e1|encontrar\\u00e1s|puede|puedes)|ver (?:m\\u00e1s )?abajo`
  ),
  w(
    String.raw`(?:questa|questo) (?:pagina|sezione|blocco)|in questa pagina|qui (?:troverai|trovi|puoi)|vedi (?:sotto|sopra)`
  ),
  w(
    rawAccented`(?:esta|este) (?:p\\u00e1gina|seç\\u00e3o|secç\\u00e3o|bloco)|nesta p\\u00e1gina|aqui (?:voc\\u00ea )?(?:encontra|encontrar\\u00e1|pode)|(?:veja|ver) abaixo`
  )
]

/** The first words of a written value that describe the page or a section of it, or null. */
export const aboutThePageOf = (text) => selfDescribingOf(text, ABOUT_THE_PAGE)
