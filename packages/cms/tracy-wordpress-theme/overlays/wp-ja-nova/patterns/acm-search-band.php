<?php
/**
 * Title: Search and popular tags
 * Slug: wp-ja-nova/section-search-band
 * Description: A grey band with two columns (Joomla box-left/box-right on the category blog): a search form and social links, then the most used tags.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: search, tags, social
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-search-band","metadata":{"name":"search-band.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-search-band">
<!-- wp:group {"className":"jn-container jn-search-band__row","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container jn-search-band__row">
<!-- wp:group {"className":"jn-search-band__left","layout":{"type":"default"}} -->
<div class="wp-block-group jn-search-band__left">
<!-- wp:heading {"level":3,"className":"jn-search-band__title","metadata":{"role":"content","name":"search-band.search-title"}} -->
<h3 class="wp-block-heading jn-search-band__title"><?php esc_html_e( 'Search', 'wp-ja-nova' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Search …","buttonText":"Search","buttonUseIcon":true,"buttonPosition":"button-inside","className":"jn-search-band__form"} /-->
<!-- wp:social-links {"className":"jn-social jn-search-band__social","metadata":{"name":"search-band.social"}} -->
<ul class="wp-block-social-links jn-social jn-search-band__social"><!-- wp:social-link {"url":"#","service":"facebook"} /-->
<!-- wp:social-link {"url":"#","service":"twitter"} /-->
<!-- wp:social-link {"url":"#","service":"youtube"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-search-band__right","layout":{"type":"default"}} -->
<div class="wp-block-group jn-search-band__right">
<!-- wp:heading {"level":3,"className":"jn-search-band__title","metadata":{"role":"content","name":"search-band.tags-title"}} -->
<h3 class="wp-block-heading jn-search-band__title"><?php esc_html_e( 'Tags Popular', 'wp-ja-nova' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:tag-cloud {"numberOfTags":12,"smallestFontSize":"14px","largestFontSize":"14px","className":"jn-tags jn-search-band__tags"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
