<?php
/**
 * wp-ja-kinetic — the Contact page's two mailboxes, read from the site and never from the theme.
 *
 * - The mailbox the page SHOWS (`blocks/kinetic-contact-form/render.php`, the info column): the
 *   site's public contact address, `contact.email` of the option `tracy_site_identity` — the option
 *   the WordPress themes here read a site's public contact details from (wp-tracy-business's
 *   `inc/identity.php`, spec `tasks/spec-danh-tinh-site-wordpress.md`). Up to 1.1.5 the block
 *   printed the JA Kinetic demo company's three mailboxes as literals, which no content write could
 *   reach, so a site filled by Apply still invited visitors to write to another company (ledger
 *   L17, 05/10/2026). No address given → the page shows none: a demo address is worse than an empty
 *   column, because a visitor writes to it.
 * - The mailbox the form SENDS to (`wp_ja_kinetic_contact_submit()` in inc/extra.php): the
 *   recipient the site was given, option `tracy_contact_to` (the one the source theme's own contact
 *   handler reads, with the filter of the same name), else the public address above, else the
 *   site administrator's address `admin_email` (product decision, 05/10/2026). On a site Tracy
 *   installs that is Tracy's default mailbox: a message that cannot be delivered is worse than one
 *   delivered to the administrator, so a visitor's message never fails only because no recipient
 *   was configured. (1.1.6 as first merged refused to send without a configured recipient; the
 *   quickstart demo is such a site.) The page never shows `admin_email`, a demo address or the
 *   recipient: what it prints is the site's own public address, or nothing.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The site's public contact mailbox, or '' when it gave none. Reads both shapes the identity option
 * is written in: nested groups (`['contact' => ['email' => …]]`) and flat dotted keys
 * (`['contact.email' => …]`).
 */
function wp_ja_kinetic_contact_email(): string {
	$identity = get_option( 'tracy_site_identity' );
	if ( ! is_array( $identity ) ) {
		return '';
	}
	$email = $identity['contact']['email'] ?? $identity['contact.email'] ?? '';
	$email = is_string( $email ) ? trim( $email ) : '';
	return '' !== $email && is_email( $email ) ? $email : '';
}

/**
 * Where the Contact form's mail goes: `tracy_contact_to`, else the public contact mailbox, else the
 * administrator's `admin_email`. '' only when every one of them is missing or not an address, in
 * which case the handler reports the send as failed.
 */
function wp_ja_kinetic_contact_recipient(): string {
	$to = get_option( 'tracy_contact_to' );
	if ( ! is_string( $to ) || ! is_email( $to ) ) {
		$to = wp_ja_kinetic_contact_email();
	}
	if ( '' === $to ) {
		$to = get_option( 'admin_email' );
	}
	$to = apply_filters( 'tracy_contact_to', $to );
	return is_string( $to ) && is_email( $to ) ? $to : '';
}
