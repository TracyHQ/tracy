<?php
/**
 * Title: Questions and answers
 * Slug: wp-ja-nova/section-faq
 * Description: A heading with a coloured word, a line and a button on the left; on the right the questions, one open at a time (Joomla ACM accordion style-1).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: faq, questions, accordion, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-faq","metadata":{"name":"accordion.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-faq">
<!-- wp:group {"className":"jn-container jn-faq__row","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container jn-faq__row">
<!-- wp:group {"className":"jn-faq__info","layout":{"type":"default"}} -->
<div class="wp-block-group jn-faq__info">
<!-- wp:heading {"className":"jn-faq__title","metadata":{"role":"content","name":"accordion.info-title"}} -->
<h2 class="wp-block-heading jn-faq__title"><?php esc_html_e( 'Frequently asked questions', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-faq__desc","metadata":{"role":"content","name":"accordion.info-desc"}} -->
<p class="jn-faq__desc"><?php esc_html_e( 'Have more questions? Book a call.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jn-actions"} -->
<div class="wp-block-buttons jn-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"accordion.button"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Book an intro call', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-accordion jn-accordion--single","metadata":{"name":"accordion.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-accordion jn-accordion--single">
<!-- wp:group {"className":"jn-accordion__item","metadata":{"name":"accordion.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-accordion__item">
<!-- wp:heading {"level":4,"className":"jn-accordion__header","metadata":{"role":"content","name":"accordion.accordion-name.1"}} -->
<h4 class="wp-block-heading jn-accordion__header"><?php esc_html_e( 'A question?', 'wp-ja-nova' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-accordion__body","metadata":{"role":"content","name":"accordion.accordion-desc.1"}} -->
<p class="jn-accordion__body"><?php esc_html_e( 'Its answer.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
