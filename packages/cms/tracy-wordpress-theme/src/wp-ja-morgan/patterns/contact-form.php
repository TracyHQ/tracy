<?php
/**
 * Title: Contact form
 * Slug: wp-ja-morgan/contact-form
 * Description: The Contact Form of the JA Morgan Contact page: name and email side by side, subject, message, a copy-to-yourself box that is switched off, and the Send Email button. It posts to a handler in the theme that mails the business's own address (`tracy_contact_to`) only.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: contact, form, email
 *
 * @package wp-ja-morgan
 */

$jm_notice = function_exists( 'wp_ja_morgan_form_notice' ) ? wp_ja_morgan_form_notice(
	array(
		'ok'           => __( 'Thank you for your message. It has been sent.', 'wp-ja-morgan' ),
		'error-token'  => __( 'The form expired. Please try again.', 'wp-ja-morgan' ),
		'error-fields' => __( 'Please fill in every field with an asterisk (*).', 'wp-ja-morgan' ),
		'error-send'   => __( 'The message could not be sent. Please try again later.', 'wp-ja-morgan' ),
	)
) : '';
?>
<!-- wp:html {"metadata":{"name":"contact.form"}} -->
<div class="jm-contact-form"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built and escaped by wp_ja_morgan_form_notice(). ?><form id="contact-form" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="form-validate form-horizontal"><input type="hidden" name="action" value="jm_contact"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_contact' ) ); ?>"><div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><input type="text" name="jform[contact_url]" value="" tabindex="-1" autocomplete="off"></div><fieldset><legend><?php esc_html_e( 'Send an Email. All fields with an asterisk (*) are required.', 'wp-ja-morgan' ); ?></legend><div class="form-group"><div class="col-sm-6 contact-name"><label for="jform_contact_name" class="required control-label"><?php esc_html_e( 'Name', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label><input type="text" name="jform[contact_name]" id="jform_contact_name" class="form-control" size="30" maxlength="60" required autocomplete="name" placeholder="<?php esc_attr_e( 'Name', 'wp-ja-morgan' ); ?>"></div><div class="col-sm-6 contact-email"><label for="jform_contact_email" class="required control-label"><?php esc_html_e( 'Email', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label><input type="email" inputmode="email" name="jform[contact_email]" id="jform_contact_email" class="form-control" size="30" maxlength="254" required autocomplete="email" placeholder="<?php esc_attr_e( 'Email', 'wp-ja-morgan' ); ?>"></div></div><div class="form-group"><div class="col-sm-12"><label for="jform_contact_emailmsg" class="required control-label"><?php esc_html_e( 'Subject', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label><input type="text" name="jform[contact_subject]" id="jform_contact_emailmsg" class="form-control" size="60" maxlength="200" required placeholder="<?php esc_attr_e( 'Subject', 'wp-ja-morgan' ); ?>"></div></div><div class="form-group contact-mes"><div class="col-sm-12"><label for="jform_contact_message" class="required control-label"><?php esc_html_e( 'Message', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label><textarea name="jform[contact_message]" id="jform_contact_message" cols="50" rows="10" maxlength="5000" class="form-control" required placeholder="<?php esc_attr_e( 'Message', 'wp-ja-morgan' ); ?>"></textarea></div></div><div class="form-group"><div class="col-sm-12"><div class="checkbox"><input type="checkbox" id="jform_contact_email_copy" class="form-check-input" disabled><label for="jform_contact_email_copy"><?php esc_html_e( 'Send a copy to yourself', 'wp-ja-morgan' ); ?></label></div></div><div class="col-sm-12 control-btn"><button class="btn btn-primary validate" type="submit"><?php esc_html_e( 'Send Email', 'wp-ja-morgan' ); ?> <span class="icon ion-ios-arrow-round-forward" aria-hidden="true"></span></button></div></div></fieldset></form></div>
<!-- /wp:html -->
