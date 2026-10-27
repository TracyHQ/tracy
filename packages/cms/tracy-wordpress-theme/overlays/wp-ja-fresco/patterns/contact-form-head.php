<?php
/**
 * Title: Contact form heading
 * Slug: wp-ja-fresco/contact-form-head
 * Description: The heading and lead line above the form on the JA Fresco Contact page.
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: contact, form, heading
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"className":"title-lead","metadata":{"name":"contact.form-heading"},"layout":{"type":"default"}} -->
<div class="wp-block-group title-lead">
<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'Always here to help you', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Write a Message', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
