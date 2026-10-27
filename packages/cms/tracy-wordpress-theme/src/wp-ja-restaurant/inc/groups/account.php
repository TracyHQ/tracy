<?php
/**
 * Account pages: a signed-out visitor who opens a profile page is sent to the Login page, as the source
 * does (Joomla answers 303 to the login menu item).
 *
 * @package wp-ja-restaurant
 */

add_action(
	'template_redirect',
	static function () {
		if ( is_user_logged_in() ) {
			return;
		}
		$request = trim( (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH ), '/' );
		// The three source routes with no WordPress equivalent (Submit an Article, Template Settings, Site Settings) also answer a
		// guest with the login redirect, as Joomla does; a signed-in visitor falls through to the seeded redirect to the home page.
		$is_guest_route = in_array( $request, array( 'submit-an-article', 'template-settings', 'site-settings' ), true );
		$is_profile     = in_array( $request, array( 'your-profile', 'explore/j-pages/user-profile', 'explore/j-pages/edit-profile' ), true )
			|| ( is_page() && 'page-account' === get_page_template_slug( get_queried_object_id() ) );
		if ( ! $is_profile && ! $is_guest_route ) {
			return;
		}
		$login = get_page_by_path( 'explore/j-pages/login' );
		if ( $login ) {
			// Joomla queues "Please login first" for the redirect of these four routes; a cookie carries it to the Login page (no query on the address).
			if ( in_array( $request, array( 'your-profile', 'submit-an-article', 'template-settings', 'site-settings' ), true ) ) {
				setcookie( 'jm_login_first', '1', array( 'expires' => time() + 300, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax' ) );
			}
			wp_safe_redirect( get_permalink( $login ), 303 );
			exit;
		}
	},
	1 // Before redirect_canonical (10) and the seeded redirects (10): the source answers 303 at `/your-profile` itself, not 301 to a slash first.
);

/**
 * The four forms the source answers with Joomla tasks are answered here by admin-post handlers:
 * registration, username reminder and the contact form. Each posts back with a nonce, does the work
 * with WordPress core, and returns to the page with ?jm_notice=<code> which the pattern prints.
 */
function wp_ja_restaurant_form_back( $page, $code ) {
	$url = add_query_arg( 'jm_notice', $code, home_url( '/' . trim( $page, '/' ) . '/' ) );
	wp_safe_redirect( $url, 303 );
	exit;
}

function wp_ja_restaurant_form_notice( $messages ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a display-only status code.
	$code = isset( $_GET['jm_notice'] ) ? sanitize_key( wp_unslash( $_GET['jm_notice'] ) ) : '';
	if ( '' === $code || ! isset( $messages[ $code ] ) ) {
		return '';
	}
	$class = 0 === strpos( $code, 'ok' ) ? 'alert-success' : 'alert-danger';
	return '<div class="alert ' . esc_attr( $class ) . '" role="status">' . esc_html( $messages[ $code ] ) . '</div>';
}

/**
 * The client behind the request, as a short keyed hash: the address of the connection (`REMOTE_ADDR`), never a forwarding
 * header, which a visitor can set to anything; an IPv6 client is its /64, an IPv4-mapped address its IPv4 self, and requests
 * with no usable address all share one bucket. The address itself is never stored.
 */
function wp_ja_restaurant_client_key(): string {
	$addr   = isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
	$packed = false !== filter_var( $addr, FILTER_VALIDATE_IP ) ? inet_pton( $addr ) : false;
	$client = 'unknown';
	if ( is_string( $packed ) && 16 === strlen( $packed ) ) {
		$mapped = 0 === strncmp( $packed, "\0\0\0\0\0\0\0\0\0\0\xff\xff", 12 );
		$client = bin2hex( $mapped ? substr( $packed, 12 ) : substr( $packed, 0, 8 ) );
	} elseif ( is_string( $packed ) ) {
		$client = bin2hex( $packed );
	}
	return substr( wp_hash( $client ), 0, 20 );
}

/**
 * Take one of `$limit` places of the current `$window`-second window for `$key` under the limiter `$name`, or say there is none.
 * Same mechanism as the contact limit below: a place is an option row whose NAME is the claim (`add_option()` adds a name once),
 * every writer stores the same value, and a store that cannot be written answers false, so a broken database stops the action
 * instead of removing the limit. The first place of a window sweeps the earlier windows of this limiter.
 *
 * @param string $name   The limiter (letters only): `remind_mail`, `remind_client`, `register_client`.
 * @param string $key    A hash naming what is counted (never an address or an email in clear).
 * @param int    $limit  Places per window.
 * @param int    $window Window length in seconds.
 * @return bool True when a place was taken.
 */
function wp_ja_restaurant_rate_reserve( string $name, string $key, int $limit, int $window ): bool {
	$slot_window = intdiv( time(), $window );
	$bucket      = 'jm_rate_' . $name . '_' . $slot_window . '_' . $key . '_';
	for ( $slot = 1; $slot <= $limit; $slot++ ) {
		if ( add_option( $bucket . $slot, '1', '', false ) ) {
			if ( 1 === $slot ) {
				wp_ja_restaurant_rate_sweep( $name, $slot_window );
			}
			return true;
		}
	}
	return false;
}

/** Drop the places of the windows of `$name` before `$window` (best effort, like the contact sweep). */
function wp_ja_restaurant_rate_sweep( string $name, int $window ): void {
	global $wpdb;
	if ( ! is_object( $wpdb ) ) {
		return;
	}
	$prefix = 'jm_rate_' . $name . '_';
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- option names by prefix; the options API has no such delete, and these rows are never read through its cache.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST(SUBSTRING_INDEX(SUBSTRING(option_name, %d), '_', 1) AS UNSIGNED) < %d",
			$wpdb->esc_like( $prefix ) . '%',
			strlen( $prefix ) + 1,
			$window
		)
	);
}

function wp_ja_restaurant_handle_register() {
	if ( ! isset( $_POST['jm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['jm_nonce'] ) ), 'jm_register' ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-token' );
	}
	if ( ! get_option( 'users_can_register' ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-closed' );
	}
	$f = isset( $_POST['jform'] ) && is_array( $_POST['jform'] ) ? wp_unslash( $_POST['jform'] ) : array();
	$name  = sanitize_text_field( isset( $f['name'] ) ? $f['name'] : '' );
	$login = sanitize_user( isset( $f['username'] ) ? $f['username'] : '', true );
	$mail  = sanitize_email( isset( $f['email1'] ) ? $f['email1'] : '' );
	$pass1 = isset( $f['password1'] ) ? (string) $f['password1'] : '';
	$pass2 = isset( $f['password2'] ) ? (string) $f['password2'] : '';
	$tos   = isset( $f['profile']['tos'] ) ? (string) $f['profile']['tos'] : '0';
	if ( '' === $name || '' === $login || ! is_email( $mail ) || strlen( $pass1 ) < 4 ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-fields' );
	}
	if ( $pass1 !== $pass2 ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-password' );
	}
	if ( '1' !== $tos ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-tos' );
	}
	if ( username_exists( $login ) || email_exists( $mail ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-exists' );
	}
	// An anonymous form that creates accounts: at most five an hour from one client.
	if ( ! wp_ja_restaurant_rate_reserve( 'register_client', wp_ja_restaurant_client_key(), 5, HOUR_IN_SECONDS ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-limit' );
	}
	$id = wp_insert_user(
		array(
			'user_login'   => $login,
			'user_pass'    => $pass1,
			'user_email'   => $mail,
			'display_name' => $name,
			'first_name'   => $name,
			'role'         => get_option( 'default_role', 'subscriber' ),
		)
	);
	if ( is_wp_error( $id ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'error-exists' );
	}
	if ( isset( $f['profile'] ) && is_array( $f['profile'] ) ) {
		foreach ( array( 'address1', 'address2', 'city', 'region', 'country', 'postal_code', 'phone', 'website', 'favoritebook', 'aboutme', 'dob' ) as $key ) {
			if ( isset( $f['profile'][ $key ] ) ) {
				update_user_meta( $id, 'jm_profile_' . $key, sanitize_textarea_field( $f['profile'][ $key ] ) );
			}
		}
	}
	wp_ja_restaurant_form_back( 'explore/j-pages/registration', 'ok' );
}
add_action( 'admin_post_nopriv_jm_register', 'wp_ja_restaurant_handle_register' );
add_action( 'admin_post_jm_register', 'wp_ja_restaurant_handle_register' );

function wp_ja_restaurant_handle_remind() {
	if ( ! isset( $_POST['jm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['jm_nonce'] ) ), 'jm_remind' ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/reminder', 'error-token' );
	}
	$mail = sanitize_email( isset( $_POST['email'] ) ? wp_unslash( $_POST['email'] ) : '' );
	if ( ! is_email( $mail ) ) {
		wp_ja_restaurant_form_back( 'explore/j-pages/reminder', 'error-fields' );
	}
	// One mail per address and five requests per client every ten minutes. Both places are taken before the account is looked up,
	// so a known and an unknown address cost the same, and the answer below is the same whether or not a mail went out: the form
	// can neither list accounts nor fill a mailbox.
	$window      = 10 * MINUTE_IN_SECONDS;
	$for_client  = wp_ja_restaurant_rate_reserve( 'remind_client', wp_ja_restaurant_client_key(), 5, $window );
	$for_address = $for_client && wp_ja_restaurant_rate_reserve( 'remind_mail', substr( wp_hash( strtolower( $mail ) ), 0, 20 ), 1, $window );
	$user        = $for_address ? get_user_by( 'email', $mail ) : false;
	if ( $user ) {
		/* translators: %s: site name */
		$subject = sprintf( __( 'Your username at %s', 'wp-ja-restaurant' ), wp_specialchars_decode( get_option( 'blogname' ), ENT_QUOTES ) );
		/* translators: 1: username 2: sign-in address */
		$body = sprintf( __( 'Your username is %1$s. You can sign in at %2$s', 'wp-ja-restaurant' ), $user->user_login, home_url( '/explore/j-pages/login/' ) );
		wp_mail( $mail, $subject, $body );
	}
	// The same answer whether or not the address is known, so the form cannot be used to list accounts.
	wp_ja_restaurant_form_back( 'explore/j-pages/reminder', 'ok' );
}
add_action( 'admin_post_nopriv_jm_remind', 'wp_ja_restaurant_handle_remind' );
add_action( 'admin_post_jm_remind', 'wp_ja_restaurant_handle_remind' );

/**
 * The Contact Form's fields as plain bounded strings, or null when one is missing, not a string,
 * empty, longer than the form allows, or (the address) not an email address. Nothing is cut to
 * fit: a value over its limit is refused, and the form's own `maxlength` keeps a person inside it.
 *
 * @param mixed $raw The unslashed `jform` value.
 * @return array{name:string,email:string,subject:string,message:string}|null
 */
function wp_ja_restaurant_contact_fields( $raw ): ?array {
	if ( ! is_array( $raw ) ) {
		return null;
	}
	$limits = array(
		'name'    => 60,
		'email'   => 254,
		'subject' => 200,
		'message' => 5000,
	);
	$out    = array();
	foreach ( $limits as $key => $max ) {
		$value = $raw[ 'contact_' . $key ] ?? null;
		if ( ! is_string( $value ) || mb_strlen( $value ) > $max ) {
			return null;
		}
		$value = 'message' === $key ? sanitize_textarea_field( $value ) : sanitize_text_field( $value );
		if ( '' === $value ) {
			return null;
		}
		$out[ $key ] = $value;
	}
	// The address must already be clean: one that only becomes an address after characters are dropped is refused.
	if ( ! is_email( $out['email'] ) || sanitize_email( $out['email'] ) !== $out['email'] ) {
		return null;
	}
	return $out;
}

/**
 * Take one of this hour's contact-mail places for the client behind the request, or say there is none.
 *
 * Both forms that mail the business (Contact and Quick Contact) spend the same five an hour.
 * The client is the address of the connection (`REMOTE_ADDR`), never a forwarding header, which a
 * visitor can set to anything; an IPv6 client is its /64, an IPv4-mapped address its IPv4 self,
 * and requests with no usable address all share one bucket.
 *
 * A place is an option row whose NAME is the claim: `add_option()` adds a name once and answers
 * false for a name that exists, so two requests cannot both hold the same place, and whatever the
 * row holds, its presence is what counts. Every writer stores the same value on purpose: core adds
 * with `INSERT … ON DUPLICATE KEY UPDATE`, which reports a change, and so a second winner, only
 * when the values differ. A store that cannot be written answers false as well, so a broken
 * database stops the mail instead of removing the limit.
 *
 * @return bool True when a place was taken and the message may be sent.
 */
function wp_ja_restaurant_contact_reserve(): bool {
	$addr   = isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
	$packed = false !== filter_var( $addr, FILTER_VALIDATE_IP ) ? inet_pton( $addr ) : false;
	$client = 'unknown';
	if ( is_string( $packed ) && 16 === strlen( $packed ) ) {
		$mapped = 0 === strncmp( $packed, "\0\0\0\0\0\0\0\0\0\0\xff\xff", 12 );
		$client = bin2hex( $mapped ? substr( $packed, 12 ) : substr( $packed, 0, 8 ) );
	} elseif ( is_string( $packed ) ) {
		$client = bin2hex( $packed );
	}
	// The hour is read when the place is taken, not when the request began: a request that waited
	// across the turn of the hour counts in the hour it is sent in.
	$window = intdiv( time(), HOUR_IN_SECONDS );
	// The stored name carries a keyed hash of the address, not the address.
	$bucket = 'jm_contact_rate_' . $window . '_' . substr( wp_hash( $client ), 0, 20 ) . '_';
	for ( $slot = 1; $slot <= 5; $slot++ ) {
		if ( add_option( $bucket . $slot, '1', '', false ) ) {
			if ( 1 === $slot ) {
				wp_ja_restaurant_contact_rate_sweep( $window );
			}
			return true;
		}
	}
	return false;
}

/**
 * Drop the places of hours BEFORE `$window`, so the counters never outgrow a few hours of visitors.
 * Only earlier hours: a request still holding an older hour must not remove places already taken
 * in a newer one. Best effort: a failed clean-up costs rows, never a message and never the limit.
 */
function wp_ja_restaurant_contact_rate_sweep( int $window ): void {
	global $wpdb;
	if ( ! is_object( $wpdb ) ) {
		return;
	}
	$prefix = 'jm_contact_rate_';
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- option names by prefix; the options API has no such delete, and these rows are never read through its cache.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST(SUBSTRING_INDEX(SUBSTRING(option_name, %d), '_', 1) AS UNSIGNED) < %d",
			$wpdb->esc_like( $prefix ) . '%',
			strlen( $prefix ) + 1,
			$window
		)
	);
}

/**
 * Where contact mail goes: the address the customer gave when the site was built (`tracy_contact_to`),
 * or the one a `tracy_contact_to` filter names, as in tracy-base. There is no fallback to the
 * site's admin address: on a site Tracy built that is Tracy's own mailbox, not the customer's.
 *
 * @return string The address, or '' when there is none.
 */
function wp_ja_restaurant_contact_to(): string {
	$to = get_option( 'tracy_contact_to' );
	$to = apply_filters( 'tracy_contact_to', is_string( $to ) && is_email( $to ) ? $to : '' );
	return is_string( $to ) && is_email( $to ) ? $to : '';
}

/**
 * The Contact Form mails the business's own address (`wp_ja_restaurant_contact_to()`), and nobody else.
 *
 * The source's "Send a copy to yourself" is not offered: the handler cannot know that the visitor
 * owns the address they typed, so a copy would let anyone send their own text from this site to
 * any address. The box is printed switched off and a posted flag is not read. The visitor's
 * address is used only as Reply-To, and their name only as far as it is letters, digits and
 * `. ' -`, so neither can add a header or a second address.
 */
function wp_ja_restaurant_handle_contact() {
	if ( ! isset( $_POST['jm_nonce'] ) || ! is_string( $_POST['jm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['jm_nonce'] ) ), 'jm_contact' ) ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-token' );
	}
	$raw = isset( $_POST['jform'] ) && is_array( $_POST['jform'] ) ? wp_unslash( $_POST['jform'] ) : null;
	if ( ! $raw ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-fields' );
	}
	// The trap field: a person never sees it, so it arrives empty. A form without it was printed before the trap existed.
	if ( ! array_key_exists( 'contact_url', $raw ) ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-token' );
	}
	if ( '' !== $raw['contact_url'] ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-send' );
	}
	$f = wp_ja_restaurant_contact_fields( $raw );
	if ( null === $f ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-fields' );
	}
	$to = wp_ja_restaurant_contact_to();
	if ( '' === $to ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-send' );
	}
	if ( ! wp_ja_restaurant_contact_reserve() ) {
		wp_ja_restaurant_form_back( 'contact/contact-us', 'error-send' );
	}
	$reply   = trim( (string) preg_replace( '/\s+/u', ' ', (string) preg_replace( '/[^\p{L}\p{N} .\'-]+/u', ' ', $f['name'] ) ) );
	$headers = array( 'Reply-To: ' . ( '' === $reply ? $f['email'] : $reply . ' <' . $f['email'] . '>' ) );
	$body    = $f['message'] . "\n\n" . $f['name'] . ' <' . $f['email'] . '>';
	$sent    = wp_mail( $to, $f['subject'], $body, $headers );
	wp_ja_restaurant_form_back( 'contact/contact-us', $sent ? 'ok' : 'error-send' );
}
add_action( 'admin_post_nopriv_jm_contact', 'wp_ja_restaurant_handle_contact' );
add_action( 'admin_post_jm_contact', 'wp_ja_restaurant_handle_contact' );

/**
 * Quick Contact (the JA Quick Contact module the source loads on Home Style 1 and 2).
 *
 * The form posts to an admin-post handler, never to the page's own address: its field names are
 * namespaced (`jm_qc[...]`) because a bare `name` field collides with WordPress's `name` query
 * variable and the post would answer with the 404 template. With JavaScript the form is sent
 * with fetch and answers in place (the typed text stays); without it the handler redirects back
 * with a short-lived copy of the non-secret fields so a failed send does not lose them.
 */
function wp_ja_restaurant_qc_messages(): array {
	return array(
		'ok-qc'          => __( 'Thank you. Your message has been sent.', 'wp-ja-restaurant' ),
		'error-qc-token' => __( 'The form expired. Please send it again.', 'wp-ja-restaurant' ),
		'error-qc-field' => __( 'Please fill in your name, a valid email address, a subject and a message.', 'wp-ja-restaurant' ),
		'error-qc-send'  => __( 'The message could not be sent. Please try again later.', 'wp-ja-restaurant' ),
	);
}

/**
 * The fields of the Quick Contact post, trimmed and bounded; every value is a plain string.
 *
 * @param mixed $raw The unslashed `jm_qc` value.
 * @return array{name:string,email:string,subject:string,text:string}
 */
function wp_ja_restaurant_qc_fields( $raw ): array {
	$raw    = is_array( $raw ) ? $raw : array();
	$take   = static function ( string $key, int $max, bool $multiline ) use ( $raw ): string {
		$value = isset( $raw[ $key ] ) && is_string( $raw[ $key ] ) ? $raw[ $key ] : '';
		$value = $multiline ? sanitize_textarea_field( $value ) : sanitize_text_field( $value );
		return mb_substr( trim( $value ), 0, $max );
	};
	return array(
		'name'    => $take( 'name', 60, false ),
		'email'   => $take( 'email', 64, false ),
		'subject' => $take( 'subject', 200, false ),
		'text'    => $take( 'text', 5000, true ),
	);
}

/**
 * The page the visitor came from, as a path under this site, or '' when it names no page.
 *
 * @return string
 */
function wp_ja_restaurant_qc_back_path(): string {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- read inside the handler after the nonce check, only to pick a redirect target.
	$raw  = isset( $_POST['jm_back'] ) && is_string( $_POST['jm_back'] ) ? wp_unslash( $_POST['jm_back'] ) : '';
	$path = trim( (string) wp_parse_url( $raw, PHP_URL_PATH ), '/' );
	return ( '' !== $path && url_to_postid( home_url( '/' . $path . '/' ) ) ) ? $path : '';
}

function wp_ja_restaurant_handle_quick_contact() {
	$ajax = isset( $_POST['jm_ajax'] ) && '1' === $_POST['jm_ajax'];
	$done = static function ( string $code, array $fields = array() ) use ( $ajax ) {
		$messages = wp_ja_restaurant_qc_messages();
		if ( $ajax ) {
			wp_send_json(
				array(
					'ok'      => 0 === strpos( $code, 'ok' ),
					'code'    => $code,
					'message' => $messages[ $code ],
				),
				0 === strpos( $code, 'ok' ) ? 200 : ( 'error-qc-send' === $code ? 502 : 422 )
			);
		}
		$path = wp_ja_restaurant_qc_back_path();
		$url  = add_query_arg( 'jm_notice', $code, home_url( '' === $path ? '/' : '/' . $path . '/' ) );
		if ( $fields ) {
			$token = strtolower( wp_generate_password( 12, false ) );
			set_transient( 'jm_qc_' . $token, $fields, 10 * MINUTE_IN_SECONDS );
			$url = add_query_arg( 'jm_qc', $token, $url );
		}
		wp_safe_redirect( $url . '#jm-quick-contact', 303 );
		exit;
	};
	if ( ! isset( $_POST['jm_nonce'] ) || ! is_string( $_POST['jm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['jm_nonce'] ) ), 'jm_quick_contact' ) ) {
		$done( 'error-qc-token', wp_ja_restaurant_qc_fields( isset( $_POST['jm_qc'] ) ? wp_unslash( $_POST['jm_qc'] ) : array() ) );
	}
	$f = wp_ja_restaurant_qc_fields( isset( $_POST['jm_qc'] ) ? wp_unslash( $_POST['jm_qc'] ) : array() );
	if ( '' === $f['name'] || ! is_email( $f['email'] ) || '' === $f['subject'] || '' === $f['text'] ) {
		$done( 'error-qc-field', $f );
	}
	// Refused before the hourly count, so no copy is kept: an unbounded number of requests could reach here.
	$to = wp_ja_restaurant_contact_to();
	if ( '' === $to ) {
		$done( 'error-qc-send' );
	}
	// The same hourly count as the Contact Form: this form mails the same address.
	if ( ! wp_ja_restaurant_contact_reserve() ) {
		$done( 'error-qc-send', $f );
	}
	$headers = array( 'Reply-To: ' . $f['name'] . ' <' . $f['email'] . '>' );
	$body    = $f['text'] . "\n\n" . $f['name'] . ' <' . $f['email'] . '>';
	$sent    = wp_mail( $to, $f['subject'], $body, $headers );
	$done( $sent ? 'ok-qc' : 'error-qc-send', $sent ? array() : $f );
}
add_action( 'admin_post_nopriv_jm_quick_contact', 'wp_ja_restaurant_handle_quick_contact' );
add_action( 'admin_post_jm_quick_contact', 'wp_ja_restaurant_handle_quick_contact' );

/**
 * The Quick Contact form as it is printed: fresh nonce, the page to return to, and the fields a
 * failed post left behind.
 *
 * @return string
 */
function wp_ja_restaurant_quick_contact_form(): string {
	$vals = array(
		'name'    => '',
		'email'   => '',
		'subject' => '',
		'text'    => '',
	);
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a display-only copy of a failed post.
	$token = isset( $_GET['jm_qc'] ) && is_string( $_GET['jm_qc'] ) && preg_match( '/^[a-z0-9]{12}$/', $_GET['jm_qc'] ) ? $_GET['jm_qc'] : '';
	// phpcs:enable
	if ( '' !== $token ) {
		$kept = get_transient( 'jm_qc_' . $token );
		if ( is_array( $kept ) ) {
			$vals = array_merge( $vals, array_intersect_key( array_map( 'strval', $kept ), $vals ) );
		}
	}
	$notice = wp_ja_restaurant_form_notice( wp_ja_restaurant_qc_messages() );
	$back   = (string) wp_parse_url( get_permalink( get_queried_object_id() ), PHP_URL_PATH );
	$e      = static fn( string $label ): string => esc_attr( $label );
	return '<form class="jm-quick-contact" id="jm-quick-contact" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" method="post" data-jm-quick-contact aria-label="' . esc_attr__( 'Quick contact', 'wp-ja-restaurant' ) . '">'
		. '<input type="hidden" name="action" value="jm_quick_contact"><input type="hidden" name="jm_nonce" value="' . esc_attr( wp_create_nonce( 'jm_quick_contact' ) ) . '"><input type="hidden" name="jm_back" value="' . esc_attr( $back ) . '">'
		. '<div class="jm-qc-status" role="status" aria-live="polite">' . $notice . '</div>'
		. '<p class="jm-field jm-field--half"><label for="jm-qc-name">' . esc_html__( 'Name', 'wp-ja-restaurant' ) . '</label><input id="jm-qc-name" type="text" name="jm_qc[name]" maxlength="60" value="' . esc_attr( $vals['name'] ) . '" placeholder="' . $e( __( 'Name', 'wp-ja-restaurant' ) ) . '"></p>'
		. '<p class="jm-field jm-field--half"><label for="jm-qc-email">' . esc_html__( 'Email', 'wp-ja-restaurant' ) . '</label><input id="jm-qc-email" type="email" name="jm_qc[email]" maxlength="64" value="' . esc_attr( $vals['email'] ) . '" placeholder="' . $e( __( 'Email', 'wp-ja-restaurant' ) ) . '"></p>'
		. '<p class="jm-field"><label for="jm-qc-subject">' . esc_html__( 'Subject', 'wp-ja-restaurant' ) . '</label><input id="jm-qc-subject" type="text" name="jm_qc[subject]" maxlength="200" value="' . esc_attr( $vals['subject'] ) . '" placeholder="' . $e( __( 'Subject', 'wp-ja-restaurant' ) ) . '"></p>'
		. '<p class="jm-field"><label for="jm-qc-text">' . esc_html__( 'Message', 'wp-ja-restaurant' ) . '</label><textarea id="jm-qc-text" name="jm_qc[text]" rows="3" maxlength="5000" placeholder="' . $e( __( 'Message', 'wp-ja-restaurant' ) ) . '">' . esc_textarea( $vals['text'] ) . '</textarea></p>'
		. '<p class="jm-field"><button type="submit" class="btn btn-primary jm-arrow">' . esc_html__( 'Send Email', 'wp-ja-restaurant' ) . '</button></p></form>';
}

/**
 * A seeded page keeps the form it was written with (a stored copy, stale nonce and a dead action):
 * every Quick Contact in the page is swapped for the live one when it is printed.
 */
add_filter(
	'render_block_core/html',
	static function ( string $content ): string {
		if ( false === strpos( $content, 'class="jm-quick-contact"' ) ) {
			return $content;
		}
		$swapped = preg_replace( '#<form class="jm-quick-contact".*?</form>#s', '__JM_QC__', $content );
		return null === $swapped ? $content : str_replace( '__JM_QC__', wp_ja_restaurant_quick_contact_form(), $swapped );
	}
);

/**
 * The sign-in module's "Create an account" link leads to a form; with registration closed it would
 * lead to a dead end, so the link is not printed then.
 */
add_filter(
	'render_block_core/list-item',
	static function ( string $content ): string {
		if ( get_option( 'users_can_register' ) || false === strpos( $content, '/explore/j-pages/registration/' ) ) {
			return $content;
		}
		return '';
	}
);

/**
 * The seeded content of the four account pages is a bare sign-in block. The page shows the form the
 * source shows: the pattern that belongs to the page address replaces it when nothing else was written.
 */
add_filter(
	'the_content',
	static function ( $content ) {
		if ( ! is_page() || ! is_main_query() ) {
			return $content;
		}
		$path = trim( (string) get_page_uri( get_queried_object_id() ), '/' );
		$map  = array(
			'explore/j-pages/login'            => 'wp-ja-restaurant/account-login',
			'explore/j-pages/registration'     => 'wp-ja-restaurant/account-register',
			'explore/j-pages/reset-password'   => 'wp-ja-restaurant/account-reset',
			'explore/j-pages/reminder'         => 'wp-ja-restaurant/account-remind',
			'contact/contact-us'               => 'wp-ja-restaurant/contact-form',
		);
		if ( in_array( $path, array( 'contact/phone-reservation', 'explore/j-pages/category-blog' ), true ) ) {
			return wp_ja_restaurant_frame_article( $content );
		}
		if ( ! isset( $map[ $path ] ) ) {
			return $content;
		}
		$slot = '<!-- wp:pattern {"slug":"' . $map[ $path ] . '"} /-->';
		if ( 'contact/contact-us' === $path ) {
			// The seeded page is the map, the Subscribe section and a form shortcode; the source draws the form body between the map and Subscribe.
			$content = (string) preg_replace( '#<!-- wp:shortcode -->.*?<!-- /wp:shortcode -->#s', '', $content );
			$cut     = strpos( $content, '<!-- /wp:html -->' );
			if ( false !== $cut ) {
				$cut    += strlen( '<!-- /wp:html -->' );
				$content = substr( $content, 0, $cut ) . "\n" . $slot . "\n" . substr( $content, $cut );
			}
			return $content;
		}
		// The seeded page holds the masthead, a bare sign-in block and Subscribe: only the sign-in block is replaced.
		$swapped = preg_replace( '#<!-- wp:loginout[^>]*/-->#', $slot, $content, 1, $count );
		return $count ? (string) $swapped : $content;
	},
	8
);

/**
 * The article body of a page the source draws inside its main frame (`#t3-mainbody > .row > #t3-content > .item-page > article`).
 * The seeded page keeps only the blocks between the masthead and the Subscribe section, so this puts the frame back around them.
 * It finds the end of the masthead group by counting group blocks, and the start of Subscribe by its class.
 *
 * @param string $content Raw block markup of the page.
 * @return string Markup with the frame blocks added, or the input when the page has no masthead or no Subscribe section.
 */
function wp_ja_restaurant_frame_article( string $content ): string {
	$start = strpos( $content, '"anchor":"acm-masthead-' );
	$end   = strpos( $content, '<!-- wp:group {"className":"t3-section-module mod-subscribe' );
	if ( false === $start || false === $end ) {
		return $content;
	}
	$start = (int) strrpos( substr( $content, 0, $start ), '<!-- wp:group' );
	$depth = 0;
	$pos   = $start;
	while ( preg_match( '#<!-- (/?)wp:group[ >]|<!-- (/)wp:group -->#', $content, $m, PREG_OFFSET_CAPTURE, $pos ) ) {
		$tag = $m[0][0];
		$pos = $m[0][1] + strlen( $tag );
		if ( false !== strpos( $tag, '<!-- /wp:group' ) ) {
			--$depth;
		} else {
			++$depth;
		}
		if ( 0 === $depth ) {
			break;
		}
	}
	if ( 0 !== $depth ) {
		return $content;
	}
	$close = (int) strpos( $content, '-->', $pos ) + 3;
	if ( $close > $end ) {
		return $content;
	}
	$open = '<!-- wp:html -->' . "\n" . '<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jr-content col-xs-12"><div class="item-page clearfix"><article><section class="article-content clearfix">' . "\n" . '<!-- /wp:html -->' . "\n";
	$shut = "\n" . '<!-- wp:html -->' . "\n" . '</section></article></div></div></div></div>' . "\n" . '<!-- /wp:html -->' . "\n";
	// The source draws these three calls to action as buttons; the seeded blocks hold them as paragraphs with a bare link.
	$body = trim( substr( $content, $close, $end - $close ) );
	$body = (string) preg_replace( '#<p><a href="([^"]+)">((?:Menu for Lunch|Menu for Dinner))</a></p>#', '<a href="$1" class="btn btn-primary">$2</a>', $body );
	$body = (string) preg_replace( '#<p><a href="(tel:[^"]+)">(Call Now)</a></p>#', '<a href="$1" class="btn btn-primary btn-lg">$2</a>', $body );
	return substr( $content, 0, $close ) . "\n" . $open . $body . $shut . substr( $content, $end );
}

/**
 * The masthead description. The source prints the masthead module's default description
 * (mod_jamasthead `default-description`) under the title of every page that has a masthead. The
 * core excerpt block would print the first words of the page body instead, so a page with no
 * excerpt of its own gets that constant text; a hand-written excerpt still wins.
 */
function wp_ja_restaurant_masthead_description(): string {
	return __( 'Quisque dolor fringilla semper, libero hendrerit allis, magna augue putate nibh ucibus enim eros acumin arcu', 'wp-ja-restaurant' );
}

add_filter(
	'get_the_excerpt',
	static function ( $excerpt, $post ) {
		// The typography page was seeded with its own first words as the excerpt; the source prints the module description there.
		if ( ! $post || 'page' !== $post->post_type || ( '' !== trim( (string) $post->post_excerpt ) && 'typography' !== $post->post_name ) ) {
			return $excerpt;
		}
		return wp_ja_restaurant_masthead_description();
	},
	25,
	2
);

/**
 * The source prints the masthead description as bare text in its `div`; the core excerpt block wraps
 * it in a `p`. Drop that wrapper for the masthead description only, so both sites draw the same element.
 */
add_filter(
	'render_block_core/post-excerpt',
	static function ( string $html, array $block ): string {
		if ( ! str_contains( (string) ( $block['attrs']['className'] ?? '' ), 'ja-masthead-description' ) ) {
			return $html;
		}
		return (string) preg_replace( '#<p class="wp-block-post-excerpt__excerpt">(.*?)</p>#s', '$1', $html, 1 );
	},
	20,
	2
);

/**
 * The search page (templates/search.html) has no post, so its masthead picture is the media
 * library's masthead image, the one every other page's masthead carries as its featured image.
 */
add_filter(
	'render_block_core/cover',
	static function ( string $content, array $block ): string {
		if ( 'search.masthead' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
			return $content;
		}
		$found = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'name'           => 'bg_masthead',
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
		if ( ! $found ) {
			return $content;
		}
		$img = wp_get_attachment_image( (int) $found[0], 'full', false, array( 'class' => 'wp-block-cover__image-background', 'alt' => '', 'data-object-fit' => 'cover' ) );
		return (string) preg_replace( '/(<span aria-hidden="true" class="wp-block-cover__background[^>]*><\/span>)/', '${1}' . $img, $content, 1 );
	},
	10,
	2
);

/**
 * Header info row (Call Us / Email Us / Open Hours). The source draws it only in the header of the
 * second home style, so the block stays out of every other page's markup.
 */
add_filter(
	'render_block_core/group',
	static function ( string $content, array $block ): string {
		if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jm-head-info' ) ) {
			return $content;
		}
		return is_page() && 'home-style-2' === get_post_field( 'post_name', get_queried_object_id() ) ? $content : '';
	},
	10,
	2
);

/**
 * The one-time "Please login first" message of the source's Login page. The cookie set by the guest redirect is read and expired
 * before any output; the Login pattern prints the message through wp_ja_restaurant_login_first_notice().
 */
add_action(
	'template_redirect',
	static function () {
		if ( empty( $_COOKIE['jm_login_first'] ) ) {
			return;
		}
		$GLOBALS['wp_ja_restaurant_login_first'] = true;
		setcookie( 'jm_login_first', '', array( 'expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax' ) );
		unset( $_COOKIE['jm_login_first'] );
		nocache_headers();
	},
	5
);

function wp_ja_restaurant_login_first_notice(): string {
	if ( empty( $GLOBALS['wp_ja_restaurant_login_first'] ) ) {
		return '';
	}
	return '<div id="system-message-container" aria-live="polite"><div class="jm-system-message jm-system-message--danger" role="alert">' . esc_html__( 'Please login first', 'wp-ja-restaurant' ) . '<button type="button" class="jm-system-message__close" aria-label="' . esc_attr__( 'Close', 'wp-ja-restaurant' ) . '"><span aria-hidden="true">&times;</span></button></div></div>';
}
