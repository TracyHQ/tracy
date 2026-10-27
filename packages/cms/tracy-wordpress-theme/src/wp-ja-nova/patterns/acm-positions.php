<?php
/**
 * Title: Open positions
 * Slug: wp-ja-nova/section-positions
 * Description: A section title, then one row per open position: its title, contract and place, a line, a Show more button that opens the full description with an Apply button (Joomla ACM features-intro style-7).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: jobs, careers, positions, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-positions","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-positions">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'A section title', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-positions__list jn-accordion jn-accordion--single jn-accordion--jobs","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-positions__list jn-accordion jn-accordion--single jn-accordion--jobs">
<!-- wp:group {"className":"jn-accordion__item jn-position","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-accordion__item jn-position">
<!-- wp:group {"className":"jn-position__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-position__head">
<!-- wp:paragraph {"className":"jn-position__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<p class="jn-position__title"><?php esc_html_e( 'A position', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jn-position__info","layout":{"type":"default"}} -->
<div class="wp-block-group jn-position__info">
<!-- wp:paragraph {"className":"jn-position__type","metadata":{"role":"content","name":"features-intro.apply-position.1"}} -->
<p class="jn-position__type"><?php esc_html_e( 'Full-time', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-position__place","metadata":{"role":"content","name":"features-intro.apply-time.1"}} -->
<p class="jn-position__place"><?php esc_html_e( 'A city', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"jn-position__desc","metadata":{"role":"content","name":"features-intro.desc.1"}} -->
<p class="jn-position__desc"><?php esc_html_e( 'One line about the position.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-accordion__header jn-position__toggle"} -->
<p class="jn-accordion__header jn-position__toggle"><span class="jn-position__more"><?php esc_html_e( 'Show more', 'wp-ja-nova' ); ?></span><span class="jn-position__less"><?php esc_html_e( 'Show less', 'wp-ja-nova' ); ?></span></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-accordion__body jn-position__body","layout":{"type":"default"}} -->
<div class="wp-block-group jn-accordion__body jn-position__body">
<!-- wp:paragraph {"className":"jn-position__text","metadata":{"role":"content","name":"features-intro.tab-body.1"}} -->
<p class="jn-position__text"><?php esc_html_e( 'The full description of the position.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jn-actions"} -->
<div class="wp-block-buttons jn-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"features-intro.btn.1"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Apply', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
