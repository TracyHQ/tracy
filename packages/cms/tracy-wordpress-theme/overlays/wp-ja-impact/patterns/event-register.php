<?php
/**
 * Title: Event register button
 * Slug: wp-ja-impact/event-register
 * Description: The Register button under an event (templates/single-event.html). Its link is the event's own registration address (the wp-ja-impact/gc binding, field event-link); the sign-in pages' registration form is the address written here for an editor that does not run the binding. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:buttons {"className":"jim-art__register"} -->
<div class="wp-block-buttons jim-art__register"><!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"bindings":{"url":{"source":"wp-ja-impact/gc","args":{"field":"event-link"}}}}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/pages/user/registration-form/' ) ); ?>"><?php echo esc_html__( 'Register', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
