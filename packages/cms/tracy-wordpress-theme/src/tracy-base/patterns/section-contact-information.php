<?php
/**
 * Title: Contact information
 * Slug: tracy-base/section-contact-information
 * Description: Heading, an email label, the address and a notice — the Joomla ACM block `contact-information`. The address is plain text, not a mailto link, exactly as the source renders a demo address; the source's four social fields are never rendered there and are not carried.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: contact, email, address, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-contact-information py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-contact-information py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"acm-contact-information__details max-w-page mx-auto"} -->
<div class="wp-block-group acm-contact-information__details max-w-page mx-auto">
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"contact-information.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'Contact information', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"contact-information.email-label"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Email · demo address', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-contact-information__email font-display text-xl mb-4","metadata":{"role":"content","name":"contact-information.email"}} -->
<p class="acm-contact-information__email font-display text-xl mb-4"><?php esc_html_e( 'hello@tracy-base.example', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-contact-information__notice tracy-meta max-w-[62ch] mb-0","metadata":{"role":"content","name":"contact-information.notice"}} -->
<p class="acm-contact-information__notice tracy-meta max-w-[62ch] mb-0"><?php esc_html_e( 'This is a demonstration contact page. Replace the recipient email and business details before enabling enquiries for your own website.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
