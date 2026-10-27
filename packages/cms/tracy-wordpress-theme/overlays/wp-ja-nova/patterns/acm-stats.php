<?php
/**
 * Title: Figures
 * Slug: wp-ja-nova/section-stats
 * Description: A section title with a coloured figure, then four figures in coloured type, each with a title and a line (Joomla ACM features-intro style-3). A figure's colour is its cta-<colour> class.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: figures, statistics, numbers, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-stats","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-stats">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'A section title', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-stats__grid acm-features-intro--cols-4","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-stats__grid acm-features-intro--cols-4">
<!-- wp:group {"className":"jn-stat","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-stat">
<!-- wp:paragraph {"className":"jn-stat__number cta-purple","metadata":{"role":"content","name":"features-intro.number.1"}} -->
<p class="jn-stat__number cta-purple">35k</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-stat__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<p class="jn-stat__title"><?php esc_html_e( 'Projects done', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-stat__desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jn-stat__desc"><?php esc_html_e( 'One line about the figure.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
