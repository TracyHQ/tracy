<?php
/**
 * Title: Accordion
 * Slug: wp-ja-impact/acm-accordion
 * Description: A heading and a lead, then numbered question cards in two columns; the first answer is open and each card opens or closes on its own (Joomla ACM accordion style-1 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: accordion, faq, questions, collapse, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-accordion style-1","metadata":{"name":"accordion.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-accordion style-1">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"jim-acc__info","layout":{"type":"default"}} -->
<div class="wp-block-group jim-acc__info">
<!-- wp:heading {"className":"jim-acc__title","metadata":{"role":"content","name":"accordion.info-title"}} -->
<h2 class="wp-block-heading jim-acc__title"><?php esc_html_e( 'Frequently asked questions', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-acc__desc","metadata":{"role":"content","name":"accordion.info-desc"}} -->
<p class="jim-acc__desc"><?php esc_html_e( 'Need help with something? Here are our most frequently asked questions.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-acc__list","metadata":{"name":"accordion.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-acc__list">
<!-- wp:group {"className":"jim-acc__item","metadata":{"name":"accordion.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-acc__item">
<!-- wp:heading {"level":3,"className":"jim-acc__q","metadata":{"role":"content","name":"accordion.accordion-name.1"}} -->
<h3 class="wp-block-heading jim-acc__q"><?php esc_html_e( 'A question?', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-acc__body","metadata":{"role":"content","name":"accordion.accordion-desc.1"}} -->
<p class="jim-acc__body"><?php esc_html_e( 'Its answer.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
