<?php
/**
 * Title: Accordion
 * Slug: tracy-base/section-accordion
 * Description: Eyebrow, heading and a list of questions that open one at a time — the Joomla ACM block `accordion`. Native details/summary, no script: the first entry starts open (`first-open`) and all entries share a `name`, so opening one closes the others (`one-at-a-time`).
 * Categories: tracy-base, tracy
 * Block Types: core/details
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: accordion, faq, questions, details, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section tracy-section--band tracy-faq acm-accordion bg-surface border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section tracy-section--band tracy-faq acm-accordion bg-surface border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"accordion.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Questions', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-0","metadata":{"role":"content","name":"accordion.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-0"><?php esc_html_e( 'Before you commit', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-faq__list max-w-[62ch] border-b border-border-soft"} -->
<div class="wp-block-group tracy-faq__list max-w-[62ch] border-b border-border-soft">
<!-- wp:details {"showContent":true,"name":"acm-accordion","className":"tracy-faq__item border-t border-border-soft py-4 m-0","metadata":{"role":"content","name":"accordion.item.1"}} -->
<details class="wp-block-details tracy-faq__item border-t border-border-soft py-4 m-0" name="acm-accordion" open><summary><?php esc_html_e( 'Where does a website project start?', 'tracy-base' ); ?></summary><!-- wp:paragraph {"className":"mt-3 mb-0 text-fg-2","metadata":{"role":"content","name":"accordion.entry-answer.1"}} -->
<p class="mt-3 mb-0 text-fg-2"><?php esc_html_e( 'Start with the audience, the main offer and the questions customers ask. These shape the brief and page plan.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
<!-- wp:details {"name":"acm-accordion","className":"tracy-faq__item border-t border-border-soft py-4 m-0","metadata":{"role":"content","name":"accordion.item.2"}} -->
<details class="wp-block-details tracy-faq__item border-t border-border-soft py-4 m-0" name="acm-accordion"><summary><?php esc_html_e( 'Can our team update the content?', 'tracy-base' ); ?></summary><!-- wp:paragraph {"className":"mt-3 mb-0 text-fg-2","metadata":{"role":"content","name":"accordion.entry-answer.2"}} -->
<p class="mt-3 mb-0 text-fg-2"><?php esc_html_e( 'The demo uses editable WordPress pages and blocks. Your team can replace words, images, links and section content through the admin.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
<!-- wp:details {"name":"acm-accordion","className":"tracy-faq__item border-t border-border-soft py-4 m-0","metadata":{"role":"content","name":"accordion.item.3"}} -->
<details class="wp-block-details tracy-faq__item border-t border-border-soft py-4 m-0" name="acm-accordion"><summary><?php esc_html_e( 'What do we need to prepare?', 'tracy-base' ); ?></summary><!-- wp:paragraph {"className":"mt-3 mb-0 text-fg-2","metadata":{"role":"content","name":"accordion.entry-answer.3"}} -->
<p class="mt-3 mb-0 text-fg-2"><?php esc_html_e( 'Bring your service information, brand assets and photographs you have permission to use. Agree who will review and approve the content.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
<!-- wp:details {"name":"acm-accordion","className":"tracy-faq__item border-t border-border-soft py-4 m-0","metadata":{"role":"content","name":"accordion.item.4"}} -->
<details class="wp-block-details tracy-faq__item border-t border-border-soft py-4 m-0" name="acm-accordion"><summary><?php esc_html_e( 'Can you work with an existing website?', 'tracy-base' ); ?></summary><!-- wp:paragraph {"className":"mt-3 mb-0 text-fg-2","metadata":{"role":"content","name":"accordion.entry-answer.4"}} -->
<p class="mt-3 mb-0 text-fg-2"><?php esc_html_e( 'An existing site can provide useful content and evidence about the customer journey. Review what to keep before deciding what to change.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
<!-- wp:details {"name":"acm-accordion","className":"tracy-faq__item border-t border-border-soft py-4 m-0","metadata":{"role":"content","name":"accordion.item.5"}} -->
<details class="wp-block-details tracy-faq__item border-t border-border-soft py-4 m-0" name="acm-accordion"><summary><?php esc_html_e( 'How are scope and pricing agreed?', 'tracy-base' ); ?></summary><!-- wp:paragraph {"className":"mt-3 mb-0 text-fg-2","metadata":{"role":"content","name":"accordion.entry-answer.5"}} -->
<p class="mt-3 mb-0 text-fg-2"><?php esc_html_e( 'Confirm the deliverables, responsibilities and support needed for your project. The plans on this demo are illustrative examples.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
