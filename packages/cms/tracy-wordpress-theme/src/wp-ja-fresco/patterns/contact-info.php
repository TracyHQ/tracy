<?php
/**
 * Title: Contact details
 * Slug: wp-ja-fresco/contact-info
 * Description: The left column of the JA Fresco Contact page: the heading, a line of text and the email, address and phone with their icons (the source's com_contact record).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: contact, address, email, phone
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"className":"jf-contact-info area-info","metadata":{"name":"contact.info"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-contact-info area-info">
<!-- wp:heading {"className":"jf-contact-heading","metadata":{"name":"contact.heading"}} -->
<h2 class="wp-block-heading jf-contact-heading"><?php echo wp_kses( __( 'Have question?<br>Get in touch!', 'wp-ja-fresco' ), array( 'br' => array() ) ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"contact-misc","metadata":{"name":"contact.text"}} -->
<p class="contact-misc"><?php esc_html_e( 'There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by injected humour, or randomised words which don\'t look even slightly believable.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"contact-address","layout":{"type":"default"}} -->
<div class="wp-block-group contact-address">
<!-- wp:group {"className":"contact-item","metadata":{"name":"contact.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group contact-item">
<!-- wp:html -->
<span class="fa fa-envelope-o icon" aria-hidden="true"></span>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Write email', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"txt contact-emailto"} -->
<p class="txt contact-emailto"><a href="mailto:needhelp@company.com">needhelp@company.com</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"contact-item","metadata":{"name":"contact.item.2"},"layout":{"type":"default"}} -->
<div class="wp-block-group contact-item">
<!-- wp:html -->
<span class="fa fa-map-marker icon" aria-hidden="true"></span>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Visit office', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"txt contact-street"} -->
<p class="txt contact-street"><?php esc_html_e( '2715 Ash Dr. San Jose, South Dakota 83475', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"contact-item","metadata":{"name":"contact.item.3"},"layout":{"type":"default"}} -->
<div class="wp-block-group contact-item">
<!-- wp:html -->
<span class="fa fa-phone-square icon" aria-hidden="true"></span>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Mobile', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"txt contact-mobile"} -->
<p class="txt contact-mobile"><?php esc_html_e( 'Free +92 (8800) 6802', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
